import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { renderToBuffer } from "@react-pdf/renderer";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole, isFullAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import {
  InvestorReportPDF,
  type InvestorReportData,
} from "@/components/billing/investor-report-pdf";
import { calcularSaldoCredito } from "@/lib/investor-credit-balance";
import { isMesEncerrado } from "@/lib/mes-encerrado";
import {
  applyInvestorDebitsToPayable,
  cancelInvestorDebit,
} from "@/lib/investor-debits";

export const runtime = "nodejs";

const MES_LABELS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

/**
 * POST /api/plants/[id]/monthly-report/generate?ano=2026&mes=4[&publish=1]
 *
 * Modo PREVIEW (default, sem `publish=1`):
 *  - Se existir relatorio PUBLISHED + snapshot: renderiza o PDF a partir do
 *    snapshot (imutavel — nao recalcula).
 *  - Senao: recalcula tudo, salva como DRAFT, renderiza PDF dos dados frescos.
 *
 * Modo PUBLISH (com `publish=1`):
 *  - Recalcula tudo, salva como PUBLISHED + snapshot + publishedAt + autor.
 *  - Falha (409) se ja estiver PUBLISHED — exige reverter primeiro.
 *  - Falha (403) se mes encerrado e role != ADMIN.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id: plantId } = await params;
  const { searchParams } = new URL(req.url);
  const ano = Number(searchParams.get("ano"));
  const mes = Number(searchParams.get("mes"));
  const isPublish = searchParams.get("publish") === "1";

  if (!Number.isInteger(ano) || !Number.isInteger(mes) || mes < 1 || mes > 12) {
    return NextResponse.json(
      { error: "Parâmetros ano e mes (1-12) são obrigatórios" },
      { status: 400 },
    );
  }

  const plant = await prisma.plant.findUnique({
    where: { id: plantId },
    select: {
      id: true,
      name: true,
      numeroUsina: true,
      dataAssinaturaContrato: true,
      investors: {
        select: {
          id: true,
          valorKwhContrato: true,
          gestaoFixaContrato: true,
          investor: {
            select: {
              id: true,
              cpf: true,
              cnpj: true,
              user: { select: { name: true, email: true } },
            },
          },
        },
      },
    },
  });
  if (!plant) {
    return NextResponse.json({ error: "Usina não encontrada" }, { status: 404 });
  }

  const investorLink = plant.investors[0];
  if (!investorLink) {
    return NextResponse.json(
      { error: "Esta usina não possui investidor vinculado." },
      { status: 400 },
    );
  }

  const existing = await prisma.monthlyReport.findFirst({
    where: {
      plantId,
      investorId: investorLink.investor.id,
      ano,
      mes,
    },
    select: {
      id: true,
      status: true,
      snapshotJson: true,
    },
  });

  // Caminho rapido: relatorio ja PUBLISHED com snapshot — renderiza imutavel.
  if (
    existing &&
    existing.status !== "DRAFT" &&
    existing.snapshotJson &&
    !isPublish
  ) {
    const data = JSON.parse(existing.snapshotJson) as InvestorReportData;
    const buf = await renderToBuffer(InvestorReportPDF({ data }));
    const filename = `relatorio-investidor-${plant.numeroUsina ?? plant.id.slice(0, 8)}-${String(mes).padStart(2, "0")}-${ano}.pdf`;
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-Report-Id": existing.id,
        "X-Report-Status": existing.status,
      },
    });
  }

  // Tentativa de re-publicar relatorio ja publicado: bloqueia.
  if (existing && existing.status !== "DRAFT" && isPublish) {
    return NextResponse.json(
      {
        error:
          "Relatório já publicado. Reverta a publicação antes de re-publicar.",
      },
      { status: 409 },
    );
  }

  // Mes encerrado: bloqueia recalc/save (preview ou publish) pra nao-ADMIN.
  // ADMIN ignora essa trava — pode preview/publicar mesmo em mes encerrado.
  if (
    !isFullAdmin(session.user.role) &&
    (await isMesEncerrado(plantId, ano, mes))
  ) {
    return NextResponse.json(
      {
        error:
          "Mês encerrado (comprovante anexado). Apenas ADMIN pode recalcular ou publicar — peça reabertura.",
      },
      { status: 403 },
    );
  }

  // CANCEL ANTES DO COMPUTE (apenas no publish): se ja existem debitos deste
  // relatorio, cancela primeiro pra estado limpo. cancelInvestorDebit reverte
  // applications nas payables que receberam abate. Sem essa ordem, o compute
  // veria valorLiquido amortizado por debit antigo, levando a doubling.
  if (isPublish) {
    const motivoPrefixoCleanup = `Saldo negativo do relatorio ${MES_LABELS[mes - 1]}/${ano}`;
    const debitosExistentes = await prisma.investorDebit.findMany({
      where: {
        investorId: investorLink.investor.id,
        motivo: { startsWith: motivoPrefixoCleanup },
        status: { not: "CANCELADO" },
      },
      select: { id: true, motivo: true, valorOriginal: true, status: true },
    });
    console.log(
      `[publish] plant=${plantId} ${mes}/${ano}: encontrei ${debitosExistentes.length} debito(s) a cancelar (pre-compute)`,
      debitosExistentes,
    );
    for (const d of debitosExistentes) {
      try {
        await cancelInvestorDebit(d.id, "Republicacao do relatorio");
        console.log(`[publish] cancelInvestorDebit OK pra ${d.id}`);
      } catch (e) {
        console.error(
          `[publish] cancelInvestorDebit FALHOU pra ${d.id}:`,
          e,
        );
        return NextResponse.json(
          {
            error: `Falha ao cancelar débito anterior ${d.id}: ${e instanceof Error ? e.message : String(e)}`,
          },
          { status: 500 },
        );
      }
    }
  }

  // É o PRIMEIRO relatório da usina? Definição ancorada nos dados (não em quantos
  // PDFs foram gerados): primeiro relatório = não existe nenhum payable cuja
  // competência (mês de geração) seja ANTERIOR à atual.
  const earlierPayable = await prisma.investorPayable.findFirst({
    where: {
      plantId,
      originatedByPlantBill: {
        OR: [
          { anoReferencia: { lt: ano } },
          {
            AND: [
              { anoReferencia: ano },
              { mesReferencia: { lt: mes } },
            ],
          },
        ],
      },
    },
    select: { id: true },
  });
  const isPrimeiroRelatorio = !earlierPayable;

  // Busca em paralelo: fatura da UC da usina + payables do investidor no período + saldo acumulado.
  const [billUsina, payables, saldoCredito] = await Promise.all([
    prisma.consumerBill.findFirst({
      where: { plantId, anoReferencia: ano, mesReferencia: mes, consumerUnitId: null },
      orderBy: { syncedAt: "desc" },
      select: {
        energiaInjetadaMedidorKwh: true,
        valorTotal: true,
      },
    }),
    prisma.investorPayable.findMany({
      // Mesma logica da pagina: ORIGEM=mes OU DISPLAY=mes pra naturals,
      // mais saldo lines com display=mes. Reflete cash flow real do mes.
      where: {
        investorId: investorLink.investor.id,
        plantId,
        OR: [
          {
            carriedFromPayableId: null,
            originatedByPlantBill: { anoReferencia: ano, mesReferencia: mes },
          },
          {
            carriedFromPayableId: null,
            anoReferencia: ano,
            mesReferencia: mes,
          },
          {
            carriedFromPayableId: { not: null },
            anoReferencia: ano,
            mesReferencia: mes,
          },
        ],
      },
      select: {
        consumerUnitId: true,
        status: true,
        kwhCompensadoBase: true,
        kwhCompensadoAjuste: true,
        kwhCreditoLegadoAbatido: true,
        valorBruto: true,
        valorAjuste: true,
        valorAbatidoDebito: true,
        valorLiquido: true,
        valorKwhContrato: true,
        consumerUnit: {
          select: { codigoUc: true, nome: true },
        },
        anoReferencia: true,
        mesReferencia: true,
        carriedFromPayableId: true,
        originatedByPlantBill: {
          select: { anoReferencia: true, mesReferencia: true },
        },
        carriedFromPayable: {
          select: {
            anoReferencia: true,
            mesReferencia: true,
            originatedByPlantBill: {
              select: { anoReferencia: true, mesReferencia: true },
            },
          },
        },
      },
    }),
    calcularSaldoCredito({
      plantId,
      investorId: investorLink.investor.id,
      ano,
      mes,
    }),
  ]);

  // sumKwhBruto: kWh compensados na fatura do consumidor (físico, antes do cap)
  // sumKwhRemuneravel: kWh efetivamente remunerados (bruto − legado abatido)
  const sumKwhBruto = (arr: typeof payables) =>
    arr.reduce(
      (s, p) => s + (p.kwhCompensadoBase ?? 0) + (p.kwhCompensadoAjuste ?? 0),
      0,
    );
  const sumKwhRemuneravel = (arr: typeof payables) =>
    arr.reduce(
      (s, p) =>
        s +
        (p.kwhCompensadoBase ?? 0) +
        (p.kwhCompensadoAjuste ?? 0) -
        (p.kwhCreditoLegadoAbatido ?? 0),
      0,
    );
  // Bruto antes de qualquer abatimento (inclui valorAjuste manual).
  // Esse é o valor que aparece como "Valor bruto do período" no PDF.
  const sumValorBruto = (arr: typeof payables) =>
    arr.reduce((s, p) => s + (p.valorBruto ?? 0) + (p.valorAjuste ?? 0), 0);
  // Líquido pós abates (valorAbatidoDebito ja deduzido).
  const sumValorLiquido = (arr: typeof payables) =>
    arr.reduce((s, p) => s + (p.valorLiquido ?? 0), 0);
  // Soma dos abatimentos por amortizacao de InvestorDebit (mes anterior).
  // Vai aparecer no PDF como "MULTAS, NEGOCIACOES, GESTAO, OUTROS".
  const sumValorAbatidoDebito = (arr: typeof payables) =>
    arr.reduce((s, p) => s + (p.valorAbatidoDebito ?? 0), 0);

  const realizado = payables.filter(
    (p) => p.status === "DISPONIVEL" || p.status === "PAGO",
  );
  const aguardandoComp = payables.filter(
    (p) => p.status === "AGUARDANDO_COMPENSACAO",
  );
  const aguardandoPag = payables.filter(
    (p) =>
      p.status === "AGUARDANDO_PAGAMENTO" || p.status === "EM_COBRANCA_JUDICIAL",
  );

  // kwhCompensado no relatório do investidor = REMUNERÁVEL (com cap)
  // O bruto físico fica disponível em kwhCompensadoBruto pra contexto.
  const kwhCompensadoBruto = sumKwhBruto(realizado);
  const kwhCompensado = sumKwhRemuneravel(realizado);
  const kwhRepresadoCompensacao = sumKwhBruto(aguardandoComp);
  const kwhRepresadoInadimplencia = sumKwhBruto(aguardandoPag);

  // Crédito legado abatido: kWh compensados nas UCs mas que ultrapassaram o cap
  // de injeção da usina (vieram de créditos pré-existentes nas UCs, não da usina).
  // Não remunerável ao investidor.
  const kwhCreditoLegado = realizado.reduce(
    (s, p) => s + (p.kwhCreditoLegadoAbatido ?? 0),
    0,
  );
  const valorCreditoLegado = realizado.reduce(
    (s, p) => s + (p.kwhCreditoLegadoAbatido ?? 0) * (p.valorKwhContrato ?? 0),
    0,
  );

  const kwhInjetado = billUsina?.energiaInjetadaMedidorKwh ?? null;
  const kwhCredito =
    kwhInjetado != null ? Math.max(0, kwhInjetado - kwhCompensado) : null;

  const valorKwhContrato = investorLink.valorKwhContrato ?? null;
  const gestaoFixa = investorLink.gestaoFixaContrato ?? null;

  // Conta da usina: SO o mes atual (alinhado com a pagina). Senao acumularia
  // contas de meses ja deduzidos previamente.
  const valorContaUcUsina = billUsina?.valorTotal ?? null;
  // (faturasUsinaParaDescontar mantido como [billUsina] pra preencher o PDF
  // que lista as faturas — sempre 1 item agora.)
  const faturasUsinaParaDescontar = billUsina
    ? [
        {
          anoReferencia: ano,
          mesReferencia: mes,
          valorTotal: billUsina.valorTotal,
        },
      ]
    : [];

  const valorBruto = sumValorBruto(realizado);
  const valorBrutoLiquidoPayables = sumValorLiquido(realizado);
  // valorAjustesGerais = ORIGEM-based: o abate pertence ao mes de competencia
  // do payable, nao ao mes de display. Senao, mesmo abate aparece duas vezes
  // (no mes origem + no mes display via descasamento).
  const isOrigemThisMonth = (p: (typeof payables)[number]): boolean => {
    const origem = p.carriedFromPayableId
      ? p.carriedFromPayable
      : { originatedByPlantBill: p.originatedByPlantBill, anoReferencia: p.anoReferencia, mesReferencia: p.mesReferencia };
    const oAno =
      origem?.originatedByPlantBill?.anoReferencia ??
      origem?.anoReferencia ??
      p.anoReferencia;
    const oMes =
      origem?.originatedByPlantBill?.mesReferencia ??
      origem?.mesReferencia ??
      p.mesReferencia;
    return oAno === ano && oMes === mes;
  };
  const valorAjustesGerais = realizado
    .filter(isOrigemThisMonth)
    .reduce((s, p) => s + (p.valorAbatidoDebito ?? 0), 0);
  const valorRepresadoCompensacao = sumValorLiquido(aguardandoComp);
  const valorRepresadoInadimplencia = sumValorLiquido(aguardandoPag);

  // Calculo financeiro: bruto - conta - gestao - ajustes gerais (abate)
  // Quando teorico < 0, custos > compensacao: valor a receber clampa em 0
  // e a diferenca vira InvestorDebit pra ser amortizada nos proximos meses.
  // Nota: gestao + conta sempre aplicam (nao gateadas por cash flow no PDF).
  const valorReceberTeorico =
    valorBruto -
    (gestaoFixa ?? 0) -
    (valorContaUcUsina ?? 0) -
    valorAjustesGerais;
  const valorSaldoCarregadoProximo =
    valorReceberTeorico < -0.009 ? -valorReceberTeorico : 0;
  const valorReceber = Math.max(0, valorReceberTeorico);

  const ucsRepresadasInadimplencia = aguardandoPag
    .map((p) => ({
      codigoUc: p.consumerUnit?.codigoUc ?? null,
      nome: p.consumerUnit?.nome ?? null,
      kwh: (p.kwhCompensadoBase ?? 0) + (p.kwhCompensadoAjuste ?? 0),
      valor: p.valorLiquido ?? 0,
    }))
    .filter((u) => u.kwh > 0 || u.valor > 0);

  // Monta dados do PDF.
  const investorName =
    investorLink.investor.user?.name ??
    investorLink.investor.user?.email ??
    "Investidor";
  const investorDoc = investorLink.investor.cnpj ?? investorLink.investor.cpf ?? null;

  const pdfData: InvestorReportData = {
    plantName: plant.name,
    numeroUsina: plant.numeroUsina,
    investorName,
    investorDoc,
    mesLabel: `${MES_LABELS[mes - 1]}/${ano}`,
    emissao: new Date().toLocaleDateString("pt-BR"),
    kwhInjetado,
    kwhCompensado,
    kwhCompensadoBruto,
    kwhCredito,
    kwhCreditoLegado,
    valorCreditoLegado,
    valorKwhContrato,
    valorBruto,
    gestaoFixaMensal: gestaoFixa,
    valorContaUcUsina,
    valorAjustesGerais,
    valorSaldoCarregadoProximo,
    isPrimeiroRelatorio,
    faturasUsinaDescontadas: faturasUsinaParaDescontar.map((f) => ({
      ano: f.anoReferencia,
      mes: f.mesReferencia,
      valor: f.valorTotal,
    })),
    valorReceber,
    kwhRepresadoCompensacao,
    valorRepresadoCompensacao,
    kwhRepresadoInadimplencia,
    valorRepresadoInadimplencia,
    ucsRepresadasInadimplencia,
    saldoCreditoAnterior: saldoCredito.saldoAnterior,
    saldoCreditoFinal: saldoCredito.saldoFinal,
    observacoes: null,
  };

  // Saldo negativo: cria novo InvestorDebit e amortiza nos meses POSTERIORES
  // (relativo a ORIGEM real da payable, nao display). Cancel ja rodou antes
  // do compute pra estado limpo.
  if (isPublish) {
    const motivoPrefixo = `Saldo negativo do relatorio ${MES_LABELS[mes - 1]}/${ano}`;
    const motivoDebito = `${motivoPrefixo} (usina ${plant.numeroUsina ?? plant.name})`;

    if (valorSaldoCarregadoProximo > 0.009) {
      await prisma.investorDebit.create({
        data: {
          investorId: investorLink.investor.id,
          valorOriginal: valorSaldoCarregadoProximo,
          valorRestante: valorSaldoCarregadoProximo,
          motivo: motivoDebito,
          criadoPorUserId: session.user.id,
        },
      });
    }

    // Aplica em payables cuja ORIGEM REAL eh posterior ao mes do relatorio.
    // CRUCIAL: filtra por ORIGEM (originatedByPlantBill / carriedFromPayable.
    // originatedByPlantBill), NUNCA pelo display (anoReferencia/mesReferencia
    // do proprio payable). Senao, naturals com display futuro mas origem=mes
    // atual (descasamento de leitura) entrariam no apply e amortizariam o
    // bruto realizado deste mes na proxima publicacao = doubling.
    const futurosPayables = await prisma.investorPayable.findMany({
      where: {
        investorId: investorLink.investor.id,
        status: { in: ["AGUARDANDO_PAGAMENTO", "DISPONIVEL"] },
        OR: [
          // Naturals com originatedByPlantBill em mes posterior
          {
            carriedFromPayableId: null,
            originatedByPlantBill: {
              OR: [
                { anoReferencia: { gt: ano } },
                {
                  AND: [
                    { anoReferencia: ano },
                    { mesReferencia: { gt: mes } },
                  ],
                },
              ],
            },
          },
          // Saldo lines cuja origem real (via carriedFromPayable) eh posterior
          {
            carriedFromPayableId: { not: null },
            carriedFromPayable: {
              originatedByPlantBill: {
                OR: [
                  { anoReferencia: { gt: ano } },
                  {
                    AND: [
                      { anoReferencia: ano },
                      { mesReferencia: { gt: mes } },
                    ],
                  },
                ],
              },
            },
          },
        ],
      },
      orderBy: [
        { anoReferencia: "asc" },
        { mesReferencia: "asc" },
        { id: "asc" },
      ],
      select: { id: true },
    });
    console.log(
      `[publish] plant=${plantId} ${mes}/${ano}: aplicando debitos em ${futurosPayables.length} payable(s) futuro(s)`,
    );
    for (const fp of futurosPayables) {
      await applyInvestorDebitsToPayable(fp.id).catch((e) => {
        console.warn(
          `[publish] applyInvestorDebitsToPayable falhou pra ${fp.id}:`,
          e,
        );
      });
    }
  }

  // Salva: DRAFT no preview, PUBLISHED+snapshot no publish.
  const sharedFields: Record<string, unknown> = {
    status: isPublish ? "PUBLISHED" : "DRAFT",
    injecaoPeriodo: kwhInjetado,
    creditosUtilizados: kwhCompensado,
    creditosAtuais: kwhCredito,
    valorKwhContrato,
    valorBrutoGerador: valorBruto,
    gestaoMensalFixa: gestaoFixa,
    remuneracaoPeriodo: valorReceber,
  };
  if (isPublish) {
    sharedFields.publishedAt = new Date();
    sharedFields.publishedByUserId = session.user.id;
    sharedFields.snapshotJson = JSON.stringify(pdfData);
  } else {
    // DRAFT: limpa marcos de publicacao (esta sobrescrevendo um DRAFT antigo)
    sharedFields.snapshotJson = null;
  }

  const report = existing
    ? await prisma.monthlyReport.update({
        where: { id: existing.id },
        data: sharedFields,
      })
    : await prisma.monthlyReport.create({
        data: {
          plantId,
          investorId: investorLink.investor.id,
          ano,
          mes,
          ...sharedFields,
        },
      });

  const pdfBuffer = await renderToBuffer(InvestorReportPDF({ data: pdfData }));

  const filename = `relatorio-investidor-${plant.numeroUsina ?? plant.id.slice(0, 8)}-${String(mes).padStart(2, "0")}-${ano}.pdf`;

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Report-Id": report.id,
      "X-Report-Status": isPublish ? "PUBLISHED" : "DRAFT",
    },
  });
}

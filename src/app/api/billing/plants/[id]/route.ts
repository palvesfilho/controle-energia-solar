import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const billing = await prisma.plantBilling.findUnique({
    where: { id },
    include: {
      plant: {
        select: {
          id: true,
          name: true,
          numeroUsina: true,
          cpfCnpj: true,
          distribuidora: true,
          potenciaInstalada: true,
          dataAssinaturaContrato: true,
          investors: {
            select: { gestaoFixaContrato: true },
            take: 1,
          },
        },
      },
    },
  });
  if (!billing) {
    return NextResponse.json({ error: "Faturamento não encontrado" }, { status: 404 });
  }

  // Primeiro relatório? Definição ancorada nos dados (não em quantos PDFs foram
  // gerados): primeiro = não existe nenhum payable com competência (mês de
  // geração) anterior à atual.
  const earlierPayable = await prisma.investorPayable.findFirst({
    where: {
      plantId: billing.plantId,
      originatedByPlantBill: {
        OR: [
          { anoReferencia: { lt: billing.ano } },
          {
            AND: [
              { anoReferencia: billing.ano },
              { mesReferencia: { lt: billing.mes } },
            ],
          },
        ],
      },
    },
    select: { id: true },
  });
  const isPrimeiroRelatorio = !earlierPayable;

  // Pagina = cash flow real do mes. Conta da usina = SO a do mes atual,
  // nao acumula. (O helper janelaFaturasUsinaDescontadas que acumula meses
  // pulados eh usado APENAS pelo PDF do investidor, que eh origem-based.)
  // Senao, a conta de Dez aparece em Jan tambem = dupla cobranca no
  // cash flow view.
  const billUsinaMesAtual = await prisma.consumerBill.findFirst({
    where: {
      plantId: billing.plantId,
      consumerUnitId: null,
      anoReferencia: billing.ano,
      mesReferencia: billing.mes,
    },
    orderBy: { syncedAt: "desc" },
    select: { id: true, anoReferencia: true, mesReferencia: true, valorTotal: true },
  });
  const faturasUsinaDescontadas = billUsinaMesAtual ? [billUsinaMesAtual] : [];
  const valorContaUcUsina = billUsinaMesAtual?.valorTotal ?? null;
  const gestaoFixaMensal = billing.plant.investors[0]?.gestaoFixaContrato ?? null;

  // Compensação por UC do rateio no mês de referência: junta InvestorPayable
  // (nossa fonte de verdade do que foi destinado ao investidor) com
  // ConsumerUnitBilling (status de pagamento do cliente final).
  // Competência = mês de GERAÇÃO da usina (originatedByPlantBill), não o mês
  // da fatura do consumidor onde o crédito foi compensado.
  //
  // Inclui também SALDO LINES (carriedFromPayableId IS NOT NULL) cujo
  // anoReferencia/mesReferencia bate com o mês de geração — convenção: pra
  // saldo lines, anoRef/mesRef = mês de geração onde a linha aparece.
  const payables = await prisma.investorPayable.findMany({
    where: {
      plantId: billing.plantId,
      OR: [
        // Naturals: ORIGEM = este mes (kWh gerados neste mes, podem ter
        // display em outro mes via descasamento de leitura)
        {
          carriedFromPayableId: null,
          originatedByPlantBill: {
            anoReferencia: billing.ano,
            mesReferencia: billing.mes,
          },
        },
        // Naturals: DISPLAY = este mes (UCs que compensaram nas suas faturas
        // deste mes, mesmo que a kWh tenha origem em outro mes). Garante que
        // a tabela mostre todas as UCs ativas no ciclo de faturamento.
        {
          carriedFromPayableId: null,
          anoReferencia: billing.ano,
          mesReferencia: billing.mes,
        },
        // Saldo lines: display = este mes
        {
          carriedFromPayableId: { not: null },
          anoReferencia: billing.ano,
          mesReferencia: billing.mes,
        },
      ],
    },
    select: {
      id: true,
      status: true,
      kwhCompensadoBase: true,
      kwhCompensadoAjuste: true,
      kwhCreditoLegadoAbatido: true,
      valorBruto: true,
      valorAjuste: true,
      valorAbatidoDebito: true,
      valorLiquido: true,
      valorKwhContrato: true,
      consumerUnitId: true,
      consumerUnit: { select: { codigoUc: true, nome: true } },
      // mês da fatura do consumidor (pra cruzar com ConsumerUnitBilling correto,
      // que pode estar num mês diferente da competência de geração)
      anoReferencia: true,
      mesReferencia: true,
      originatedByPlantBill: {
        select: { anoReferencia: true, mesReferencia: true },
      },
      carriedFromPayableId: true,
      carriedFromPayable: {
        select: {
          // Mês de origem real do saldo: pra natural, é a competência da
          // própria fatura geradora; pra saldo de saldo, deveríamos pegar do
          // payable original — mas como sempre apontamos pro ORIGEM (não
          // intermediária), basta ler daqui.
          originatedByPlantBill: {
            select: { anoReferencia: true, mesReferencia: true },
          },
          anoReferencia: true,
          mesReferencia: true,
        },
      },
    },
    orderBy: { consumerUnit: { codigoUc: "asc" } },
  });

  // ConsumerUnitBilling é indexado por (consumerUnitId, ano, mes) onde ano/mes
  // são do CONSUMIDOR (não da competência de geração). Cada payable pode estar
  // num mês de fatura do consumidor diferente — busca individualmente.
  const cubKeys = Array.from(
    new Set(
      payables
        .filter((p) => !!p.consumerUnitId)
        .map((p) => `${p.consumerUnitId}|${p.anoReferencia}|${p.mesReferencia}`),
    ),
  );
  const billings = cubKeys.length
    ? await prisma.consumerUnitBilling.findMany({
        where: {
          OR: cubKeys.map((k) => {
            const [cuId, ano, mes] = k.split("|");
            return {
              consumerUnitId: cuId,
              ano: Number(ano),
              mes: Number(mes),
            };
          }),
        },
        select: {
          id: true,
          consumerUnitId: true,
          ano: true,
          mes: true,
          status: true,
          pagoEm: true,
          valorCobranca: true,
          formaPagamento: true,
          pagamentoNota: true,
        },
      })
    : [];
  const billingByKey = new Map(
    billings.map((b) => [`${b.consumerUnitId}|${b.ano}|${b.mes}`, b]),
  );

  // "Shadow" saldo lines: payables que apontam (carriedFromPayableId) pra um
  // dos naturals desta tela. Quando o cascade-unpaid-payables zera o kWh do
  // natural e cria um saldo line no mês seguinte, esse saldo line eh o
  // "estado vivo" do natural — exibimos seu kWh na linha do natural com um
  // label "carregado pra [mês]" pra nao parecer que sumiu.
  const naturalIds = payables
    .filter((p) => p.carriedFromPayableId == null)
    .map((p) => p.id);
  const shadowSaldos = naturalIds.length
    ? await prisma.investorPayable.findMany({
        where: { carriedFromPayableId: { in: naturalIds } },
        select: {
          id: true,
          carriedFromPayableId: true,
          anoReferencia: true,
          mesReferencia: true,
          kwhCompensadoBase: true,
          kwhCompensadoAjuste: true,
          status: true,
        },
      })
    : [];
  const shadowsByOrigem = new Map<string, typeof shadowSaldos>();
  for (const s of shadowSaldos) {
    if (!s.carriedFromPayableId) continue;
    const arr = shadowsByOrigem.get(s.carriedFromPayableId) ?? [];
    arr.push(s);
    shadowsByOrigem.set(s.carriedFromPayableId, arr);
  }

  // Filtra payables redundantes: quando um natural foi zerado pelo cascade
  // e o destino do shadow eh o PROPRIO mes visualizado, o saldo line ja
  // representa o estado atual — esconde o natural pra evitar duas linhas
  // pra mesma UC com o mesmo kWh.
  const filteredPayables = payables.filter((p) => {
    if (p.carriedFromPayableId) return true; // saldo line — sempre exibe
    const kwhBruto = (p.kwhCompensadoBase ?? 0) + (p.kwhCompensadoAjuste ?? 0);
    if (kwhBruto > 0.001) return true; // natural com kWh — exibe
    // Natural zerado: tem shadow no mesmo mes? Se sim, esconde.
    const shadowSameMonth = payables.find(
      (q) =>
        q.carriedFromPayableId === p.id &&
        q.anoReferencia === billing.ano &&
        q.mesReferencia === billing.mes,
    );
    return !shadowSameMonth;
  });

  // UCs do rateio que NAO tem payable neste mes — exibe linha vazia pra
  // operador ver "sem compensacao". Pega UCs ja vinculadas a essa plant
  // historicamente (qualquer payable em qualquer mes).
  const ucsIdsHistorico = await prisma.investorPayable.groupBy({
    by: ["consumerUnitId"],
    where: { plantId: billing.plantId },
  });
  const ucsIdsValidos = ucsIdsHistorico
    .map((u) => u.consumerUnitId)
    .filter((id): id is string => id != null);
  const todasUcsPlant = ucsIdsValidos.length
    ? await prisma.consumerUnit.findMany({
        where: { id: { in: ucsIdsValidos } },
        select: { id: true, codigoUc: true, nome: true },
      })
    : [];
  const ucsComPayable = new Set(
    filteredPayables
      .map((p) => p.consumerUnitId)
      .filter((id): id is string => id != null),
  );

  const ucsCompensacao = filteredPayables.map((p) => {
    const k = `${p.consumerUnitId}|${p.anoReferencia}|${p.mesReferencia}`;
    const cub = p.consumerUnitId ? billingByKey.get(k) : undefined;
    const clientePagou = !!cub?.pagoEm;
    const kwhBruto = (p.kwhCompensadoBase ?? 0) + (p.kwhCompensadoAjuste ?? 0);
    const kwhLegado = p.kwhCreditoLegadoAbatido ?? 0;
    // Origem real (pra rótulo "saldo de [mês]"): se for saldo line, pega do
    // payable original (carriedFromPayable). A origem é o mês de geração da
    // fatura geradora original.
    const origemAno = p.carriedFromPayable
      ? p.carriedFromPayable.originatedByPlantBill?.anoReferencia ??
        p.carriedFromPayable.anoReferencia
      : null;
    const origemMes = p.carriedFromPayable
      ? p.carriedFromPayable.originatedByPlantBill?.mesReferencia ??
        p.carriedFromPayable.mesReferencia
      : null;
    // Mês em que o crédito foi compensado na fatura do consumidor (sempre o
    // mesmo entre natural e suas saldo lines — a compensação física
    // ocorreu uma vez só, na fatura original).
    const compensouAno = p.carriedFromPayable?.anoReferencia ?? p.anoReferencia;
    const compensouMes = p.carriedFromPayable?.mesReferencia ?? p.mesReferencia;

    // Detecta se este natural foi "carregado pra frente" via cascade.
    // Procura saldo lines que apontam pra ele.
    const shadows = shadowsByOrigem.get(p.id) ?? [];
    const shadowKwhTotal = shadows.reduce(
      (s, x) => s + (x.kwhCompensadoBase ?? 0) + (x.kwhCompensadoAjuste ?? 0),
      0,
    );
    const wasCarriedForward =
      !p.carriedFromPayableId && kwhBruto < 0.001 && shadowKwhTotal > 0;
    // Pega a saldo line mais recente (maior ano-mes) pra mostrar o destino
    const ultimaShadow =
      shadows.length > 0
        ? shadows.reduce((acc, x) =>
            x.anoReferencia > acc.anoReferencia ||
            (x.anoReferencia === acc.anoReferencia &&
              x.mesReferencia > acc.mesReferencia)
              ? x
              : acc,
          )
        : null;

    // kWh exibido na linha: se foi carregado pra frente, mostra o kWh
    // do shadow (38) em vez de zero. Se nao, mostra o normal.
    const kwhDisplay = wasCarriedForward
      ? shadowKwhTotal
      : kwhBruto - kwhLegado;
    const kwhBrutoDisplay = wasCarriedForward ? shadowKwhTotal : kwhBruto;

    return {
      payableId: p.id,
      billingId: cub?.id ?? null,
      codigoUc: p.consumerUnit?.codigoUc ?? null,
      nome: p.consumerUnit?.nome ?? null,
      // kwhCompensado = remunerável (= bruto − legado), bate com valor pago
      kwhCompensado: kwhDisplay,
      kwhCompensadoBruto: kwhBrutoDisplay,
      kwhCompensadoBase: p.kwhCompensadoBase,
      kwhCreditoLegadoAbatido: kwhLegado,
      valorBruto: p.valorBruto,
      valorLiquido: p.valorLiquido,
      valorPago: clientePagou ? p.valorLiquido : 0,
      payableStatus: p.status,
      billingStatus: cub?.status ?? null,
      pagoEm: cub?.pagoEm ?? null,
      formaPagamento: cub?.formaPagamento ?? null,
      pagamentoNota: cub?.pagamentoNota ?? null,
      // Saldo line metadata (null pra naturals)
      isSaldo: !!p.carriedFromPayableId,
      origemAno,
      origemMes,
      compensouAno,
      compensouMes,
      // Carry-forward metadata (null se nao foi cascadeado)
      wasCarriedForward,
      carriedToAno: wasCarriedForward ? ultimaShadow?.anoReferencia ?? null : null,
      carriedToMes: wasCarriedForward ? ultimaShadow?.mesReferencia ?? null : null,
    };
  });

  // Adiciona linhas vazias pras UCs do rateio sem payable neste mes
  const linhasVazias: typeof ucsCompensacao = todasUcsPlant
    .filter((u) => !ucsComPayable.has(u.id))
    .map((u) => ({
      payableId: `empty-${u.id}`,
      billingId: null,
      codigoUc: u.codigoUc,
      nome: u.nome,
      kwhCompensado: 0,
      kwhCompensadoBruto: 0,
      kwhCompensadoBase: 0,
      kwhCreditoLegadoAbatido: 0,
      valorBruto: 0,
      valorLiquido: 0,
      valorPago: 0,
      payableStatus: "SEM_COMPENSACAO",
      billingStatus: null,
      pagoEm: null,
      formaPagamento: null,
      pagamentoNota: null,
      isSaldo: false,
      origemAno: null,
      origemMes: null,
      compensouAno: billing.ano,
      compensouMes: billing.mes,
      wasCarriedForward: false,
      carriedToAno: null,
      carriedToMes: null,
    }));
  ucsCompensacao.push(...linhasVazias);

  // Remove o array "investors" do objeto da plant (era só pra trazer gestaoFixaContrato).
  const { investors: _investors, ...plantBase } = billing.plant;

  // Bruto realizado: DISPLAY-based (cash flow real do mes — UCs que pagaram
  // boletos no ciclo deste mes, independente de origem).
  const realizadoPayables = payables.filter(
    (p) => p.status === "DISPONIVEL" || p.status === "PAGO",
  );
  const valorBrutoRealizado = realizadoPayables.reduce(
    (s, p) => s + (p.valorBruto ?? 0) + (p.valorAjuste ?? 0),
    0,
  );

  // valorAjustesGerais (abate de InvestorDebit) eh ORIGEM-based: o abate
  // pertence ao mes de competencia/geracao do payable, NAO ao mes de display.
  // Senao, mesmo abate apareceria 2x (no relatorio do mes de origem +
  // na pagina do mes de display via descasamento).
  // Gestao e conta usina ficam display-based — sao custos do operador
  // no ciclo de cash flow deste mes.
  const isOrigemThisMonth = (p: (typeof payables)[number]): boolean => {
    const origem = p.carriedFromPayableId
      ? p.carriedFromPayable
      : { originatedByPlantBill: p.originatedByPlantBill, anoReferencia: p.anoReferencia, mesReferencia: p.mesReferencia };
    const origemAno =
      origem?.originatedByPlantBill?.anoReferencia ??
      origem?.anoReferencia ??
      p.anoReferencia;
    const origemMes =
      origem?.originatedByPlantBill?.mesReferencia ??
      origem?.mesReferencia ??
      p.mesReferencia;
    return origemAno === billing.ano && origemMes === billing.mes;
  };
  const valorAjustesGerais = realizadoPayables
    .filter(isOrigemThisMonth)
    .reduce((s, p) => s + (p.valorAbatidoDebito ?? 0), 0);

  // Deducoes gestao + conta da usina: sempre aplicam (custo fixo do mes
  // que o operador desconta do investidor, independente de cash flow).
  const valorLiquidoTeorico =
    valorBrutoRealizado -
    (gestaoFixaMensal ?? 0) -
    (valorContaUcUsina ?? 0) -
    valorAjustesGerais;
  const valorSaldoCarregadoProximo =
    valorLiquidoTeorico < -0.009 ? -valorLiquidoTeorico : 0;
  const valorLiquidoInvestidor = Math.max(0, valorLiquidoTeorico);

  // Crédito legado abatido (cap excedente) — kWh não remunerável ao investidor
  const kwhCreditoLegadoTotal = realizadoPayables.reduce(
    (s, p) => s + (p.kwhCreditoLegadoAbatido ?? 0),
    0,
  );
  const valorCreditoLegadoTotal = realizadoPayables.reduce(
    (s, p) =>
      s + (p.kwhCreditoLegadoAbatido ?? 0) * (p.valorKwhContrato ?? 0),
    0,
  );

  // Estado do MonthlyReport (relatorio por usina+investidor) — define se a UI
  // mostra "Gerar previa" + "Publicar" (DRAFT) ou "Baixar PDF" + "Reverter"
  // (PUBLISHED). Pega o relatorio do PRIMEIRO investidor da usina (UI nao
  // suporta multiplos investidores hoje).
  const investorIdForReport = await prisma.investorPlant
    .findFirst({
      where: { plantId: billing.plantId },
      select: { investorId: true },
    })
    .then((r) => r?.investorId ?? null);

  const monthlyReport = investorIdForReport
    ? await prisma.monthlyReport.findFirst({
        where: {
          plantId: billing.plantId,
          investorId: investorIdForReport,
          ano: billing.ano,
          mes: billing.mes,
        },
        select: {
          id: true,
          status: true,
          publishedAt: true,
          publishedByUserId: true,
        },
      })
    : null;

  console.log(
    `[GET billing/plants/${billing.id}] ${billing.ano}-${billing.mes}: bruto=${valorBrutoRealizado.toFixed(2)} gestao=${gestaoFixaMensal} conta=${valorContaUcUsina} ajustes=${valorAjustesGerais.toFixed(2)} liquido=${valorLiquidoInvestidor.toFixed(2)} | realizado.length=${realizadoPayables.length}`,
  );

  return NextResponse.json({
    ...billing,
    plant: plantBase,
    ucsCompensacao,
    valorContaUcUsina,
    gestaoFixaMensal,
    valorBrutoRealizado,
    valorAjustesGerais,
    valorSaldoCarregadoProximo,
    valorLiquidoInvestidor,
    kwhCreditoLegadoTotal,
    valorCreditoLegadoTotal,
    isPrimeiroRelatorio,
    faturasUsinaDescontadas: faturasUsinaDescontadas.map((f) => ({
      id: f.id,
      ano: f.anoReferencia,
      mes: f.mesReferencia,
      valor: f.valorTotal,
    })),
    monthlyReport,
  });
}

/**
 * PUT /api/billing/plants/[id]
 * Atualiza valores, observações, status.
 */
export async function PUT(req: NextRequest, ctx: RouteCtx) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const body = await req.json();

  const billing = await prisma.plantBilling.update({
    where: { id },
    data: {
      ...(body.valorTotal !== undefined && {
        valorTotal: body.valorTotal === null ? null : Number(body.valorTotal),
      }),
      ...(body.observacoes !== undefined && { observacoes: body.observacoes || null }),
      ...(body.status !== undefined && { status: body.status }),
    },
  });

  return NextResponse.json(billing);
}

export async function DELETE(_req: NextRequest, ctx: RouteCtx) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  await prisma.plantBilling.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole, isFullAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { applyInjectionCapToPlant } from "@/lib/investor-injection-cap";
import { applyInvestorDebitsToPayable } from "@/lib/investor-debits";
import { isMesEncerrado } from "@/lib/mes-encerrado";

/**
 * POST /api/admin/investor-payables/[id]/edit-kwh
 * Body: { kwh: number }
 *
 * Reduz o kwhCompensadoBase do payable para o valor informado e cria/atualiza
 * uma linha de SALDO no resumo do mês de geração seguinte com o restante.
 *
 * O saldo carrega `carriedFromPayableId` apontando pro payable ORIGINAL (não
 * pra cadeia intermediária) — assim o rótulo "saldo de [mês]" preserva a
 * origem real através de múltiplos saltos.
 *
 * Restrições atuais (v1):
 *  - Só permite REDUZIR kWh (delta positivo). Pra restaurar, edite a linha
 *    de saldo do mês seguinte (cascateia pra trás).
 *  - Só funciona em payables não-finais (status ≠ PAGO, EM_COBRANCA_JUDICIAL).
 *  - Não recalcula débitos/cap automaticamente além do payable atual e da
 *    nova linha de saldo.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { kwh?: number } | null;
  if (!body || typeof body.kwh !== "number" || !Number.isFinite(body.kwh) || body.kwh < 0) {
    return NextResponse.json({ error: "kwh deve ser número >= 0" }, { status: 400 });
  }
  const novoKwh = body.kwh;

  const payable = await prisma.investorPayable.findUnique({
    where: { id },
    select: {
      id: true,
      investorId: true,
      plantId: true,
      consumerUnitId: true,
      anoReferencia: true,
      mesReferencia: true,
      parcelaIndex: true,
      sharePercent: true,
      valorKwhContrato: true,
      kwhCompensadoBase: true,
      kwhCompensadoAjuste: true,
      valorAjuste: true,
      valorAbatidoDebito: true,
      status: true,
      consumerBillId: true,
      consumerUnitBillingId: true,
      originatedByPlantBillId: true,
      originatedByPlantBill: {
        select: { anoReferencia: true, mesReferencia: true },
      },
      carriedFromPayableId: true,
      rateioVersionId: true,
    },
  });
  if (!payable) {
    return NextResponse.json({ error: "Payable não encontrado" }, { status: 404 });
  }
  if (payable.status === "PAGO" || payable.status === "EM_COBRANCA_JUDICIAL") {
    return NextResponse.json(
      { error: `Payable em ${payable.status} — não pode editar` },
      { status: 400 },
    );
  }

  // Bloqueia edicao se o mes da competencia (mes de geracao) esta encerrado.
  // Apenas ADMIN consegue mexer apos encerramento.
  const genAno =
    payable.originatedByPlantBill?.anoReferencia ?? payable.anoReferencia;
  const genMes =
    payable.originatedByPlantBill?.mesReferencia ?? payable.mesReferencia;
  if (
    !isFullAdmin(session.user.role) &&
    (await isMesEncerrado(payable.plantId, genAno, genMes))
  ) {
    return NextResponse.json(
      {
        error:
          "Mês encerrado (comprovante de pagamento já anexado). Apenas ADMIN pode editar — peça reabertura.",
      },
      { status: 403 },
    );
  }

  const kwhAtual = payable.kwhCompensadoBase;
  if (novoKwh > kwhAtual) {
    return NextResponse.json(
      { error: "Por enquanto só é possível reduzir o kWh — pra restaurar, edite a linha de saldo do mês seguinte." },
      { status: 400 },
    );
  }
  const delta = kwhAtual - novoKwh;

  // 1) Atualiza o payable atual (kWh + valores recalculados)
  const novoValorBruto = (novoKwh + payable.kwhCompensadoAjuste) * payable.valorKwhContrato;
  const novoValorLiquido = novoValorBruto + payable.valorAjuste;
  await prisma.investorPayable.update({
    where: { id: payable.id },
    data: {
      kwhCompensadoBase: novoKwh,
      valorBruto: novoValorBruto,
      valorLiquido: novoValorLiquido,
    },
  });

  let saldoLineId: string | null = null;

  if (delta > 0) {
    // 2) Identifica o payable ORIGEM (preserva chain). Se este já é uma linha
    //    de saldo, usa a origem dela; senão, ele próprio é a origem.
    const origemId = payable.carriedFromPayableId ?? payable.id;

    // 3) Calcula mês destino: gen month + 1.
    //    Pra natural payable, gen month = originatedByPlantBill.{ano,mes}.
    //    Pra saldo line, gen month = anoRef/mesRef da própria linha (essa é
    //    a convenção: saldo lines têm anoRef/mesRef = mês de geração onde aparece).
    const genAno = payable.carriedFromPayableId
      ? payable.anoReferencia
      : payable.originatedByPlantBill?.anoReferencia ?? payable.anoReferencia;
    const genMes = payable.carriedFromPayableId
      ? payable.mesReferencia
      : payable.originatedByPlantBill?.mesReferencia ?? payable.mesReferencia;

    const proxAno = genMes === 12 ? genAno + 1 : genAno;
    const proxMes = genMes === 12 ? 1 : genMes + 1;

    // 4) Tenta ligar à fatura da UC geradora do mês seguinte (se existir).
    const proxPlantBill = await prisma.consumerBill.findFirst({
      where: {
        plantId: payable.plantId,
        consumerUnitId: null,
        anoReferencia: proxAno,
        mesReferencia: proxMes,
      },
      orderBy: { syncedAt: "desc" },
      select: { id: true },
    });

    // 5) Cria ou atualiza saldo line: chave única =
    //    (investorId, consumerUnitId, ano, mes, parcelaIndex, carriedFromPayableId).
    //    Procura existente com mesma origem no mês destino.
    const existente = await prisma.investorPayable.findFirst({
      where: {
        investorId: payable.investorId,
        consumerUnitId: payable.consumerUnitId,
        anoReferencia: proxAno,
        mesReferencia: proxMes,
        parcelaIndex: 0,
        carriedFromPayableId: origemId,
      },
      select: { id: true, kwhCompensadoBase: true, kwhCompensadoAjuste: true, valorAjuste: true },
    });

    if (existente) {
      const novoKwhExistente = existente.kwhCompensadoBase + delta;
      const novoBrutoExistente = (novoKwhExistente + existente.kwhCompensadoAjuste) * payable.valorKwhContrato;
      const novoLiquidoExistente = novoBrutoExistente + existente.valorAjuste;
      await prisma.investorPayable.update({
        where: { id: existente.id },
        data: {
          kwhCompensadoBase: novoKwhExistente,
          valorBruto: novoBrutoExistente,
          valorLiquido: novoLiquidoExistente,
        },
      });
      saldoLineId = existente.id;
    } else {
      const valorBruto = delta * payable.valorKwhContrato;
      const created = await prisma.investorPayable.create({
        data: {
          investorId: payable.investorId,
          plantId: payable.plantId,
          consumerUnitId: payable.consumerUnitId,
          anoReferencia: proxAno,
          mesReferencia: proxMes,
          parcelaIndex: 0,
          sharePercent: payable.sharePercent,
          valorKwhContrato: payable.valorKwhContrato,
          rateioVersionId: payable.rateioVersionId,
          kwhCompensadoBase: delta,
          kwhCompensadoAjuste: 0,
          valorBruto,
          valorAjuste: 0,
          valorAbatidoDebito: 0,
          valorLiquido: valorBruto,
          status: payable.status,
          // Saldo line: aparece no resumo de (proxAno, proxMes), mas a
          // competência real de geração é a do payable original. Pra
          // simplificar a query do resumo (que filtra por
          // originatedByPlantBill), apontamos pra fatura do mês seguinte
          // quando ela existe; quando não, deixa null.
          originatedByPlantBillId: proxPlantBill?.id ?? null,
          carriedFromPayableId: origemId,
        },
      });
      saldoLineId = created.id;
    }

    // 6) Reaplica débitos no saldo line (caso haja débito aberto pro investidor).
    if (saldoLineId) {
      await applyInvestorDebitsToPayable(saldoLineId).catch(() => {});
    }
  }

  // 7) Reaplica cap (Σ compensado ≤ Σ injeção). Idempotente.
  await applyInjectionCapToPlant(payable.plantId).catch(() => {});

  return NextResponse.json({
    ok: true,
    payableId: payable.id,
    novoKwh,
    delta,
    saldoLineId,
  });
}

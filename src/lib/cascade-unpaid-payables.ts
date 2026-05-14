import { prisma } from "@/lib/prisma";

/**
 * Quando um faturamento mensal de usina é encerrado (com ou sem pagamento),
 * payables que ficaram em AGUARDANDO_PAGAMENTO ou EM_COBRANCA_JUDICIAL
 * (= UC final inadimplente) carregam o kWh devido para o mês seguinte como
 * uma "saldo line" — mesmo padrão do edit-kwh, mas automatizado.
 *
 * Comportamento:
 *  - Saldo line no mês +1 herda kWh, status, consumerUnitBillingId (preserva
 *    link com a billing do consumidor — quando ela for paga, o webhook
 *    transitiona o saldo line junto com o original).
 *  - Original tem kwhCompensadoBase zerado e valores recalculados (preserva
 *    kwhCompensadoAjuste e valorAjuste, que são intervenções manuais).
 *  - Idempotente: chamada 2× cria saldo line apenas uma vez (upsert por
 *    chave única investidor+UC+ano+mês+parcela+origemId).
 *  - Se o mês +1 também já estiver encerrado e essa cascade não tiver rodado
 *    antes pra ele, próxima execução do encerrar do mês +1 cascadeia pra +2.
 *
 * Não cascadeia AGUARDANDO_COMPENSACAO (descasamento de leituras) — esse caso
 * resolve sozinho na próxima leitura, fluxo separado.
 */
export async function cascadeUnpaidPayablesToNextMonth(
  plantId: string,
  ano: number,
  mes: number,
): Promise<{ cascaded: number; skipped: number }> {
  const payables = await prisma.investorPayable.findMany({
    where: {
      plantId,
      status: { in: ["AGUARDANDO_PAGAMENTO", "EM_COBRANCA_JUDICIAL"] },
      kwhCompensadoBase: { gt: 0 },
      OR: [
        // Natural payable: competência = mês de geração da originated bill.
        {
          carriedFromPayableId: null,
          originatedByPlantBill: { anoReferencia: ano, mesReferencia: mes },
        },
        // Saldo line: anoRef/mesRef da própria linha = mês onde aparece.
        {
          carriedFromPayableId: { not: null },
          anoReferencia: ano,
          mesReferencia: mes,
        },
      ],
    },
    select: {
      id: true,
      investorId: true,
      consumerUnitId: true,
      parcelaIndex: true,
      sharePercent: true,
      valorKwhContrato: true,
      rateioVersionId: true,
      kwhCompensadoBase: true,
      kwhCompensadoAjuste: true,
      valorAjuste: true,
      status: true,
      consumerBillId: true,
      consumerUnitBillingId: true,
      carriedFromPayableId: true,
    },
  });

  if (payables.length === 0) return { cascaded: 0, skipped: 0 };

  const proxAno = mes === 12 ? ano + 1 : ano;
  const proxMes = mes === 12 ? 1 : mes + 1;
  const proxPlantBill = await prisma.consumerBill.findFirst({
    where: {
      plantId,
      consumerUnitId: null,
      anoReferencia: proxAno,
      mesReferencia: proxMes,
    },
    orderBy: { syncedAt: "desc" },
    select: { id: true },
  });

  let cascaded = 0;
  let skipped = 0;

  for (const p of payables) {
    if (p.consumerUnitId == null) {
      skipped++;
      continue;
    }
    const origemId = p.carriedFromPayableId ?? p.id;
    const kwhTransfer = p.kwhCompensadoBase;
    const valorBrutoSaldo = kwhTransfer * p.valorKwhContrato;

    const existente = await prisma.investorPayable.findFirst({
      where: {
        investorId: p.investorId,
        consumerUnitId: p.consumerUnitId,
        anoReferencia: proxAno,
        mesReferencia: proxMes,
        parcelaIndex: p.parcelaIndex,
        carriedFromPayableId: origemId,
      },
      select: {
        id: true,
        kwhCompensadoBase: true,
        kwhCompensadoAjuste: true,
        valorAjuste: true,
      },
    });

    if (existente) {
      // Acumula kWh no saldo line existente. Recalcula bruto/líquido com
      // valorKwhContrato do original (caso tenha mudado entre as cascades).
      const novoKwh = existente.kwhCompensadoBase + kwhTransfer;
      const novoBruto =
        (novoKwh + existente.kwhCompensadoAjuste) * p.valorKwhContrato;
      const novoLiquido = novoBruto + existente.valorAjuste;
      await prisma.investorPayable.update({
        where: { id: existente.id },
        data: {
          kwhCompensadoBase: novoKwh,
          valorBruto: novoBruto,
          valorLiquido: novoLiquido,
          status: p.status,
          // Preserva link com billing pra transição automática quando pago
          consumerUnitBillingId: p.consumerUnitBillingId,
          consumerBillId: p.consumerBillId,
        },
      });
    } else {
      await prisma.investorPayable.create({
        data: {
          investorId: p.investorId,
          plantId,
          consumerUnitId: p.consumerUnitId,
          anoReferencia: proxAno,
          mesReferencia: proxMes,
          parcelaIndex: p.parcelaIndex,
          sharePercent: p.sharePercent,
          valorKwhContrato: p.valorKwhContrato,
          rateioVersionId: p.rateioVersionId,
          kwhCompensadoBase: kwhTransfer,
          kwhCompensadoAjuste: 0,
          valorBruto: valorBrutoSaldo,
          valorAjuste: 0,
          valorAbatidoDebito: 0,
          valorLiquido: valorBrutoSaldo,
          status: p.status,
          consumerBillId: p.consumerBillId,
          consumerUnitBillingId: p.consumerUnitBillingId,
          originatedByPlantBillId: proxPlantBill?.id ?? null,
          carriedFromPayableId: origemId,
        },
      });
    }

    // Zera o BASE do original (preserva kwhCompensadoAjuste/valorAjuste manuais).
    const origValorBruto =
      (0 + p.kwhCompensadoAjuste) * p.valorKwhContrato;
    const origValorLiquido = origValorBruto + p.valorAjuste;
    await prisma.investorPayable.update({
      where: { id: p.id },
      data: {
        kwhCompensadoBase: 0,
        valorBruto: origValorBruto,
        valorLiquido: origValorLiquido,
      },
    });

    cascaded++;
  }

  return { cascaded, skipped };
}

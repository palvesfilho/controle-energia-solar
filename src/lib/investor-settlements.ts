/**
 * Lógica de fechamento mensal de pagamento ao investidor.
 *
 * Fluxo esperado:
 *  1. Dia 15 de cada mês (ou manual): `generateSettlementsForClosing(ano, mes)` cria
 *     DRAFT por investidor com todos os payables DISPONIVEL no momento.
 *  2. Operador revisa via UI, ajusta `kwhCompensadoAjuste`/`valorAjuste` nos payables,
 *     preenche `gestaoFixaAplicada` e `outrosAjustes` do fechamento.
 *  3. `publishSettlement` confirma: status → PUBLISHED, payables → PAGO,
 *     snapshot dos totais preservado.
 */

import { prisma } from "@/lib/prisma";

export interface GenerateSettlementResult {
  investorId: string;
  settlementId: string;
  created: boolean;
  payablesIncluded: number;
  totalLiquido: number;
}

export interface GenerateClosingResult {
  anoFechamento: number;
  mesFechamento: number;
  results: GenerateSettlementResult[];
  skippedInvestors: Array<{ investorId: string; reason: string }>;
}

function recalcKwhValores(p: {
  kwhCompensadoBase: number;
  kwhCompensadoAjuste: number;
  valorKwhContrato: number;
  valorAjuste: number;
}) {
  const valorBruto =
    (p.kwhCompensadoBase + p.kwhCompensadoAjuste) * p.valorKwhContrato;
  const valorLiquido = valorBruto + p.valorAjuste;
  return { valorBruto, valorLiquido };
}

/**
 * Gera DRAFT de fechamento para UM investidor, puxando os payables DISPONIVEL atuais.
 * Idempotente: se já existe DRAFT para (investor, ano, mês), apenas reprocessa.
 */
export async function generateSettlementDraft(
  investorId: string,
  anoFechamento: number,
  mesFechamento: number,
): Promise<GenerateSettlementResult> {
  const existing = await prisma.investorSettlement.findUnique({
    where: {
      investorId_anoFechamento_mesFechamento: {
        investorId,
        anoFechamento,
        mesFechamento,
      },
    },
    select: { id: true, status: true },
  });

  if (existing && existing.status === "PUBLISHED") {
    // Não toca em fechamento já publicado.
    const totals = await prisma.investorPayable.aggregate({
      where: { investorSettlementId: existing.id },
      _sum: { valorLiquido: true },
      _count: true,
    });
    return {
      investorId,
      settlementId: existing.id,
      created: false,
      payablesIncluded: totals._count ?? 0,
      totalLiquido: totals._sum.valorLiquido ?? 0,
    };
  }

  // Payables disponíveis no momento (já pagos pelo cliente, com compensação):
  // - DISPONIVEL sem settlement vinculado → incluir
  // - Já vinculados a ESTE settlement DRAFT → re-incluir (idempotência)
  const payablesDisponiveis = await prisma.investorPayable.findMany({
    where: {
      investorId,
      OR: [
        { status: "DISPONIVEL", investorSettlementId: null },
        ...(existing ? [{ investorSettlementId: existing.id }] : []),
      ],
    },
    select: {
      id: true,
      plantId: true,
      kwhCompensadoBase: true,
      kwhCompensadoAjuste: true,
      valorKwhContrato: true,
      valorAjuste: true,
    },
  });

  let totalKwh = 0;
  let totalBruto = 0;
  let totalAjuste = 0;
  let totalLiquido = 0;
  for (const p of payablesDisponiveis) {
    const kwhEfet = p.kwhCompensadoBase + p.kwhCompensadoAjuste;
    const { valorBruto, valorLiquido } = recalcKwhValores(p);
    totalKwh += kwhEfet;
    totalBruto += valorBruto;
    totalAjuste += p.valorAjuste;
    totalLiquido += valorLiquido;
  }

  // Gestão fixa: soma de InvestorPlant.gestaoFixaContrato das usinas do investidor
  // (valor sugerido — operador pode sobrescrever na tela).
  const investorPlants = await prisma.investorPlant.findMany({
    where: { investorId },
    select: { gestaoFixaContrato: true },
  });
  const gestaoFixaAplicada = investorPlants.reduce(
    (acc, ip) => acc + (ip.gestaoFixaContrato ?? 0),
    0,
  );

  const valorAPagar = totalLiquido - gestaoFixaAplicada;

  const settlement = await prisma.$transaction(async (tx) => {
    const s = await tx.investorSettlement.upsert({
      where: {
        investorId_anoFechamento_mesFechamento: {
          investorId,
          anoFechamento,
          mesFechamento,
        },
      },
      create: {
        investorId,
        anoFechamento,
        mesFechamento,
        status: "DRAFT",
        totalKwh,
        totalBruto,
        totalAjuste,
        totalLiquido,
        totalPayables: payablesDisponiveis.length,
        gestaoFixaAplicada,
        valorAPagar,
      },
      update: {
        status: "DRAFT",
        totalKwh,
        totalBruto,
        totalAjuste,
        totalLiquido,
        totalPayables: payablesDisponiveis.length,
        // Não sobrescreve gestaoFixaAplicada/outrosAjustes/outrosNotas se já preenchidos
        // (operador pode ter editado antes de reprocessar)
      },
    });

    if (payablesDisponiveis.length > 0) {
      await tx.investorPayable.updateMany({
        where: { id: { in: payablesDisponiveis.map((p) => p.id) } },
        data: { investorSettlementId: s.id },
      });
    }

    return s;
  });

  return {
    investorId,
    settlementId: settlement.id,
    created: !existing,
    payablesIncluded: payablesDisponiveis.length,
    totalLiquido,
  };
}

/**
 * Roda o fechamento de todos os investidores de uma vez (job do dia 15).
 */
export async function generateSettlementsForClosing(
  anoFechamento: number,
  mesFechamento: number,
): Promise<GenerateClosingResult> {
  // Pega investidores que têm ao menos 1 payable DISPONIVEL sem settlement
  const candidatos = await prisma.investorPayable.findMany({
    where: { status: "DISPONIVEL", investorSettlementId: null },
    select: { investorId: true },
    distinct: ["investorId"],
  });

  const results: GenerateSettlementResult[] = [];
  const skipped: Array<{ investorId: string; reason: string }> = [];

  for (const { investorId } of candidatos) {
    try {
      const r = await generateSettlementDraft(
        investorId,
        anoFechamento,
        mesFechamento,
      );
      results.push(r);
    } catch (e) {
      skipped.push({
        investorId,
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return {
    anoFechamento,
    mesFechamento,
    results,
    skippedInvestors: skipped,
  };
}

/**
 * Recalcula totais de um settlement lendo o estado atual dos payables vinculados
 * + gestaoFixaAplicada e outrosAjustes do próprio settlement.
 */
export async function recomputeSettlementTotals(
  settlementId: string,
): Promise<void> {
  const s = await prisma.investorSettlement.findUnique({
    where: { id: settlementId },
    select: {
      id: true,
      status: true,
      gestaoFixaAplicada: true,
      outrosAjustes: true,
    },
  });
  if (!s || s.status === "PUBLISHED") return;

  const payables = await prisma.investorPayable.findMany({
    where: { investorSettlementId: settlementId },
    select: {
      kwhCompensadoBase: true,
      kwhCompensadoAjuste: true,
      valorKwhContrato: true,
      valorAjuste: true,
    },
  });

  let totalKwh = 0;
  let totalBruto = 0;
  let totalAjuste = 0;
  let totalLiquido = 0;
  for (const p of payables) {
    const kwhEfet = p.kwhCompensadoBase + p.kwhCompensadoAjuste;
    const { valorBruto, valorLiquido } = recalcKwhValores(p);
    totalKwh += kwhEfet;
    totalBruto += valorBruto;
    totalAjuste += p.valorAjuste;
    totalLiquido += valorLiquido;
  }

  const valorAPagar = totalLiquido - s.gestaoFixaAplicada + s.outrosAjustes;

  await prisma.investorSettlement.update({
    where: { id: settlementId },
    data: {
      totalKwh,
      totalBruto,
      totalAjuste,
      totalLiquido,
      totalPayables: payables.length,
      valorAPagar,
    },
  });
}

/**
 * Publica o fechamento: status → PUBLISHED, payables → PAGO, snapshot dos totais preservado.
 * Registra `pagoEm` e `pagoComprovante` como data/URL da transferência confirmada.
 */
export async function publishSettlement(
  settlementId: string,
  opts: { pagoEm?: Date; pagoComprovante?: string | null } = {},
): Promise<{ paidCount: number; totalAPagar: number }> {
  const s = await prisma.investorSettlement.findUnique({
    where: { id: settlementId },
    select: { id: true, status: true },
  });
  if (!s) throw new Error("Fechamento não encontrado");
  if (s.status === "PUBLISHED") throw new Error("Fechamento já publicado");
  if (s.status === "CANCELED") throw new Error("Fechamento cancelado");

  await recomputeSettlementTotals(settlementId);

  const pagoEm = opts.pagoEm ?? new Date();

  const updated = await prisma.$transaction(async (tx) => {
    const payables = await tx.investorPayable.findMany({
      where: { investorSettlementId: settlementId },
      select: { id: true },
    });
    await tx.investorPayable.updateMany({
      where: { id: { in: payables.map((p) => p.id) } },
      data: {
        status: "PAGO",
        pagoInvestidorEm: pagoEm,
      },
    });
    const pub = await tx.investorSettlement.update({
      where: { id: settlementId },
      data: {
        status: "PUBLISHED",
        publicadoEm: new Date(),
        pagoEm,
        pagoComprovante: opts.pagoComprovante ?? null,
      },
      select: { valorAPagar: true },
    });
    return { paidCount: payables.length, totalAPagar: pub.valorAPagar };
  });

  return updated;
}

/**
 * Cancela um DRAFT — desvincula os payables (voltam pra DISPONIVEL sem settlement).
 */
export async function cancelSettlement(settlementId: string): Promise<void> {
  const s = await prisma.investorSettlement.findUnique({
    where: { id: settlementId },
    select: { id: true, status: true },
  });
  if (!s) throw new Error("Fechamento não encontrado");
  if (s.status === "PUBLISHED") {
    throw new Error(
      "Não é possível cancelar fechamento publicado — estorno exige ação manual",
    );
  }

  await prisma.$transaction([
    prisma.investorPayable.updateMany({
      where: { investorSettlementId: settlementId },
      data: { investorSettlementId: null },
    }),
    prisma.investorSettlement.update({
      where: { id: settlementId },
      data: { status: "CANCELED" },
    }),
  ]);
}

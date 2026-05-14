import { prisma } from "./prisma";

/**
 * Resolve qual fatura da UC GERADORA originou os créditos compensados em uma
 * fatura da UC consumidora.
 *
 * Heurística: o ciclo de leitura da usina dispacha créditos no `dataLeituraAtual`.
 * O consumidor recebe esses créditos na sua próxima leitura. Logo, a fatura da
 * usina que originou os créditos da consumerBill é aquela com o maior
 * `dataLeituraAtual` que seja ≤ ao `dataLeituraAtual` da consumerBill.
 *
 * Em ausência das datas de leitura, cai num fallback por `(ano, mes)`: pega a
 * última fatura da plant com (ano, mes) ≤ ao da consumerBill.
 *
 * Retorna o id da fatura da plant ou null se não foi possível identificar.
 */
export async function resolvePlantBillOrigin(args: {
  plantId: string;
  consumerBill: {
    dataLeituraAtual: Date | null;
    anoReferencia: number;
    mesReferencia: number;
  };
}): Promise<string | null> {
  const { plantId, consumerBill } = args;

  if (consumerBill.dataLeituraAtual) {
    const plantBill = await prisma.consumerBill.findFirst({
      where: {
        plantId,
        consumerUnitId: null,
        dataLeituraAtual: { not: null, lte: consumerBill.dataLeituraAtual },
      },
      orderBy: { dataLeituraAtual: "desc" },
      select: { id: true },
    });
    if (plantBill) return plantBill.id;
  }

  // Fallback por (ano, mes) — ultima fatura da plant com ano/mes <= consumer
  const fallback = await prisma.consumerBill.findFirst({
    where: {
      plantId,
      consumerUnitId: null,
      OR: [
        { anoReferencia: { lt: consumerBill.anoReferencia } },
        {
          AND: [
            { anoReferencia: consumerBill.anoReferencia },
            { mesReferencia: { lte: consumerBill.mesReferencia } },
          ],
        },
      ],
    },
    orderBy: [{ anoReferencia: "desc" }, { mesReferencia: "desc" }],
    select: { id: true },
  });
  return fallback?.id ?? null;
}

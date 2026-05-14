import { prisma } from "@/lib/prisma";

/**
 * Verifica se o faturamento mensal de uma usina foi encerrado.
 *
 * Encerramento acontece automaticamente quando o financeiro sobe o
 * comprovante de pagamento (POST /api/billing/plants/[id]/upload com
 * type=comprovante_pagamento). Apos isso, todas as edicoes do mes
 * (relatorio, payables, faturas, docs, geracao do inversor) sao
 * bloqueadas para roles != ADMIN. Apenas ADMIN reabre via /reabrir.
 */
export async function isMesEncerrado(
  plantId: string,
  ano: number,
  mes: number,
): Promise<boolean> {
  const billing = await prisma.plantBilling.findUnique({
    where: { plantId_ano_mes: { plantId, ano, mes } },
    select: { encerradoEm: true },
  });
  return !!billing?.encerradoEm;
}

/**
 * Verifica via plantBillingId direto (mais barato quando ja temos o id).
 */
export async function isPlantBillingEncerrado(
  plantBillingId: string,
): Promise<boolean> {
  const billing = await prisma.plantBilling.findUnique({
    where: { id: plantBillingId },
    select: { encerradoEm: true },
  });
  return !!billing?.encerradoEm;
}

/**
 * Resolve mes encerrado a partir de um InvestorPayable. Util pra endpoints
 * que recebem payableId e precisam saber se o mes correspondente ta travado.
 *
 * Competencia do payable = mes de geracao (originatedByPlantBill); se nao
 * houver originated bill, usa anoReferencia/mesReferencia da propria payable.
 */
export async function isMesEncerradoDoPayable(
  payableId: string,
): Promise<boolean> {
  const payable = await prisma.investorPayable.findUnique({
    where: { id: payableId },
    select: {
      plantId: true,
      anoReferencia: true,
      mesReferencia: true,
      originatedByPlantBill: {
        select: { anoReferencia: true, mesReferencia: true },
      },
    },
  });
  if (!payable) return false;
  const ano =
    payable.originatedByPlantBill?.anoReferencia ?? payable.anoReferencia;
  const mes =
    payable.originatedByPlantBill?.mesReferencia ?? payable.mesReferencia;
  return isMesEncerrado(payable.plantId, ano, mes);
}

/**
 * Verifica se algum dos payables vinculados a uma ConsumerUnitBilling
 * tem competencia (mes de geracao) em mes encerrado. Util pra bloquear
 * marcacao de pagamento manual que afetaria relatorio ja fechado.
 */
export async function isMesEncerradoDoBilling(
  consumerUnitBillingId: string,
): Promise<boolean> {
  const payables = await prisma.investorPayable.findMany({
    where: { consumerUnitBillingId },
    select: {
      plantId: true,
      anoReferencia: true,
      mesReferencia: true,
      originatedByPlantBill: {
        select: { anoReferencia: true, mesReferencia: true },
      },
    },
  });
  for (const p of payables) {
    const ano =
      p.originatedByPlantBill?.anoReferencia ?? p.anoReferencia;
    const mes =
      p.originatedByPlantBill?.mesReferencia ?? p.mesReferencia;
    if (await isMesEncerrado(p.plantId, ano, mes)) return true;
  }
  return false;
}

/**
 * Verifica encerramento a partir de um ConsumerBill (fatura) — usado nos
 * PATCH em /api/admin/faturas-energia/[id]. Bloqueia pela competencia
 * da propria fatura (anoReferencia/mesReferencia) na plant correspondente.
 */
export async function isMesEncerradoDaConsumerBill(
  consumerBillId: string,
): Promise<boolean> {
  const bill = await prisma.consumerBill.findUnique({
    where: { id: consumerBillId },
    select: { plantId: true, anoReferencia: true, mesReferencia: true },
  });
  if (!bill?.plantId) return false;
  return isMesEncerrado(bill.plantId, bill.anoReferencia, bill.mesReferencia);
}

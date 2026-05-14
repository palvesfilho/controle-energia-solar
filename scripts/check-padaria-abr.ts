import { prisma } from "../src/lib/prisma";

async function main() {
  const uc = await prisma.consumerUnit.findUnique({
    where: { codigoUc: "3095309146" },
    select: { id: true },
  });
  if (!uc) return;
  const payables = await prisma.investorPayable.findMany({
    where: { consumerUnitId: uc.id, anoReferencia: 2026, mesReferencia: 4 },
    select: {
      id: true,
      parcelaIndex: true,
      sharePercent: true,
      kwhCompensadoBase: true,
      kwhCompensadoAjuste: true,
      kwhCreditoLegadoAbatido: true,
      valorBruto: true,
      valorLiquido: true,
      valorKwhContrato: true,
    },
  });
  console.log("Payables Padaria abr/2026:", payables);

  const bill = await prisma.consumerBill.findFirst({
    where: { consumerUnitId: uc.id, anoReferencia: 2026, mesReferencia: 4 },
    select: { energiaCompensada: true, energiaInjetadaMedidorKwh: true },
  });
  console.log("Bill abr/2026:", bill);
  await prisma.$disconnect();
}
main();

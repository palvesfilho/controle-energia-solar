import { prisma } from "../src/lib/prisma";

async function main() {
  const NAPO_ID = await prisma.consumerUnit.findFirst({
    where: { codigoUc: "4002293699" },
    select: { id: true },
  });
  if (!NAPO_ID) return;

  // Payable da NAPO com origem junho/2025
  const p = await prisma.investorPayable.findFirst({
    where: {
      consumerUnitId: NAPO_ID.id,
      originatedByPlantBill: { anoReferencia: 2025, mesReferencia: 6 },
    },
    select: {
      kwhCompensadoBase: true,
      kwhCompensadoAjuste: true,
      kwhCreditoLegadoAbatido: true,
      valorBruto: true,
      anoReferencia: true,
      mesReferencia: true,
      consumerBill: {
        select: {
          anoReferencia: true,
          mesReferencia: true,
          consumoKwh: true,
          energiaCompensada: true,
          dataLeituraAnterior: true,
          dataLeituraAtual: true,
          valorTotal: true,
        },
      },
    },
  });
  console.log("Payable NAPO origem jun/2025:");
  console.log(JSON.stringify(p, null, 2));

  // Plant inj jun/2025
  const inj = await prisma.consumerBill.findFirst({
    where: { plantId: "4018f3bd-50bd-4ff9-87d4-d50b680e437b", consumerUnitId: null, anoReferencia: 2025, mesReferencia: 6 },
    select: { energiaInjetadaMedidorKwh: true },
  });
  console.log(`\nPlant injetado jun/2025: ${inj?.energiaInjetadaMedidorKwh} kWh`);
  console.log(`NAPO recebido (55%): ${((inj?.energiaInjetadaMedidorKwh ?? 0) * 0.55).toFixed(2)} kWh`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

import { prisma } from "../src/lib/prisma";

async function main() {
  const napo = await prisma.consumerUnit.findFirst({
    where: { codigoUc: "4002293699" },
  });
  console.log("NAPO id:", napo?.id);

  const bill = await prisma.consumerBill.findFirst({
    where: { consumerUnitId: napo!.id, anoReferencia: 2025, mesReferencia: 7 },
  });
  console.log("Fatura NAPO jul/2025:");
  console.log(JSON.stringify(bill, null, 2));
  if (bill) {
    const napoOwn = bill.energiaInjetadaMedidorKwh ?? 0;
    const compensada = bill.energiaCompensada ?? 0;
    console.log(`\n  energiaCompensada: ${compensada}`);
    console.log(`  energiaInjetadaMedidorKwh (NAPO): ${napoOwn}`);
    console.log(`  diferença (kWh do rateio): ${(compensada - napoOwn).toFixed(2)}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

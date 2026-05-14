import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const PLANT_ID = "c92bd286-6c47-4609-9edb-9443bc30cb77";

async function main() {
  // PlantBilling (faturamento aberto pra algum mês)
  const billings = await prisma.plantBilling.findMany({
    where: { plantId: PLANT_ID },
    orderBy: [{ ano: "asc" }, { mes: "asc" }],
  });
  console.log(`\n--- PlantBilling (${billings.length}):`);
  for (const b of billings) {
    console.log(
      `   ${b.ano}-${String(b.mes).padStart(2, "0")} | status=${b.status} | valorTotal=R$${b.valorTotal?.toFixed(2) ?? "—"}`,
    );
  }

  // ConsumerBill da UC geradora (faturas RGE da própria usina)
  const ucGeradoraBills = await prisma.consumerBill.findMany({
    where: { plantId: PLANT_ID, consumerUnitId: null },
    orderBy: [{ anoReferencia: "asc" }, { mesReferencia: "asc" }],
    select: {
      anoReferencia: true,
      mesReferencia: true,
      valorTotal: true,
      energiaInjetadaMedidorKwh: true,
      energiaCompensada: true,
      validacaoStatus: true,
    },
  });
  console.log(`\n--- ConsumerBill da UC geradora (${ucGeradoraBills.length}):`);
  for (const cb of ucGeradoraBills) {
    console.log(
      `   ${cb.anoReferencia}-${String(cb.mesReferencia).padStart(2, "0")} | injetada=${cb.energiaInjetadaMedidorKwh ?? "—"}kWh | compensada=${cb.energiaCompensada ?? "—"}kWh | valor=R$${cb.valorTotal?.toFixed(2) ?? "—"} | val=${cb.validacaoStatus ?? "—"}`,
    );
  }

  // ConsumerUnits do rateio dessa usina
  const ucs = await prisma.consumerUnit.findMany({
    where: { plantId: PLANT_ID, active: true },
    select: { id: true, codigoUc: true, nome: true },
  });
  console.log(`\n--- UCs do rateio (${ucs.length}):`);
  for (const u of ucs) {
    console.log(`   ${u.codigoUc} | ${u.nome}`);
  }

  // ConsumerBill das UCs do rateio (faturas dos consumidores)
  if (ucs.length > 0) {
    const ucBills = await prisma.consumerBill.findMany({
      where: { consumerUnitId: { in: ucs.map((u) => u.id) } },
      orderBy: [{ anoReferencia: "asc" }, { mesReferencia: "asc" }],
      select: {
        anoReferencia: true,
        mesReferencia: true,
        valorTotal: true,
        energiaCompensada: true,
        consumerUnit: { select: { codigoUc: true } },
      },
    });
    console.log(`\n--- ConsumerBill das UCs do rateio (${ucBills.length}):`);
    for (const cb of ucBills) {
      console.log(
        `   ${cb.anoReferencia}-${String(cb.mesReferencia).padStart(2, "0")} | UC ${cb.consumerUnit?.codigoUc} | compensada=${cb.energiaCompensada ?? "—"}kWh | valor=R$${cb.valorTotal?.toFixed(2) ?? "—"}`,
      );
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

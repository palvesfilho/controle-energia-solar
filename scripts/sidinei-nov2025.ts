import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const PLANT_ID = "c92bd286-6c47-4609-9edb-9443bc30cb77";

async function main() {
  // 1. Fatura da UC geradora Sidinei em Nov/2025
  const ucGeradoraNov = await prisma.consumerBill.findFirst({
    where: {
      plantId: PLANT_ID,
      consumerUnitId: null,
      anoReferencia: 2025,
      mesReferencia: 11,
    },
    select: {
      id: true,
      energiaInjetadaMedidorKwh: true,
      energiaCompensada: true,
      valorTotal: true,
    },
  });
  console.log("Fatura UC geradora Sidinei Nov/2025:");
  console.log("   ", ucGeradoraNov);

  // 2. InvestorPayable cuja origem é essa fatura
  if (ucGeradoraNov) {
    const payables = await prisma.investorPayable.findMany({
      where: { originatedByPlantBillId: ucGeradoraNov.id },
      select: {
        id: true,
        anoReferencia: true,
        mesReferencia: true,
        kwhCompensadoBase: true,
        valorLiquido: true,
        status: true,
        consumerUnit: { select: { codigoUc: true, nome: true } },
      },
    });
    console.log(`\nInvestorPayables originados desta fatura (${payables.length}):`);
    for (const p of payables) {
      console.log(
        `   ${p.anoReferencia}-${String(p.mesReferencia).padStart(2, "0")} | UC ${p.consumerUnit.codigoUc} (${p.consumerUnit.nome}) | ${p.kwhCompensadoBase}kWh | R$${p.valorLiquido} | ${p.status}`,
      );
    }
  }

  // 3. TODOS os payables dessa usina pra ver o que existe
  const todos = await prisma.investorPayable.findMany({
    where: { plantId: PLANT_ID },
    select: {
      anoReferencia: true,
      mesReferencia: true,
      originatedByPlantBillId: true,
      originatedByPlantBill: {
        select: { anoReferencia: true, mesReferencia: true },
      },
      consumerUnit: { select: { codigoUc: true } },
    },
    orderBy: [{ anoReferencia: "asc" }, { mesReferencia: "asc" }],
  });
  console.log(`\nTodos os InvestorPayables da Sidinei (${todos.length}):`);
  for (const p of todos) {
    const orig = p.originatedByPlantBill
      ? `${p.originatedByPlantBill.anoReferencia}-${String(p.originatedByPlantBill.mesReferencia).padStart(2, "0")}`
      : "(sem origem)";
    console.log(
      `   fatura UC ${p.anoReferencia}-${String(p.mesReferencia).padStart(2, "0")} | UC ${p.consumerUnit.codigoUc} | competência geração: ${orig}`,
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

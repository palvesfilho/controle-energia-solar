import { prisma } from "../src/lib/prisma";

const PLANT_ID = "4018f3bd-50bd-4ff9-87d4-d50b680e437b";

async function main() {
  const billings = await prisma.plantBilling.findMany({
    where: { plantId: PLANT_ID },
    select: { id: true, ano: true, mes: true },
    orderBy: [{ ano: "asc" }, { mes: "asc" }],
  });
  console.log("PlantBillings existentes:");
  for (const b of billings) {
    console.log(`  ${b.ano}-${String(b.mes).padStart(2, "0")}  id=${b.id}`);
  }

  const has = (a: number, m: number) => billings.some((b) => b.ano === a && b.mes === m);
  const meses: Array<[number, number]> = [[2025, 4], [2025, 5]];
  for (const [a, m] of meses) {
    if (!has(a, m)) {
      const c = await prisma.plantBilling.create({
        data: { plantId: PLANT_ID, ano: a, mes: m, status: "PENDENTE" },
      });
      console.log(`Criado ${a}-${String(m).padStart(2, "0")}: ${c.id}`);
    }
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

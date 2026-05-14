import { prisma } from "../src/lib/prisma";

const PLANT_ID = "4018f3bd-50bd-4ff9-87d4-d50b680e437b";

async function main() {
  const existing = await prisma.plantBilling.findFirst({
    where: { plantId: PLANT_ID, ano: 2025, mes: 4 },
  });
  if (existing) {
    console.log("PlantBilling 2025-04 já existe:", existing.id);
    return;
  }
  const created = await prisma.plantBilling.create({
    data: {
      plantId: PLANT_ID,
      ano: 2025,
      mes: 4,
      status: "PENDENTE",
    },
  });
  console.log("PlantBilling 2025-04 criado:", created.id);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

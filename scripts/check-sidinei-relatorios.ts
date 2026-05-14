import { prisma } from "../src/lib/prisma";

const PLANT_ID = "c92bd286-6c47-4609-9edb-9443bc30cb77";

async function main() {
  const billings = await prisma.plantBilling.findMany({
    where: { plantId: PLANT_ID },
    orderBy: [{ ano: "asc" }, { mes: "asc" }],
    select: {
      ano: true,
      mes: true,
      status: true,
      relatorioGeradoUrl: true,
      relatorioGeradoAt: true,
    },
  });
  console.log("PlantBilling da Sidinei:");
  for (const b of billings) {
    console.log(
      `   ${b.ano}-${String(b.mes).padStart(2, "0")} | status=${b.status} | relatorioGerado=${b.relatorioGeradoUrl ? "✓ SIM (em " + b.relatorioGeradoAt?.toISOString().slice(0, 16) + ")" : "✗ NÃO"}`,
    );
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });

import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const plants = await prisma.plant.findMany({
    where: { usinaDeInvestidor: true, active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  console.log(`Histórico de faturas das ${plants.length} usinas de investidor:\n`);
  console.log(
    "Usina                           | 2025-12 2026-01 2026-02 2026-03 2026-04 2026-05",
  );
  console.log("-".repeat(95));

  const cells: [number, number][] = [
    [2025, 12],
    [2026, 1],
    [2026, 2],
    [2026, 3],
    [2026, 4],
    [2026, 5],
  ];

  for (const p of plants) {
    const row = [p.name.padEnd(31).slice(0, 31)];
    for (const [ano, mes] of cells) {
      const bill = await prisma.consumerBill.findFirst({
        where: {
          plantId: p.id,
          consumerUnitId: null,
          anoReferencia: ano,
          mesReferencia: mes,
        },
        select: { id: true, pdfUrl: true },
      });
      if (!bill) row.push("  --   ");
      else if (bill.pdfUrl) row.push("  ✓   ");
      else row.push("  bill ");
    }
    console.log(row.join("|"));
  }
}

main().finally(() => prisma.$disconnect());

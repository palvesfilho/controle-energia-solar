import { prisma } from "../src/lib/prisma";

async function main() {
  const rows = await prisma.investorPayable.groupBy({
    by: ["anoReferencia", "mesReferencia", "status"],
    where: { plantId: "4018f3bd-50bd-4ff9-87d4-d50b680e437b" },
    _sum: { valorLiquido: true, kwhCompensadoBase: true },
    _count: true,
    orderBy: [{ anoReferencia: "asc" }, { mesReferencia: "asc" }],
  });
  for (const r of rows) {
    console.log(
      `${r.anoReferencia}-${String(r.mesReferencia).padStart(2, "0")} ${r.status.padEnd(25)} ${r._count.toString().padStart(2)} payables  R$ ${(r._sum.valorLiquido ?? 0).toFixed(2).padStart(10)}  ${(r._sum.kwhCompensadoBase ?? 0).toFixed(0).padStart(6)} kWh`,
    );
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

import { prisma } from "../src/lib/prisma";

async function main() {
  const reports = await prisma.monthlyReport.findMany({
    where: { plantId: "4018f3bd-50bd-4ff9-87d4-d50b680e437b" },
    select: { id: true, ano: true, mes: true, status: true, publishedAt: true },
    orderBy: [{ ano: "asc" }, { mes: "asc" }],
  });
  console.log(JSON.stringify(reports, null, 2));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

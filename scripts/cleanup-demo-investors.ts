import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEMO_EMAILS = [
  "dalmagro@solar.com",
  "fontanella@solar.com",
  "investidor@solar.com",
  "menegotto@solar.com",
  "rossato@solar.com",
];

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const investors = await prisma.investor.findMany({
    where: { user: { email: { in: DEMO_EMAILS } } },
    include: {
      user: { select: { id: true, name: true, email: true } },
      _count: {
        select: {
          plants: true,
          payables: true,
          reports: true,
          settlements: true,
          debits: true,
        },
      },
    },
  });

  console.log(`Encontrados ${investors.length} investidores demo:`);
  for (const i of investors) {
    console.log(
      ` - ${i.user.name} (${i.user.email}) — plants:${i._count.plants} payables:${i._count.payables} reports:${i._count.reports} settlements:${i._count.settlements} debits:${i._count.debits}`,
    );
  }

  const hasRelations = investors.some(
    (i) =>
      i._count.plants > 0 ||
      i._count.payables > 0 ||
      i._count.reports > 0 ||
      i._count.settlements > 0 ||
      i._count.debits > 0,
  );

  if (hasRelations) {
    console.error("\nABORTADO: algum investidor tem relações. Verificar antes de apagar.");
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log("\n--dry-run — nada apagado.");
    return;
  }

  const userIds = investors.map((i) => i.user.id);
  const result = await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  console.log(`\nApagados ${result.count} usuários (cascata em Investor).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

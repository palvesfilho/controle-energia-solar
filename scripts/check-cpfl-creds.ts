import { prisma } from "../src/lib/prisma";

async function main() {
  const count = await prisma.cpflCredential.count();
  console.log("CpflCredential registros:", count);
  if (count === 0) return;
  const rows = await prisma.cpflCredential.findMany({
    take: 5,
    select: {
      id: true,
      emailCpfl: true,
      instalacao: true,
      distribuidora: true,
      active: true,
      statusSync: true,
      ultimaSync: true,
      consumerUnitId: true,
    },
  });
  console.log(JSON.stringify(rows, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

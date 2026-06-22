import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const investors = await prisma.investor.findMany({
    include: {
      user: { select: { name: true, email: true } },
      _count: { select: { plants: true, payables: true } },
    },
    orderBy: { user: { name: "asc" } },
  });

  console.log(`TOTAL: ${investors.length}`);
  console.log(
    JSON.stringify(
      investors.map((i) => ({
        name: i.user.name,
        email: i.user.email,
        cpf: i.cpf,
        cnpj: i.cnpj,
        nomeEmpresa: i.nomeEmpresa,
        plantas: i._count.plants,
        payables: i._count.payables,
      })),
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

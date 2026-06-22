import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const inv = await prisma.investor.findFirst({
    where: { user: { email: "investidor@solar.com" } },
    select: { id: true, user: { select: { name: true } } },
  });
  if (!inv) {
    console.log("Investidor demo nao encontrado");
    return;
  }
  console.log(`Detalhes:  http://localhost:3000/admin/investidores/${inv.id}`);
  console.log(`Editar:    http://localhost:3000/admin/investidores/${inv.id}/editar`);
  console.log(`(${inv.user.name})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

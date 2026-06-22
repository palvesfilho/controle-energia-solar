import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { email: { contains: "paulo", mode: "insensitive" } },
        { email: { contains: "solvesm", mode: "insensitive" } },
        { role: { in: ["ADMIN", "GESTOR"] } },
      ],
    },
    select: { id: true, name: true, email: true, role: true, active: true },
    orderBy: { name: "asc" },
  });

  console.log(JSON.stringify(users, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

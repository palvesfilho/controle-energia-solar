import { PrismaClient } from "@prisma/client";
import { compare } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2] ?? "admin@solar.com";
  const candidate = process.argv[3] ?? "134679";

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, role: true, passwordHash: true, active: true },
  });

  if (!user) {
    console.log(`Usuario nao encontrado: ${email}`);
    return;
  }

  const ok = await compare(candidate, user.passwordHash);
  console.log({
    email: user.email,
    name: user.name,
    role: user.role,
    active: user.active,
    senhaCandidata: candidate,
    senhaCorreta: ok,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

import { PrismaClient } from "@prisma/client";
import { hashSync } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Criando usuários de teste para cada perfil...\n");

  const users = [
    {
      email: "admin@solar.com",
      name: "Administrador",
      password: "admin123",
      role: "ADMIN",
    },
    {
      email: "gestor@solar.com",
      name: "Gestor de Operações",
      password: "gestor123",
      role: "GESTOR",
    },
    {
      email: "financeiro@solar.com",
      name: "Equipe Financeira",
      password: "financeiro123",
      role: "FINANCEIRO",
    },
    {
      email: "investidor@solar.com",
      name: "Investidor Demo",
      password: "investidor123",
      role: "INVESTOR",
    },
    {
      email: "consumidor@solar.com",
      name: "Consumidor Demo",
      password: "consumidor123",
      role: "CONSUMER",
    },
  ];

  for (const u of users) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        role: u.role,
        active: true,
      },
      create: {
        email: u.email,
        name: u.name,
        passwordHash: hashSync(u.password, 10),
        role: u.role,
        active: true,
      },
    });
    console.log(`✓ ${u.role.padEnd(12)} | ${u.email.padEnd(28)} | senha: ${u.password}`);

    // Cria registro Investor vinculado se for INVESTOR
    if (u.role === "INVESTOR") {
      await prisma.investor.upsert({
        where: { userId: user.id },
        update: {},
        create: {
          userId: user.id,
          phone: "(51) 99999-0000",
          document: "000.000.000-00",
        },
      });
    }
  }

  console.log("\nTodos os usuários de teste foram criados/atualizados.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

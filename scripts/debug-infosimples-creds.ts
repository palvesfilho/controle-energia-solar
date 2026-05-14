import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { decrypt } from "../src/lib/crypto";

async function main() {
  const creds = await prisma.cpflCredential.findMany({ where: { active: true } });
  for (const c of creds) {
    const senha = decrypt(c.senhaCpfl);
    console.log(`Instalacao: ${c.instalacao}`);
    console.log(`  Email: ${c.emailCpfl}`);
    console.log(`  Senha: ${senha}`);
    console.log(`  Status: ${c.statusSync} | Erro: ${c.erroSync ?? "-"}`);
    console.log("");
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

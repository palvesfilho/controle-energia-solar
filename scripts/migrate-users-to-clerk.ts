/**
 * Migração de users do Postgres → Clerk (Dia 2 da Fase 1).
 *
 * Por padrão roda em DRY-RUN: lista o que faria sem criar nada.
 * Flags:
 *   --only=email@x.com   migra apenas 1 user (ideal pra validar)
 *   --all                migra todos os users ativos
 *   --include-test       não pula emails @solar.com (default: pula)
 *   --ensure-paulo       garante que paulo.alves@redebrasilsolar.com.br exista como ADMIN
 *
 * Estratégia:
 *   - Cria o user no Clerk via @clerk/backend com skipPasswordRequirement=true
 *   - Grava publicMetadata.role com o role do Postgres (lido pelo middleware)
 *   - Grava o clerkId retornado na tabela User local
 *   - NÃO dispara email de reset automaticamente — fluxo separado depois
 *
 * Rodar:
 *   NODE_OPTIONS=--use-system-ca npx tsx scripts/migrate-users-to-clerk.ts
 *   NODE_OPTIONS=--use-system-ca npx tsx scripts/migrate-users-to-clerk.ts --only=paulo.alves@redebrasilsolar.com.br
 *   NODE_OPTIONS=--use-system-ca npx tsx scripts/migrate-users-to-clerk.ts --all
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { createClerkClient } from "@clerk/backend";

const args = process.argv.slice(2);
const flag = (name: string) => args.some((a) => a === `--${name}`);
const param = (name: string) => {
  const found = args.find((a) => a.startsWith(`--${name}=`));
  return found ? found.split("=")[1] : null;
};

const ONLY = param("only");
const ALL = flag("all");
const INCLUDE_TEST = flag("include-test");
const ENSURE_PAULO = flag("ensure-paulo");
const DRY_RUN = !ALL && !ONLY && !ENSURE_PAULO;

const PAULO_EMAIL = "paulo.alves@redebrasilsolar.com.br";

const prisma = new PrismaClient();
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

async function findClerkUserByEmail(email: string) {
  const list = await clerk.users.getUserList({ emailAddress: [email] });
  return list.data[0] ?? null;
}

async function migrateOne(user: { id: string; email: string; name: string; role: string; clerkId: string | null }, dryRun: boolean): Promise<"skipped" | "linked" | "created" | "error"> {
  if (user.clerkId) {
    console.log(`  ↪ ${user.email} já tem clerkId (${user.clerkId}) — skip`);
    return "skipped";
  }

  const existing = await findClerkUserByEmail(user.email);
  if (existing) {
    console.log(`  ↪ ${user.email} já existe no Clerk (${existing.id}) — só linkando`);
    if (!dryRun) {
      await prisma.user.update({ where: { id: user.id }, data: { clerkId: existing.id } });
      await clerk.users.updateUserMetadata(existing.id, { publicMetadata: { role: user.role } });
    }
    return "linked";
  }

  console.log(`  ${dryRun ? "[DRY]" : "→   "} criando ${user.email} no Clerk (role=${user.role})`);
  if (dryRun) return "created";

  try {
    const [firstName, ...rest] = user.name.split(" ");
    const created = await clerk.users.createUser({
      emailAddress: [user.email],
      firstName: firstName || user.email.split("@")[0],
      lastName: rest.join(" ") || undefined,
      skipPasswordRequirement: true,
      publicMetadata: { role: user.role },
    });
    await prisma.user.update({ where: { id: user.id }, data: { clerkId: created.id } });
    return "created";
  } catch (err) {
    console.error(`  ✖ falhou ${user.email}:`, err instanceof Error ? err.message : err);
    return "error";
  }
}

async function ensurePaulo(dryRun: boolean): Promise<"skipped" | "created" | "linked"> {
  const localPaulo = await prisma.user.findUnique({ where: { email: PAULO_EMAIL } });

  const existingClerk = await findClerkUserByEmail(PAULO_EMAIL);

  if (existingClerk && localPaulo?.clerkId === existingClerk.id) {
    console.log(`  ↪ Paulo já existe e está linkado (${existingClerk.id}) — skip`);
    return "skipped";
  }

  console.log(`  ${dryRun ? "[DRY]" : "→   "} garantindo Paulo (ADMIN) no Clerk + Postgres`);
  if (dryRun) return "created";

  let clerkUser = existingClerk;
  if (!clerkUser) {
    clerkUser = await clerk.users.createUser({
      emailAddress: [PAULO_EMAIL],
      firstName: "Paulo",
      lastName: "Alves",
      skipPasswordRequirement: true,
      publicMetadata: { role: "ADMIN" },
    });
  } else {
    await clerk.users.updateUserMetadata(clerkUser.id, { publicMetadata: { role: "ADMIN" } });
  }

  if (localPaulo) {
    await prisma.user.update({ where: { id: localPaulo.id }, data: { clerkId: clerkUser.id, role: "ADMIN", active: true } });
    return "linked";
  }

  await prisma.user.create({
    data: {
      email: PAULO_EMAIL,
      name: "Paulo Alves",
      role: "ADMIN",
      active: true,
      clerkId: clerkUser.id,
      passwordHash: "",
    },
  });
  return "created";
}

async function main() {
  console.log("=".repeat(60));
  console.log(`Modo: ${DRY_RUN ? "DRY-RUN" : ENSURE_PAULO ? "ENSURE-PAULO" : ALL ? "MIGRAR TODOS ATIVOS" : `MIGRAR APENAS ${ONLY}`}`);
  console.log(`Incluir @solar.com? ${INCLUDE_TEST ? "sim" : "não (use --include-test pra incluir)"}`);
  console.log("=".repeat(60));

  if (ENSURE_PAULO) {
    const result = await ensurePaulo(false);
    console.log(`\nPaulo: ${result}`);
    return;
  }

  const where: Parameters<typeof prisma.user.findMany>[0] = { where: { active: true } };
  if (ONLY) where.where = { ...where.where, email: ONLY };

  const users = await prisma.user.findMany({
    ...where,
    select: { id: true, email: true, name: true, role: true, clerkId: true },
    orderBy: { createdAt: "asc" },
  });

  console.log(`\n${users.length} user(s) candidato(s):\n`);

  const stats = { skipped: 0, linked: 0, created: 0, error: 0, filtered: 0 };

  for (const user of users) {
    if (!INCLUDE_TEST && user.email.endsWith("@solar.com")) {
      console.log(`  ⊘ ${user.email} filtrado (email de teste @solar.com)`);
      stats.filtered++;
      continue;
    }
    const r = await migrateOne(user, DRY_RUN);
    stats[r]++;
  }

  console.log("\n" + "=".repeat(60));
  console.log("Resumo:", stats);
  if (DRY_RUN) {
    console.log("\nDRY-RUN — nada foi criado. Rode com --only=EMAIL pra migrar 1, ou --all pra migrar todos.");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

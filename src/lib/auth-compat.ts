/**
 * Shim de compatibilidade NextAuth → Clerk.
 *
 * Substituto drop-in pro `getServerSession` do `next-auth`: mantém o mesmo
 * shape de retorno (`{ user: { id, role, email, name, image? } } | null`),
 * mas a fonte da sessão é o Clerk (`currentUser()`), com lookup local pelo
 * `clerkId` pra recuperar o `User` do Postgres.
 *
 * Por que essa indireção: o app tem 174 arquivos chamando `getServerSession`
 * direto. Em vez de refatorar todos, troca-se só o import de `next-auth`
 * para `@/lib/auth-compat` e o restante segue inalterado.
 *
 * Quando a refatoração final acontecer (cada call site usando Clerk
 * diretamente), este shim some.
 */
import { currentUser } from "@clerk/nextjs/server";
import { prisma } from "./prisma";
import type { UserRole } from "@/types/next-auth";

type ClerkUser = NonNullable<Awaited<ReturnType<typeof currentUser>>>;

type LocalUser = {
  id: string;
  role: string;
  email: string;
  name: string;
  active: boolean;
};

export interface CompatSession {
  user: {
    id: string;
    role: UserRole;
    email: string;
    name: string;
    image?: string | null;
  };
}

const ALLOWED_ROLES = new Set<UserRole>([
  "ADMIN",
  "GESTOR",
  "FINANCEIRO",
  "POS_VENDA",
  "GESTOR_OBRA",
  "INVESTOR",
  "CONSUMER",
  "CLIENTE_BS",
]);

function readRole(publicMetadata: unknown): UserRole {
  if (publicMetadata && typeof publicMetadata === "object") {
    const role = (publicMetadata as Record<string, unknown>).role;
    if (typeof role === "string" && ALLOWED_ROLES.has(role as UserRole)) {
      return role as UserRole;
    }
  }
  return "INVESTOR";
}

function readProprietarioId(publicMetadata: unknown): string | null {
  if (publicMetadata && typeof publicMetadata === "object") {
    const pid = (publicMetadata as Record<string, unknown>).proprietarioId;
    if (typeof pid === "string" && pid) return pid;
  }
  return null;
}

function primaryEmail(clerkUser: ClerkUser): string | null {
  const primary = clerkUser.emailAddresses.find(
    (e) => e.id === clerkUser.primaryEmailAddressId,
  );
  return (
    primary?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress ??
    null
  );
}

const PRIVILEGED_ROLES: UserRole[] = [
  "ADMIN",
  "GESTOR",
  "FINANCEIRO",
  "POS_VENDA",
  "GESTOR_OBRA",
];

/**
 * Descobre o proprietário Brasil Solar vinculável a este login.
 *
 * 1) `proprietarioId` no `publicMetadata` (setado pelo convite Clerk) — caminho feliz.
 * 2) Fallback por e-mail: contas de CORTESIA não passam pelo convite (não têm
 *    `proprietarioId` no metadata), e logins por SSO (Google) também não. Se o
 *    e-mail do login casar com UM proprietário ATIVO, com acesso concedido e
 *    ainda não vinculado, vincula por aí. Exige match único pra não vincular errado.
 */
async function resolveProprietarioId(clerkUser: ClerkUser, email: string): Promise<string | null> {
  const fromMeta = readProprietarioId(clerkUser.publicMetadata);
  if (fromMeta) return fromMeta;

  const matches = await prisma.brasilSolarProprietario.findMany({
    where: {
      email: { equals: email, mode: "insensitive" },
      active: true,
      acesso: { isNot: null },
      OR: [{ clerkUserId: null }, { clerkUserId: clerkUser.id }],
    },
    select: { id: true },
    take: 2,
  });
  return matches.length === 1 ? matches[0].id : null;
}

/**
 * Garante que existe um `User` local espelhando o usuário Clerk autenticado.
 *
 * O webhook Clerk (`user.created`) normalmente cria essa linha, mas depende de
 * configuração no painel e de timing. Sem ela, `getServerSession` retornava
 * `null` e disparava o loop de login do CLIENTE_BS (login ↔ portal). Aqui a
 * linha é criada sob demanda. Também vincula o proprietário Brasil Solar
 * (por `proprietarioId` do metadata ou por e-mail) pro `/portal-cliente` achar
 * por `clerkUserId` mesmo sem o webhook. Se vinculou um proprietário e a conta
 * não é privilegiada, promove o login a `CLIENTE_BS`. Idempotente e seguro em
 * corrida com o webhook.
 */
export async function ensureLocalUser(clerkUser: ClerkUser): Promise<LocalUser | null> {
  const email = primaryEmail(clerkUser);
  if (!email) return null;

  const name =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ").trim() ||
    email.split("@")[0];

  const existing = await prisma.user.findUnique({
    where: { clerkId: clerkUser.id },
    select: { id: true, role: true, email: true, name: true, active: true },
  });

  const proprietarioId = await resolveProprietarioId(clerkUser, email);

  // Role final: se há proprietário BS vinculável e a conta não é privilegiada,
  // é CLIENTE_BS. Senão preserva o role atual (se existe) ou lê do metadata.
  const privileged = !!existing && PRIVILEGED_ROLES.includes(existing.role as UserRole);
  const role: UserRole =
    proprietarioId && !privileged
      ? "CLIENTE_BS"
      : (existing?.role as UserRole) ?? readRole(clerkUser.publicMetadata);

  // Só escreve o role quando muda (evita write a cada carga do portal).
  const roleChanged = !existing || existing.role !== role;

  const dbUser = existing && !roleChanged
    ? existing
    : await prisma.user.upsert({
        where: { clerkId: clerkUser.id },
        create: {
          clerkId: clerkUser.id,
          email,
          name,
          role,
          passwordHash: "",
          active: true,
        },
        update: { role },
        select: { id: true, role: true, email: true, name: true, active: true },
      });

  if (proprietarioId) {
    // Vincula sempre por id (idempotente), igual o webhook Clerk. NÃO usar
    // `NOT: { clerkUserId }` como guarda: em SQL `NOT (col = X)` é UNKNOWN quando
    // col é NULL, então proprietários nunca vinculados (clerkUserId NULL, o caso
    // comum) não casariam e o vínculo jamais era escrito.
    await prisma.brasilSolarProprietario.updateMany({
      where: { id: proprietarioId },
      data: { clerkUserId: clerkUser.id },
    });
  }

  return dbUser;
}

export async function getServerSession(_optionsIgnoradas?: unknown): Promise<CompatSession | null> {
  const clerkUser = await currentUser();
  if (!clerkUser) return null;

  let dbUser: LocalUser | null = await prisma.user.findUnique({
    where: { clerkId: clerkUser.id },
    select: { id: true, role: true, email: true, name: true, active: true },
  });

  // Lazy-provision: Clerk autenticou mas ainda não há User local (webhook off
  // ou atrasado). Cria a linha na hora pra não cair no loop de login.
  if (!dbUser) {
    dbUser = await ensureLocalUser(clerkUser);
  }

  if (!dbUser || !dbUser.active) return null;

  return {
    user: {
      id: dbUser.id,
      role: dbUser.role as UserRole,
      email: dbUser.email,
      name: dbUser.name,
      image: clerkUser.imageUrl ?? null,
    },
  };
}

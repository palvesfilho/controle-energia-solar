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

export interface CompatSession {
  user: {
    id: string;
    role: UserRole;
    email: string;
    name: string;
    image?: string | null;
  };
}

export async function getServerSession(_optionsIgnoradas?: unknown): Promise<CompatSession | null> {
  const clerkUser = await currentUser();
  if (!clerkUser) return null;

  const dbUser = await prisma.user.findUnique({
    where: { clerkId: clerkUser.id },
    select: { id: true, role: true, email: true, name: true, active: true },
  });

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

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection, type AdminSection } from "@/lib/roles";
import { UserRole } from "@/types/next-auth";

export interface AuthedSession {
  userId: string;
  role: UserRole;
  email: string;
  name: string;
}

/**
 * Helper para guardas de rota baseadas em section.
 *
 * Uso:
 *   const guard = await requireSection("obra");
 *   if (!guard.ok) return guard.response;
 *   const { session } = guard;
 *
 * Retorna 401 se não autenticado, 403 se role não pertence à section.
 */
export async function requireSection(
  section: AdminSection,
): Promise<
  | { ok: true; session: AuthedSession }
  | { ok: false; response: NextResponse }
> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.role) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Não autenticado" }, { status: 401 }),
    };
  }
  const role = session.user.role as UserRole;
  if (!canAccessSection(role, section)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Sem permissão" }, { status: 403 }),
    };
  }
  return {
    ok: true,
    session: {
      userId: session.user.id,
      role,
      email: session.user.email ?? "",
      name: session.user.name ?? "",
    },
  };
}

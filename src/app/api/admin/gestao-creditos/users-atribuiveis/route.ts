import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { canAccessSection } from "@/lib/roles";

// Lista de usuários que podem ser responsáveis por ações da Análise de Créditos.
// Restrito aos roles operacionais (não inclui INVESTOR/CONSUMER).
const ROLES_ATRIBUIVEIS = ["ADMIN", "GESTOR", "FINANCEIRO", "POS_VENDA"];

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !canAccessSection(session.user.role, "gestaoCreditos")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const users = await prisma.user.findMany({
    where: { active: true, role: { in: ROLES_ATRIBUIVEIS } },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(users);
}

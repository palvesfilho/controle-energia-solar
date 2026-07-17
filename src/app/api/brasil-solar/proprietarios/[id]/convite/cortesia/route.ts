/**
 * POST /api/brasil-solar/proprietarios/[id]/convite/cortesia
 *
 * Libera acesso de CORTESIA (gratuito) ao portal do cliente, sem passar pelo
 * Asaas. Exige a senha do próprio admin logado como confirmação — validada
 * contra o passwordHash do usuário (mesmo bcrypt do login).
 *
 * Body: { inicio: "YYYY-MM-DD", fim: "YYYY-MM-DD", senha: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { criarAcessoCortesia } from "@/lib/brasil-solar-acesso";

/** Parseia "YYYY-MM-DD" como início do dia em UTC (evita deslocar -1 dia em BRT). */
function parseInicio(s: unknown): Date | null {
  if (typeof s !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0));
}

/** Parseia "YYYY-MM-DD" como fim do dia em UTC (janela inclusiva no dia de fim). */
function parseFim(s: unknown): Date | null {
  if (typeof s !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  return new Date(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999),
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);

  const inicio = parseInicio(body?.inicio);
  const fim = parseFim(body?.fim);
  const senha = typeof body?.senha === "string" ? body.senha : "";

  if (!inicio || !fim) {
    return NextResponse.json(
      { error: "Informe início e fim válidos (data)." },
      { status: 400 },
    );
  }
  if (fim.getTime() <= inicio.getTime()) {
    return NextResponse.json(
      { error: "A data de fim deve ser posterior à de início." },
      { status: 400 },
    );
  }
  if (!senha) {
    return NextResponse.json(
      { error: "Digite sua senha para liberar a cortesia." },
      { status: 400 },
    );
  }

  // Confirma a senha do próprio admin logado — validada pelo CLERK (fonte de
  // verdade da autenticação). O `passwordHash` local fica vazio para contas
  // criadas via Clerk, então NÃO serve para essa checagem.
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { clerkId: true, active: true },
  });
  if (!user || !user.active) {
    return NextResponse.json({ error: "Usuário inválido." }, { status: 401 });
  }
  if (!user.clerkId) {
    return NextResponse.json(
      { error: "Sua conta não tem login Clerk para confirmar a senha." },
      { status: 400 },
    );
  }
  try {
    const clerk = await clerkClient();
    await clerk.users.verifyPassword({ userId: user.clerkId, password: senha });
  } catch {
    // verifyPassword lança quando a senha está errada.
    return NextResponse.json({ error: "Senha incorreta." }, { status: 403 });
  }

  try {
    const result = await criarAcessoCortesia({ proprietarioId: id, inicio, fim });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao liberar cortesia.";
    console.error("[convite/cortesia] erro:", msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

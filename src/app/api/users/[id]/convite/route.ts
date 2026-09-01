/**
 * Emite o acesso de um usuário já cadastrado: cria o convite no Clerk e dispara
 * o e-mail de cadastro.
 *
 * Rota SEPARADA do POST /api/users de propósito. Criar a linha e mandar e-mail
 * são decisões diferentes: o operador cadastra quando quiser e só aperta o
 * botão quando a pessoa realmente vai receber. Nada aqui roda automático.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { podeEmitirAcesso, podeGerenciarUsuario } from "@/lib/roles";
import { enviarConviteAcessoUsuario } from "@/lib/clerk-invite";
import type { UserRole } from "@/types/next-auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || !podeEmitirAcesso(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, role: true, active: true, clerkId: true },
  });
  if (!user) {
    return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
  }

  if (!podeGerenciarUsuario(session.user.role, user.role)) {
    return NextResponse.json(
      { error: "Este usuário está acima da sua alçada" },
      { status: 403 }
    );
  }

  if (!user.active) {
    return NextResponse.json(
      { error: "Usuário está inativo. Ative antes de emitir o acesso." },
      { status: 400 }
    );
  }

  if (user.clerkId) {
    return NextResponse.json(
      { error: "Este usuário já tem acesso emitido." },
      { status: 400 }
    );
  }

  try {
    const { invitationId } = await enviarConviteAcessoUsuario({
      email: user.email,
      role: user.role as UserRole,
    });
    console.info(
      `[convite] ${session.user.email} emitiu acesso ${user.role} para ${user.email} (${invitationId})`,
    );
    return NextResponse.json({ invitationId, email: user.email });
  } catch (err) {
    // Erro típico: o e-mail já tem conta Clerk (`duplicate_record`). Devolver a
    // mensagem crua ajuda o operador a distinguir isso de "o Clerk caiu".
    const msg = err instanceof Error ? err.message : "falha ao criar convite";
    console.error(`[convite] falha para ${user.email}`, err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

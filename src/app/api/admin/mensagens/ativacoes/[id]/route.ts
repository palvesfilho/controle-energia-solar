import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { ligarAtivacao } from "@/lib/mensagens-ativacoes";

export const runtime = "nodejs";

const schema = z.object({ ativa: z.boolean() });

/**
 * PATCH — liga ou desliga a regra.
 *
 * ⚠️ Ligar é a única aprovação que existe nesta divisão: a partir daqui a
 * mensagem sai sem ninguém conferir cada envio. Por isso `ligarAtivacao`
 * carimba `ativadaEm`, que faz a regra ignorar tudo que já estava acontecendo
 * antes deste clique.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "mensagens")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const corpo = schema.safeParse(await req.json().catch(() => null));
  if (!corpo.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const existe = await prisma.ativacao.findUnique({ where: { id }, select: { id: true } });
  if (!existe) {
    return NextResponse.json({ error: "Ativação não encontrada" }, { status: 404 });
  }

  await ligarAtivacao(id, corpo.data.ativa);
  return NextResponse.json({ ok: true });
}

/** DELETE — some com a regra e o histórico dela (Cascade nos envios). */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "mensagens")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const regra = await prisma.ativacao.findUnique({
    where: { id },
    select: { ativa: true },
  });
  if (!regra) {
    return NextResponse.json({ error: "Ativação não encontrada" }, { status: 404 });
  }
  // Desligar antes de excluir força um passo consciente: quem quer parar a
  // regra normalmente quer só desligá-la, e apagar leva o histórico junto.
  if (regra.ativa) {
    return NextResponse.json(
      { error: "Desligue a ativação antes de excluir." },
      { status: 400 },
    );
  }

  await prisma.ativacao.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

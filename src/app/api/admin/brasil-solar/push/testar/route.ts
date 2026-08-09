import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { enviarPushProprietario } from "@/lib/push-notificacoes";

export const runtime = "nodejs";

const schemaTeste = z.object({
  proprietarioId: z.string().min(1),
  titulo: z.string().trim().min(1).max(80),
  mensagem: z.string().trim().min(1).max(300),
});

/**
 * POST /api/admin/brasil-solar/push/testar
 *
 * Dispara um aviso escrito à mão para TODOS os aparelhos inscritos de um
 * proprietário. É o botão de teste do pós-venda — nada aqui é automático.
 *
 * ⚠️ Isto toca o celular de uma pessoa de verdade. Protegido pela section
 * `brasilSolar`, e a tela pede confirmação antes de enviar.
 *
 * Os limites de tamanho não são decoração: Android corta o título por volta de
 * 50 caracteres e o corpo na segunda linha. Deixar digitar um texto que o
 * aparelho vai truncar só produz teste enganoso.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const corpo = schemaTeste.safeParse(await req.json().catch(() => null));
  if (!corpo.success) {
    return NextResponse.json(
      { error: corpo.error.issues[0]?.message ?? "Dados inválidos" },
      { status: 400 },
    );
  }

  const { proprietarioId, titulo, mensagem } = corpo.data;

  const prop = await prisma.brasilSolarProprietario.findUnique({
    where: { id: proprietarioId },
    select: { id: true, nome: true },
  });
  if (!prop) {
    return NextResponse.json({ error: "Proprietário não encontrado" }, { status: 404 });
  }

  try {
    const resultado = await enviarPushProprietario(prop.id, {
      titulo,
      mensagem,
      // `tag` fixa: dois testes seguidos substituem um ao outro no celular em
      // vez de empilhar duas notificações quase iguais.
      tag: "teste-admin",
    });
    return NextResponse.json(resultado);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha ao enviar" },
      { status: 500 },
    );
  }
}

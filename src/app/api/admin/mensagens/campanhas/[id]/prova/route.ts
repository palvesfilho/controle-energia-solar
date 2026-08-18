import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { enviarProva } from "@/lib/mensagens-campanha";

export const runtime = "nodejs";

const schema = z.object({ proprietarioId: z.string().min(1) });

/**
 * POST /api/admin/mensagens/campanhas/[id]/prova
 *
 * Manda a campanha para UM cliente escolhido (na prática, o celular de quem
 * está escrevendo) sem gravar caixa de avisos nem consumir a campanha. Serve
 * para ver o corte do título no aparelho antes de alcançar a base inteira.
 *
 * ⚠️ O aparelho tem de estar inscrito no proprietário escolhido. Mandar prova
 * para o cliente errado é um push real na mão de um cliente real.
 */
export async function POST(
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
    return NextResponse.json({ error: "proprietarioId obrigatório" }, { status: 400 });
  }

  const campanha = await prisma.campanha.findUnique({
    where: { id },
    select: { titulo: true, mensagem: true },
  });
  if (!campanha) {
    return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 });
  }

  try {
    const r = await enviarProva(corpo.data.proprietarioId, campanha.titulo, campanha.mensagem);
    return NextResponse.json(r);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha ao enviar a prova" },
      { status: 500 },
    );
  }
}

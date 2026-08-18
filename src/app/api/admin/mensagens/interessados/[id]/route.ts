import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const schema = z.object({ acao: z.enum(["ATENDER", "REABRIR"]) });

/**
 * PATCH /api/admin/mensagens/interessados/[id]
 *
 * Baixa (ou reabre) o lead. Enquanto `atendidoEm` for null o cliente aparece no
 * sino do AURA — é isso que faz o aviso parar de tocar quando alguém já ligou,
 * em vez de mostrar os mesmos nomes para sempre.
 *
 * Guarda o NOME de quem atendeu, não só a data: com duas pessoas no pós-venda,
 * "já foi atendido" sem dizer por quem gera a segunda ligação para o mesmo
 * cliente, oferecendo a mesma coisa.
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
    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  }

  const envio = await prisma.campanhaEnvio.findUnique({
    where: { id },
    select: { id: true, interesseEm: true },
  });
  if (!envio) {
    return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 });
  }
  // Só existe atendimento sobre um interesse: marcar "atendido" em quem nunca
  // levantou a mão sumiria com uma linha que nunca esteve na fila.
  if (!envio.interesseEm) {
    return NextResponse.json(
      { error: "Este cliente não demonstrou interesse nesta campanha." },
      { status: 400 },
    );
  }

  const atender = corpo.data.acao === "ATENDER";
  await prisma.campanhaEnvio.update({
    where: { id },
    data: {
      atendidoEm: atender ? new Date() : null,
      atendidoPorNome: atender ? session.user.name : null,
    },
  });

  return NextResponse.json({ ok: true });
}

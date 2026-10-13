import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { CANAIS_CONTATO, RESULTADOS_CONTATO } from "@/lib/acoes-diarias-contato";

export const runtime = "nodejs";

const schemaContato = z
  .object({
    clientId: z.string().min(1).optional(),
    proprietarioId: z.string().min(1).optional(),
    alertaId: z.string().min(1).optional(),
    canal: z.enum(CANAIS_CONTATO),
    resultado: z.enum(RESULTADOS_CONTATO),
    observacao: z.string().trim().max(2000).optional(),
  })
  .refine((c) => c.clientId || c.proprietarioId, {
    message: "Informe a usina ou o cliente do contato",
  });

/**
 * POST /api/admin/brasil-solar/contatos
 *
 * Registra um contato do pós-venda com o cliente (Ações Diárias). Só grava o
 * histórico: nada aqui envia mensagem a ninguém.
 *
 * Contato ligado a um alerta ABERTO passa o alerta para EM_ANDAMENTO — é o que
 * tira a linha de "a fazer". O alerta NÃO é resolvido por aqui, nem quando o
 * resultado é "cliente orientado": quem fecha é o coletor, quando a usina volta
 * a entregar dado. O que o cliente diz ao telefone não é a prova.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const corpo = schemaContato.safeParse(await req.json().catch(() => null));
  if (!corpo.success) {
    return NextResponse.json(
      { error: corpo.error.issues[0]?.message ?? "Dados inválidos" },
      { status: 400 },
    );
  }
  const { clientId, proprietarioId, alertaId, canal, resultado, observacao } = corpo.data;

  if (alertaId) {
    const alerta = await prisma.monitoringAlert.findUnique({
      where: { id: alertaId },
      select: { clientId: true },
    });
    if (!alerta || (clientId && alerta.clientId !== clientId)) {
      return NextResponse.json({ error: "Alerta não encontrado para esta usina" }, { status: 404 });
    }
  }

  try {
    const [contato] = await prisma.$transaction([
      prisma.brasilSolarContato.create({
        data: {
          clientId: clientId ?? null,
          proprietarioId: proprietarioId ?? null,
          alertaId: alertaId ?? null,
          userId: session.user.id,
          canal,
          resultado,
          observacao: observacao || null,
        },
        select: { id: true },
      }),
      ...(alertaId
        ? [
            prisma.monitoringAlert.updateMany({
              where: { id: alertaId, status: "ABERTO" },
              data: { status: "EM_ANDAMENTO" },
            }),
          ]
        : []),
    ]);
    return NextResponse.json({ ok: true, id: contato.id });
  } catch (err) {
    console.error("[POST /api/admin/brasil-solar/contatos]", err);
    return NextResponse.json({ error: "Não foi possível registrar o contato" }, { status: 500 });
  }
}

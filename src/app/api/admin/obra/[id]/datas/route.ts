import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";
import { buscarConflitosEquipe, startOfDay } from "@/lib/obra-calendario";

interface Body {
  dataInicioPrevista?: string | null;
  dataFimPrevista?: string | null;
  prioridade?: string | null;
  status?: string | null;
  observacoes?: string | null;
  equipeId?: string | null;
}

// Aceita ISO com ou sem hora; normaliza para início do dia em UTC-consistent.
function parseDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) return null;
  return startOfDay(d);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const body = (await req.json()) as Body;

  const atual = await prisma.obra.findUnique({ where: { id } });
  if (!atual || !atual.active) {
    return NextResponse.json({ error: "Obra não encontrada" }, { status: 404 });
  }

  const dataInicio =
    body.dataInicioPrevista !== undefined
      ? parseDate(body.dataInicioPrevista)
      : atual.dataInicioPrevista;
  const dataFim =
    body.dataFimPrevista !== undefined
      ? parseDate(body.dataFimPrevista)
      : atual.dataFimPrevista;
  const equipeId =
    body.equipeId !== undefined ? body.equipeId || null : atual.equipeId;

  if (dataInicio && dataFim && dataInicio.getTime() > dataFim.getTime()) {
    return NextResponse.json(
      { error: "A data de início não pode ser posterior à data de término." },
      { status: 400 }
    );
  }

  // Validação de conflito — só faz sentido se a obra tem equipe, datas
  // completas e não foi finalizada/cancelada. Se tentar colocar em um
  // intervalo que sobrepõe outra obra da mesma equipe, devolvemos 409.
  const statusFinal = body.status ?? atual.status;
  if (
    equipeId &&
    dataInicio &&
    dataFim &&
    statusFinal !== "CONCLUIDA" &&
    statusFinal !== "CANCELADA"
  ) {
    const conflitos = await buscarConflitosEquipe({
      equipeId,
      dataInicio,
      dataFim,
      ignorarObraId: id,
    });
    if (conflitos.length > 0) {
      return NextResponse.json(
        {
          error:
            "Conflito de agenda da equipe: já existe obra no intervalo selecionado.",
          conflitos,
        },
        { status: 409 }
      );
    }
  }

  try {
    const atualizada = await prisma.obra.update({
      where: { id },
      data: {
        ...(body.dataInicioPrevista !== undefined && {
          dataInicioPrevista: dataInicio,
        }),
        ...(body.dataFimPrevista !== undefined && {
          dataFimPrevista: dataFim,
        }),
        ...(body.equipeId !== undefined && { equipeId: equipeId }),
        ...(body.prioridade !== undefined &&
          body.prioridade && { prioridade: body.prioridade }),
        ...(body.status !== undefined && body.status && { status: body.status }),
        ...(body.observacoes !== undefined && {
          observacoes: body.observacoes ?? null,
        }),
      },
    });
    return NextResponse.json({ ok: true, obra: atualizada });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[PATCH /api/admin/obra/[id]/datas]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

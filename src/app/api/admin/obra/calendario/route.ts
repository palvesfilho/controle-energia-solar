import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { canAccessSection } from "@/lib/roles";
import { Prisma } from "@prisma/client";
import {
  ObraPrioridade,
  ObraStatus,
  isAtrasada,
  toFullCalendarEnd,
} from "@/lib/obra-calendario";

export interface CalendarioObraRow {
  id: string;
  nome: string;
  cliente: string | null;
  local: string | null;
  responsavel: string | null;
  equipeId: string | null;
  equipeNome: string | null;
  status: ObraStatus;
  prioridade: ObraPrioridade;
  progresso: number;
  dataInicioPrevista: string | null;
  dataFimPrevista: string | null;
  observacoes: string | null;
  atrasada: boolean;
  // Datas prontas para FullCalendar (ISO, end exclusivo)
  fcStart: string | null;
  fcEnd: string | null;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !canAccessSection(session.user.role, "obra")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const equipeId = searchParams.get("equipeId") || undefined;
  const statusFiltro = searchParams.get("status") || undefined;
  const cidade = searchParams.get("cidade") || undefined;
  const responsavel = searchParams.get("responsavel") || undefined;
  const incluirConcluidas = searchParams.get("concluidas") === "true";

  const where: Prisma.ObraWhereInput = {
    active: true,
    dataInicioPrevista: { not: null },
    dataFimPrevista: { not: null },
    ...(equipeId ? { equipeId } : {}),
    ...(statusFiltro ? { status: statusFiltro } : {}),
    ...(cidade
      ? { local: { contains: cidade } }
      : {}),
    ...(responsavel
      ? { responsavel: { contains: responsavel } }
      : {}),
    ...(incluirConcluidas
      ? {}
      : { status: { notIn: ["CONCLUIDA", "CANCELADA"] } }),
  };

  try {
    const obras = await prisma.obra.findMany({
      where,
      orderBy: [{ dataInicioPrevista: "asc" }],
      include: { equipe: { select: { id: true, nome: true } } },
    });

    const rows: CalendarioObraRow[] = obras.map((o) => {
      const atrasada = isAtrasada(o.status, o.dataFimPrevista);
      return {
        id: o.id,
        nome: o.nome,
        cliente: o.cliente,
        local: o.local,
        responsavel: o.responsavel,
        equipeId: o.equipeId,
        equipeNome: o.equipe?.nome ?? null,
        status: o.status as ObraStatus,
        prioridade: (o.prioridade as ObraPrioridade) ?? "MEDIA",
        progresso: o.progresso,
        dataInicioPrevista: o.dataInicioPrevista?.toISOString() ?? null,
        dataFimPrevista: o.dataFimPrevista?.toISOString() ?? null,
        observacoes: o.observacoes,
        atrasada,
        fcStart: o.dataInicioPrevista?.toISOString() ?? null,
        fcEnd: o.dataFimPrevista
          ? toFullCalendarEnd(o.dataFimPrevista).toISOString()
          : null,
      };
    });

    return NextResponse.json({ rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/admin/obra/calendario]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

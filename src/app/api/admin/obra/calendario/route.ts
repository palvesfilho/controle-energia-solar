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
import { extrairCidadeDeTextoLivre, geocodeCidade } from "@/lib/weather";

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
  // Coordenadas resolvidas pra busca de previsão do tempo. Vem do
  // proprietário (BrasilSolarClient) ou de geocoding da cidade.
  weatherLat: number | null;
  weatherLon: number | null;
  weatherLabel: string | null;
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

    // Resolve lat/long do proprietário (quando vinculado) em uma query.
    const proprietarioIds = Array.from(
      new Set(
        obras
          .map((o) => o.brasilSolarProprietarioId)
          .filter((v): v is string => Boolean(v))
      )
    );
    const proprietarios = proprietarioIds.length
      ? await prisma.brasilSolarClient.findMany({
          where: { id: { in: proprietarioIds } },
          select: {
            id: true,
            latitude: true,
            longitude: true,
            cidade: true,
            uf: true,
          },
        })
      : [];
    const propById = new Map(proprietarios.map((p) => [p.id, p]));

    // Geocoda cidades faltantes em paralelo (cache em memória dentro de
    // lib/weather.ts, então repetir não custa).
    const rows: CalendarioObraRow[] = await Promise.all(
      obras.map(async (o) => {
        const atrasada = isAtrasada(o.status, o.dataFimPrevista);

        let weatherLat: number | null = null;
        let weatherLon: number | null = null;
        let weatherLabel: string | null = null;

        const prop = o.brasilSolarProprietarioId
          ? propById.get(o.brasilSolarProprietarioId)
          : null;
        if (prop?.latitude != null && prop?.longitude != null) {
          weatherLat = prop.latitude;
          weatherLon = prop.longitude;
          weatherLabel = [prop.cidade, prop.uf].filter(Boolean).join("/") || null;
        } else {
          // Fallback: cidade do proprietário (sem lat/long) ou texto livre da obra.
          const candidato =
            (prop?.cidade ? `${prop.cidade}${prop.uf ? `, ${prop.uf}` : ""}` : null) ??
            (o.local ? extrairCidadeDeTextoLivre(o.local) : null);
          if (candidato) {
            const geo = await geocodeCidade(candidato);
            if (geo) {
              weatherLat = geo.latitude;
              weatherLon = geo.longitude;
              weatherLabel = geo.name;
            }
          }
        }

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
          weatherLat,
          weatherLon,
          weatherLabel,
        };
      })
    );

    return NextResponse.json({ rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/admin/obra/calendario]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

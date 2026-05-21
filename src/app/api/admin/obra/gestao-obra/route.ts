import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { canAccessSection } from "@/lib/roles";
import { parseObraMeta } from "@/lib/obra-meta";

export type ObraStatus =
  | "PLANEJAMENTO"
  | "EM_EXECUCAO"
  | "PAUSADA"
  | "CONCLUIDA"
  | "CANCELADA";

export interface GestaoObraRow {
  id: string;
  nome: string;
  cliente: string | null;
  proprietarioId: string | null;
  proprietarioNome: string | null;
  local: string | null;
  responsavel: string | null;
  status: ObraStatus;
  progresso: number;
  potenciaKwp: number | null;
  inversorPotenciaKw: number | null;
  dataInicioPrevista: string | null;
  dataFimPrevista: string | null;
  dataFimReal: string | null;
  createdAt: string;
  // Indicam se cada PDF já foi gerado ao menos uma vez (para colorir os ícones)
  documentoPdfGerado: boolean;
  listaMateriaisPdfGerado: boolean;
  conferenciaPdfGerado: boolean;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !canAccessSection(session.user.role, "obra")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const incluirFinalizadas = searchParams.get("finalizadas") === "true";

  try {
    const obras = await prisma.obra.findMany({
      where: {
        active: true,
        ...(incluirFinalizadas
          ? {}
          : { status: { notIn: ["CONCLUIDA", "CANCELADA"] } }),
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: { listaMaterial: { select: { pdfGeradoEm: true } } },
    });

    const proprietarioIds = new Set<string>();
    const parsed = obras.map((o) => {
      const { meta } = parseObraMeta(o.observacoes);
      if (meta.proprietarioId) proprietarioIds.add(meta.proprietarioId);
      return { obra: o, meta };
    });

    const proprietarios = proprietarioIds.size
      ? await prisma.brasilSolarProprietario.findMany({
          where: { id: { in: Array.from(proprietarioIds) } },
          select: {
            id: true,
            nome: true,
            potenciaInstalada: true,
            inversorPotencia: true,
          },
        })
      : [];
    const proprietarioMap = new Map(proprietarios.map((p) => [p.id, p]));

    const rows: GestaoObraRow[] = parsed.map(({ obra, meta }) => {
      const prop = meta.proprietarioId
        ? proprietarioMap.get(meta.proprietarioId)
        : null;
      return {
        id: obra.id,
        nome: obra.nome,
        cliente: obra.cliente,
        proprietarioId: meta.proprietarioId ?? null,
        proprietarioNome: prop?.nome ?? null,
        local: obra.local,
        responsavel: obra.responsavel,
        status: obra.status as ObraStatus,
        progresso: obra.progresso,
        potenciaKwp: meta.potenciaKwp ?? prop?.potenciaInstalada ?? null,
        inversorPotenciaKw:
          meta.inversorPotenciaKw ?? prop?.inversorPotencia ?? null,
        dataInicioPrevista: obra.dataInicioPrevista?.toISOString() ?? null,
        dataFimPrevista: obra.dataFimPrevista?.toISOString() ?? null,
        dataFimReal: obra.dataFimReal?.toISOString() ?? null,
        createdAt: obra.createdAt.toISOString(),
        documentoPdfGerado: obra.documentoPdfGeradoEm != null,
        conferenciaPdfGerado: obra.conferenciaPdfGeradoEm != null,
        listaMateriaisPdfGerado: obra.listaMaterial?.pdfGeradoEm != null,
      };
    });

    return NextResponse.json({ rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/admin/obra/gestao-obra]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

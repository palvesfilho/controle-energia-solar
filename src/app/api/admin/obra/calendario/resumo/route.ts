import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";
import { isAtrasada, intervalosSobrepoem, startOfDay } from "@/lib/obra-calendario";

export interface ResumoCalendario {
  total: number;
  emAndamento: number;
  atrasadas: number;
  concluidas: number;
  planejadas: number;
  pausadas: number;
  proximasAIniciar: {
    id: string;
    nome: string;
    dataInicioPrevista: string;
    cliente: string | null;
    equipeNome: string | null;
    diasAteInicio: number;
  }[];
  conflitosEquipe: {
    equipeId: string;
    equipeNome: string;
    obras: {
      id: string;
      nome: string;
      dataInicioPrevista: string;
      dataFimPrevista: string;
    }[];
  }[];
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const [total, emAndamento, concluidas, planejadas, pausadas] =
      await Promise.all([
        prisma.obra.count({ where: { active: true } }),
        prisma.obra.count({ where: { active: true, status: "EM_EXECUCAO" } }),
        prisma.obra.count({ where: { active: true, status: "CONCLUIDA" } }),
        prisma.obra.count({ where: { active: true, status: "PLANEJAMENTO" } }),
        prisma.obra.count({ where: { active: true, status: "PAUSADA" } }),
      ]);

    const naoFinalizadas = await prisma.obra.findMany({
      where: {
        active: true,
        status: { notIn: ["CONCLUIDA", "CANCELADA"] },
      },
      include: { equipe: { select: { id: true, nome: true } } },
      orderBy: { dataInicioPrevista: "asc" },
    });

    const hoje = startOfDay(new Date());
    const atrasadas = naoFinalizadas.filter((o) =>
      isAtrasada(o.status, o.dataFimPrevista)
    ).length;

    const proximasAIniciar = naoFinalizadas
      .filter((o) => o.dataInicioPrevista && o.dataInicioPrevista >= hoje)
      .slice(0, 5)
      .map((o) => ({
        id: o.id,
        nome: o.nome,
        dataInicioPrevista: (o.dataInicioPrevista as Date).toISOString(),
        cliente: o.cliente,
        equipeNome: o.equipe?.nome ?? null,
        diasAteInicio: Math.max(
          0,
          Math.round(
            (startOfDay(o.dataInicioPrevista as Date).getTime() -
              hoje.getTime()) /
              86400000
          )
        ),
      }));

    const porEquipe = new Map<
      string,
      {
        equipeNome: string;
        obras: {
          id: string;
          nome: string;
          dataInicioPrevista: Date;
          dataFimPrevista: Date;
        }[];
      }
    >();
    for (const o of naoFinalizadas) {
      if (!o.equipeId || !o.dataInicioPrevista || !o.dataFimPrevista) continue;
      const entry = porEquipe.get(o.equipeId) ?? {
        equipeNome: o.equipe?.nome ?? "Equipe sem nome",
        obras: [],
      };
      entry.obras.push({
        id: o.id,
        nome: o.nome,
        dataInicioPrevista: o.dataInicioPrevista,
        dataFimPrevista: o.dataFimPrevista,
      });
      porEquipe.set(o.equipeId, entry);
    }

    const conflitosEquipe: ResumoCalendario["conflitosEquipe"] = [];
    for (const [equipeId, entry] of porEquipe) {
      const conflitantes = new Set<string>();
      for (let i = 0; i < entry.obras.length; i++) {
        for (let j = i + 1; j < entry.obras.length; j++) {
          const a = entry.obras[i];
          const b = entry.obras[j];
          if (
            intervalosSobrepoem(
              a.dataInicioPrevista,
              a.dataFimPrevista,
              b.dataInicioPrevista,
              b.dataFimPrevista
            )
          ) {
            conflitantes.add(a.id);
            conflitantes.add(b.id);
          }
        }
      }
      if (conflitantes.size > 0) {
        conflitosEquipe.push({
          equipeId,
          equipeNome: entry.equipeNome,
          obras: entry.obras
            .filter((o) => conflitantes.has(o.id))
            .map((o) => ({
              id: o.id,
              nome: o.nome,
              dataInicioPrevista: o.dataInicioPrevista.toISOString(),
              dataFimPrevista: o.dataFimPrevista.toISOString(),
            })),
        });
      }
    }

    const resumo: ResumoCalendario = {
      total,
      emAndamento,
      atrasadas,
      concluidas,
      planejadas,
      pausadas,
      proximasAIniciar,
      conflitosEquipe,
    };
    return NextResponse.json(resumo);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/admin/obra/calendario/resumo]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

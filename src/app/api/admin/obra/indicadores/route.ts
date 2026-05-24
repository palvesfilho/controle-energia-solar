import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { canAccessSection } from "@/lib/roles";
import { parseObraMeta } from "@/lib/obra-meta";
import {
  intervalosSobrepoem,
  isAtrasada,
  startOfDay,
} from "@/lib/obra-calendario";

export interface ObraIndicadoresPayload {
  emExecucao: { count: number; kwpTotal: number };
  atrasadas: { count: number };
  aprovacoesPendentes: { count: number };
  aIniciar7d: { count: number };
  concluidasMes: { count: number; kwpTotal: number };
  conflitosEquipe: { count: number };
  geradoEm: string;
}

type ObraComMeta = {
  id: string;
  status: string;
  aprovacao: string;
  equipeId: string | null;
  dataInicioPrevista: Date | null;
  dataFimPrevista: Date | null;
  dataFimReal: Date | null;
  observacoes: string | null;
};

// kWp vem em ordem de preferência: meta.potenciaKwp (set no cadastro) →
// proprietario.potenciaInstalada (quando vinculado a BrasilSolarProprietario).
// Sem nenhum dos dois, soma 0 (o card mostra "—" abaixo do número).
function resolverKwp(
  obra: ObraComMeta,
  proprietarioPotenciaById: Map<string, number | null>,
): number {
  const { meta } = parseObraMeta(obra.observacoes);
  if (meta.potenciaKwp != null) return meta.potenciaKwp;
  if (meta.proprietarioId) {
    const p = proprietarioPotenciaById.get(meta.proprietarioId);
    if (p != null) return p;
  }
  return 0;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !canAccessSection(session.user.role, "obra")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const hoje = startOfDay(new Date());
    const em7d = new Date(hoje);
    em7d.setDate(em7d.getDate() + 7);
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const inicioProxMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);

    // Uma query só pra todas as obras ativas — depois fatiamos no app.
    // Filtros por status/data são baratos com poucos milhares de obras;
    // se crescer, vira queries específicas com count().
    const obras = await prisma.obra.findMany({
      where: { active: true },
      select: {
        id: true,
        status: true,
        aprovacao: true,
        equipeId: true,
        dataInicioPrevista: true,
        dataFimPrevista: true,
        dataFimReal: true,
        observacoes: true,
      },
    });

    // Pré-carrega potência dos proprietários referenciados na meta
    const proprietarioIds = new Set<string>();
    for (const o of obras) {
      const { meta } = parseObraMeta(o.observacoes);
      if (meta.proprietarioId) proprietarioIds.add(meta.proprietarioId);
    }
    const proprietarios = proprietarioIds.size
      ? await prisma.brasilSolarProprietario.findMany({
          where: { id: { in: Array.from(proprietarioIds) } },
          select: { id: true, potenciaInstalada: true },
        })
      : [];
    const propMap = new Map(
      proprietarios.map((p) => [p.id, p.potenciaInstalada]),
    );

    let emExecucaoCount = 0;
    let emExecucaoKwp = 0;
    let atrasadasCount = 0;
    let aprovacoesPendentesCount = 0;
    let aIniciar7dCount = 0;
    let concluidasMesCount = 0;
    let concluidasMesKwp = 0;

    // Pra detectar conflito de equipe: agrupa obras ativas por equipe,
    // depois compara pares dentro do mesmo grupo.
    const porEquipe = new Map<string, ObraComMeta[]>();

    for (const o of obras) {
      // 1. Em execução agora
      if (o.status === "EM_EXECUCAO") {
        emExecucaoCount++;
        emExecucaoKwp += resolverKwp(o, propMap);
      }

      // 2. Atrasadas
      if (isAtrasada(o.status, o.dataFimPrevista, hoje)) {
        atrasadasCount++;
      }

      // 3. Aprovações pendentes
      if (o.aprovacao === "PENDENTE") {
        aprovacoesPendentesCount++;
      }

      // 4. A iniciar em 7 dias
      if (
        o.status === "PLANEJAMENTO" &&
        o.dataInicioPrevista &&
        o.dataInicioPrevista >= hoje &&
        o.dataInicioPrevista <= em7d
      ) {
        aIniciar7dCount++;
      }

      // 5. Concluídas no mês
      if (
        o.status === "CONCLUIDA" &&
        o.dataFimReal &&
        o.dataFimReal >= inicioMes &&
        o.dataFimReal < inicioProxMes
      ) {
        concluidasMesCount++;
        concluidasMesKwp += resolverKwp(o, propMap);
      }

      // 6. Conflitos: só obras com equipe + datas + não concluídas/canceladas
      if (
        o.equipeId &&
        o.dataInicioPrevista &&
        o.dataFimPrevista &&
        o.status !== "CONCLUIDA" &&
        o.status !== "CANCELADA"
      ) {
        const arr = porEquipe.get(o.equipeId) ?? [];
        arr.push(o);
        porEquipe.set(o.equipeId, arr);
      }
    }

    // Conta obras únicas envolvidas em qualquer conflito (não o nº de pares).
    // É o que faz sentido pra mostrar no card "X obras com conflito".
    const obrasEmConflito = new Set<string>();
    for (const grupo of porEquipe.values()) {
      for (let i = 0; i < grupo.length; i++) {
        for (let j = i + 1; j < grupo.length; j++) {
          const a = grupo[i];
          const b = grupo[j];
          if (
            intervalosSobrepoem(
              a.dataInicioPrevista as Date,
              a.dataFimPrevista as Date,
              b.dataInicioPrevista as Date,
              b.dataFimPrevista as Date,
            )
          ) {
            obrasEmConflito.add(a.id);
            obrasEmConflito.add(b.id);
          }
        }
      }
    }

    const payload: ObraIndicadoresPayload = {
      emExecucao: { count: emExecucaoCount, kwpTotal: emExecucaoKwp },
      atrasadas: { count: atrasadasCount },
      aprovacoesPendentes: { count: aprovacoesPendentesCount },
      aIniciar7d: { count: aIniciar7dCount },
      concluidasMes: { count: concluidasMesCount, kwpTotal: concluidasMesKwp },
      conflitosEquipe: { count: obrasEmConflito.size },
      geradoEm: new Date().toISOString(),
    };

    return NextResponse.json(payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/admin/obra/indicadores]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

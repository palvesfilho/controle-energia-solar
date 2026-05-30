import { prisma } from "@/lib/prisma";
import type { AnaliseCreditosResult } from "@/lib/analise-creditos";

export type SnapshotEscopoTipo = "FULL" | "PLANT" | "INVESTOR";

export interface SnapshotLite {
  id: string;
  mesReferencia: number;
  anoReferencia: number;
  escopoTipo: SnapshotEscopoTipo;
  escopoId: string | null;
  completo: boolean;
  emailEnviado: boolean;
  emailEnviadoEm: string | null;
  geradoEm: string;
  // Resumo prensado pra listagens — evita carregar payload completo
  resumo: {
    saldoKwh: number;
    vencendo30dKwh: number;
    eficienciaPct: number | null;
    acoesCriticas: number;
  };
}

// Cria ou atualiza snapshot (idempotente). Sempre sobrescreve payloadJson
// pra ter sempre a versão mais recente do compute pro mês fechado.
export async function upsertSnapshot(args: {
  mes: number;
  ano: number;
  escopoTipo: SnapshotEscopoTipo;
  escopoId: string | null;
  completo: boolean;
  payload: AnaliseCreditosResult;
  geradoPorUserId?: string | null;
}): Promise<string> {
  const data = {
    mesReferencia: args.mes,
    anoReferencia: args.ano,
    escopoTipo: args.escopoTipo,
    escopoId: args.escopoId,
    completo: args.completo,
    payloadJson: JSON.stringify(args.payload),
    geradoPorUserId: args.geradoPorUserId ?? null,
  };
  // findFirst em vez de findUnique: nulls em composite uniques têm
  // semântica não-padrão no Prisma — findFirst é o caminho seguro.
  const found = await prisma.analiseCreditosSnapshot.findFirst({
    where: {
      mesReferencia: args.mes,
      anoReferencia: args.ano,
      escopoTipo: args.escopoTipo,
      escopoId: args.escopoId,
    },
    select: { id: true },
  });
  if (found) {
    await prisma.analiseCreditosSnapshot.update({
      where: { id: found.id },
      data: {
        completo: data.completo,
        payloadJson: data.payloadJson,
        geradoEm: new Date(),
        geradoPorUserId: data.geradoPorUserId,
      },
    });
    return found.id;
  }
  const created = await prisma.analiseCreditosSnapshot.create({ data });
  return created.id;
}

export async function marcarEmailEnviado(args: {
  snapshotId: string;
  destinatarios: string[];
}): Promise<void> {
  await prisma.analiseCreditosSnapshot.update({
    where: { id: args.snapshotId },
    data: {
      emailEnviado: true,
      emailEnviadoEm: new Date(),
      emailDestinatarios: args.destinatarios.join(","),
    },
  });
}

export async function listarSnapshots(filtros: {
  escopoTipo?: SnapshotEscopoTipo;
  escopoId?: string | null;
  limit?: number;
} = {}): Promise<SnapshotLite[]> {
  const items = await prisma.analiseCreditosSnapshot.findMany({
    where: {
      ...(filtros.escopoTipo ? { escopoTipo: filtros.escopoTipo } : {}),
      ...(filtros.escopoId !== undefined ? { escopoId: filtros.escopoId } : {}),
    },
    orderBy: [{ anoReferencia: "desc" }, { mesReferencia: "desc" }],
    take: filtros.limit ?? 24,
  });

  return items.map((s) => {
    let resumo: SnapshotLite["resumo"] = {
      saldoKwh: 0,
      vencendo30dKwh: 0,
      eficienciaPct: null,
      acoesCriticas: 0,
    };
    try {
      const payload = JSON.parse(s.payloadJson) as AnaliseCreditosResult;
      resumo = {
        saldoKwh: payload.cards.creditosDisponiveis.kwh,
        vencendo30dKwh: payload.cards.vencendo30d.kwh,
        eficienciaPct: payload.cards.eficienciaMedia.pct,
        acoesCriticas: payload.totaisPorSeveridade.critico,
      };
    } catch {
      // payload corrompido — devolve zeros
    }
    return {
      id: s.id,
      mesReferencia: s.mesReferencia,
      anoReferencia: s.anoReferencia,
      escopoTipo: s.escopoTipo as SnapshotEscopoTipo,
      escopoId: s.escopoId,
      completo: s.completo,
      emailEnviado: s.emailEnviado,
      emailEnviadoEm: s.emailEnviadoEm?.toISOString() ?? null,
      geradoEm: s.geradoEm.toISOString(),
      resumo,
    };
  });
}

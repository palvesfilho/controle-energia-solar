import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type {
  AcaoRecomendada as AcaoGenerated,
  AcaoTipo,
  Severidade,
} from "@/lib/analise-creditos";

// Como persistimos no banco depois do merge com computeAnaliseCreditos.
// Adiciona id (DB), status, prazoEm, responsavel, etc.
export interface AcaoPersistida extends AcaoGenerated {
  id: string;
  fingerprint: string;
  status: "ABERTA" | "FEITA" | "DISPENSADA" | "AUTO_FECHADA";
  prazoEm: string; // ISO
  responsavel: { id: string; name: string } | null;
  observacaoResolucao: string | null;
  resolvidaEm: string | null;
  resolvidaPor: { id: string; name: string } | null;
  criadaEm: string;
  atualizadaEm: string;
  vistaEm: string;
  atrasada: boolean;
  diasRestantes: number; // negativo se atrasada
}

// SLA por tipo (dias até prazoEm). Pode virar AlertaThreshold no futuro.
// Críticas: prazo mais curto. Atenção/info: mais relaxado.
const SLA_DEFAULT_DIAS: Record<AcaoTipo, number> = {
  CREDITOS_VENCENDO_30D: 5,
  USINA_SUBPERFORMANDO: 14,
  UC_SEM_FATURA_MES: 7,
  USINA_SEM_RATEIO_VIGENTE: 10,
  USINA_OFFLINE_30D: 3,
  CONSUMO_ANOMALO: 14,
  OPORTUNIDADE_CAPTACAO: 30, // lead pra captação — janela mais longa
};

export function getSlaDias(
  tipo: AcaoTipo,
  severidade: Severidade,
): number {
  // Críticas comprimem o SLA padrão; info dilata.
  const base = SLA_DEFAULT_DIAS[tipo] ?? 14;
  if (severidade === "critico") return Math.max(2, Math.ceil(base / 2));
  if (severidade === "info") return base * 2;
  return base;
}

// Fingerprint determinístico: rodadas seguidas da análise com o mesmo
// fato geram a mesma ação. Inclui mes/ano pra ações que "viram histórico"
// quando o mês muda (ex.: CREDITOS_VENCENDO_30D do mês 5 ≠ do mês 6).
export function gerarFingerprint(
  acao: Pick<AcaoGenerated, "tipo" | "plantId" | "consumerUnitId">,
  mes: number,
  ano: number,
): string {
  const partes = [
    acao.tipo,
    acao.plantId ?? "_",
    acao.consumerUnitId ?? "_",
    String(mes),
    String(ano),
  ].join("|");
  return createHash("sha1").update(partes).digest("hex").slice(0, 16);
}

function diffDays(de: Date, ate: Date): number {
  return Math.round((ate.getTime() - de.getTime()) / (24 * 60 * 60 * 1000));
}

// Núcleo: upserta ações da análise atual no banco e retorna a lista
// mergeada (incluindo as ABERTAs/FEITAs/DISPENSADAs daquele mês).
//
// Lógica:
// - Para cada ação gerada (com fingerprint):
//   - Existe no banco? → atualiza vistaEm e campos voláteis (titulo, métrica),
//     preserva status/responsavel/observação.
//   - Não existe? → cria com status=ABERTA e prazoEm = now + SLA.
// - Ações persistidas no banco pro mesmo (mes, ano) que NÃO estão na
//   geração atual ficam como estão (ABERTA pode virar AUTO_FECHADA se
//   sumiu há tempo — não fazemos isso aqui pra não esconder por engano).
// - Inclui no retorno TODAS persistidas do mês (ABERTA, FEITA, DISPENSADA)
//   pra UI poder filtrar.
export async function syncAcoesComPersistidas(
  acoesGeradas: Array<AcaoGenerated & { fingerprint: string }>,
  mes: number,
  ano: number,
): Promise<AcaoPersistida[]> {
  const now = new Date();
  const fingerprintsGeradas = new Set(acoesGeradas.map((a) => a.fingerprint));

  // 1) Pega tudo do mês de referência (qualquer status)
  const persistidas = await prisma.acaoRecomendada.findMany({
    where: { mesReferencia: mes, anoReferencia: ano },
    include: {
      responsavel: { select: { id: true, name: true } },
      resolvidaPor: { select: { id: true, name: true } },
    },
  });
  const persistidaByFp = new Map(persistidas.map((p) => [p.fingerprint, p]));

  // 2) Upsert das geradas
  const toCreate: Array<Parameters<typeof prisma.acaoRecomendada.create>[0]["data"]> = [];
  const toUpdate: Array<{ id: string; data: Record<string, unknown> }> = [];

  for (const a of acoesGeradas) {
    const existing = persistidaByFp.get(a.fingerprint);
    if (existing) {
      // Só atualiza campos voláteis — preserva status/responsavel/notas
      toUpdate.push({
        id: existing.id,
        data: {
          titulo: a.titulo,
          descricao: a.descricao,
          severidade: a.severidade,
          metricaValor: a.metricaValor ?? null,
          metricaLabel: a.metricaLabel ?? null,
          vistaEm: now,
        },
      });
    } else {
      const slaDias = getSlaDias(a.tipo, a.severidade);
      const prazoEm = new Date(now);
      prazoEm.setDate(prazoEm.getDate() + slaDias);
      toCreate.push({
        fingerprint: a.fingerprint,
        tipo: a.tipo,
        severidade: a.severidade,
        titulo: a.titulo,
        descricao: a.descricao,
        prazoDias: a.prazoDias,
        plantId: a.plantId ?? null,
        consumerUnitId: a.consumerUnitId ?? null,
        metricaValor: a.metricaValor ?? null,
        metricaLabel: a.metricaLabel ?? null,
        mesReferencia: mes,
        anoReferencia: ano,
        prazoEm,
        vistaEm: now,
      });
    }
  }

  if (toCreate.length > 0) {
    await prisma.$transaction(
      toCreate.map((data) => prisma.acaoRecomendada.create({ data })),
    );
  }
  if (toUpdate.length > 0) {
    await prisma.$transaction(
      toUpdate.map((u) =>
        prisma.acaoRecomendada.update({ where: { id: u.id }, data: u.data }),
      ),
    );
  }

  // 3) Re-le tudo do mês depois do upsert e devolve enriquecido
  const final = await prisma.acaoRecomendada.findMany({
    where: { mesReferencia: mes, anoReferencia: ano },
    include: {
      responsavel: { select: { id: true, name: true } },
      resolvidaPor: { select: { id: true, name: true } },
    },
  });

  return final.map((p) => {
    const dias = diffDays(now, p.prazoEm);
    return {
      id: p.id,
      fingerprint: p.fingerprint,
      tipo: p.tipo as AcaoTipo,
      severidade: p.severidade as Severidade,
      titulo: p.titulo,
      descricao: p.descricao,
      prazoDias: p.prazoDias as 30 | 60 | 90,
      plantId: p.plantId ?? undefined,
      plantName: undefined,
      consumerUnitId: p.consumerUnitId ?? undefined,
      consumerUnitCodigo: undefined,
      metricaValor: p.metricaValor ?? undefined,
      metricaLabel: p.metricaLabel ?? undefined,
      status: p.status as AcaoPersistida["status"],
      prazoEm: p.prazoEm.toISOString(),
      responsavel: p.responsavel,
      observacaoResolucao: p.observacaoResolucao,
      resolvidaEm: p.resolvidaEm?.toISOString() ?? null,
      resolvidaPor: p.resolvidaPor,
      criadaEm: p.criadaEm.toISOString(),
      atualizadaEm: p.atualizadaEm.toISOString(),
      vistaEm: p.vistaEm.toISOString(),
      atrasada: p.status === "ABERTA" && dias < 0,
      diasRestantes: dias,
      // Preserva os nomes legíveis que vieram da geração quando disponíveis
      ...(fingerprintsGeradas.has(p.fingerprint)
        ? extractNomesDaGeracao(acoesGeradas, p.fingerprint)
        : {}),
    };
  });
}

function extractNomesDaGeracao(
  acoes: Array<AcaoGenerated & { fingerprint: string }>,
  fp: string,
): { plantName?: string; consumerUnitCodigo?: string } {
  const a = acoes.find((x) => x.fingerprint === fp);
  if (!a) return {};
  return {
    plantName: a.plantName,
    consumerUnitCodigo: a.consumerUnitCodigo,
  };
}

// Helpers compartilhados entre APIs e UI do calendário de obras.
// Mantém regras de cor/atraso/conflito em um único lugar para que
// server e client não divirjam.

import { prisma } from "./prisma";

export type ObraStatus =
  | "PLANEJAMENTO"
  | "EM_EXECUCAO"
  | "PAUSADA"
  | "CONCLUIDA"
  | "CANCELADA";

export type ObraPrioridade = "BAIXA" | "MEDIA" | "ALTA" | "URGENTE";

export const STATUS_LABEL: Record<ObraStatus, string> = {
  PLANEJAMENTO: "Planejada",
  EM_EXECUCAO: "Em andamento",
  PAUSADA: "Pausada",
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
};

export const PRIORIDADE_LABEL: Record<ObraPrioridade, string> = {
  BAIXA: "Baixa",
  MEDIA: "Média",
  ALTA: "Alta",
  URGENTE: "Urgente",
};

// Card neutro pra TODAS as obras — status e prioridade comunicam pelo texto
// e pela barra lateral, não pelo fundo. Reduz poluição visual quando o mês
// tem várias obras.
export const CARD_BG = "#ffffff";
export const CARD_BORDER = "#e2e8f0";
export const CARD_TEXT = "#0f172a";

// Barra colorida à esquerda do card = STATUS. Cor sólida pra dar leitura
// rápida; override por vermelho quando a obra está atrasada.
export const STATUS_BAR_COLOR: Record<ObraStatus, string> = {
  PLANEJAMENTO: "#64748b", // cinza
  EM_EXECUCAO: "#059669",  // verde
  PAUSADA: "#d97706",      // amarelo
  CONCLUIDA: "#2563eb",    // azul
  CANCELADA: "#cbd5e1",    // cinza claro
};

export const ATRASADA_BAR_COLOR = "#dc2626"; // vermelho (substitui a barra de status)

// Pontinho ao lado do título = PRIORIDADE. Sem barra vertical pra não
// concorrer com a barra de status.
export const PRIORIDADE_DOT_COLOR: Record<ObraPrioridade, string> = {
  BAIXA: "#94a3b8",
  MEDIA: "#38bdf8",
  ALTA: "#f59e0b",
  URGENTE: "#dc2626",
};

export function isAtrasada(
  status: string,
  dataFimPrevista: Date | null,
  ref: Date = new Date()
): boolean {
  if (!dataFimPrevista) return false;
  if (status === "CONCLUIDA" || status === "CANCELADA") return false;
  return dataFimPrevista.getTime() < startOfDay(ref).getTime();
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// Aceita "YYYY-MM-DD" ou ISO completo. Para strings sem hora, ancora em
// 12:00 UTC do dia escolhido — assim a data se mantém igual em qualquer
// fuso (US ao Japão), evitando o clássico bug de "-1 dia" causado por
// `new Date("YYYY-MM-DD")` parsear como UTC midnight.
export function parseDateOnly(v: string | null | undefined): Date | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (m) {
    return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0));
  }
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

// FullCalendar usa end *exclusivo*. Nosso dataFimPrevista é inclusivo
// (último dia da obra), então somamos 1 dia para o calendário exibir
// o bloco até o fim daquele dia.
export function toFullCalendarEnd(dataFim: Date): Date {
  const d = startOfDay(dataFim);
  d.setDate(d.getDate() + 1);
  return d;
}

export function fromFullCalendarEnd(end: Date): Date {
  const d = startOfDay(end);
  d.setDate(d.getDate() - 1);
  return d;
}

// Detecta sobreposição entre [aInicio, aFim] e [bInicio, bFim] — inclusive
// nas duas pontas (se dois intervalos se *tocam* no mesmo dia, conflita).
export function intervalosSobrepoem(
  aInicio: Date,
  aFim: Date,
  bInicio: Date,
  bFim: Date
): boolean {
  return (
    startOfDay(aInicio).getTime() <= startOfDay(bFim).getTime() &&
    startOfDay(bInicio).getTime() <= startOfDay(aFim).getTime()
  );
}

export interface ConflitoEquipe {
  obraId: string;
  obraNome: string;
  conflitaCom: {
    id: string;
    nome: string;
    dataInicioPrevista: Date;
    dataFimPrevista: Date;
  }[];
  equipeId: string;
  equipeNome: string | null;
}

// Busca no banco qualquer obra (ativa, não concluída/cancelada) da mesma
// equipe cujas datas se sobreponham ao intervalo proposto. Usado no
// PATCH de datas e também para exibir alertas no calendário.
export async function buscarConflitosEquipe(params: {
  equipeId: string;
  dataInicio: Date;
  dataFim: Date;
  ignorarObraId?: string;
}): Promise<
  {
    id: string;
    nome: string;
    dataInicioPrevista: Date;
    dataFimPrevista: Date;
  }[]
> {
  const { equipeId, dataInicio, dataFim, ignorarObraId } = params;
  const candidatas = await prisma.obra.findMany({
    where: {
      equipeId,
      active: true,
      status: { notIn: ["CONCLUIDA", "CANCELADA"] },
      ...(ignorarObraId ? { id: { not: ignorarObraId } } : {}),
      dataInicioPrevista: { not: null },
      dataFimPrevista: { not: null },
    },
    select: {
      id: true,
      nome: true,
      dataInicioPrevista: true,
      dataFimPrevista: true,
    },
  });

  return candidatas
    .filter(
      (c) =>
        c.dataInicioPrevista &&
        c.dataFimPrevista &&
        intervalosSobrepoem(
          dataInicio,
          dataFim,
          c.dataInicioPrevista,
          c.dataFimPrevista
        )
    )
    .map((c) => ({
      id: c.id,
      nome: c.nome,
      dataInicioPrevista: c.dataInicioPrevista as Date,
      dataFimPrevista: c.dataFimPrevista as Date,
    }));
}

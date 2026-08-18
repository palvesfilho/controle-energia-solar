/**
 * Catálogo de GATILHOS da divisão 2 do módulo Mensagens (Ativações).
 *
 * Um gatilho responde a uma pergunta só: *quem está, agora, na condição que eu
 * observo — e desde quando?* Não envia nada, não decide nada. Quem decide é o
 * motor (`mensagens-ativacoes.ts`), que ainda aplica cooldown e a data em que a
 * regra foi ligada.
 *
 * 🔑 O `eventoEm` que cada candidato traz não é enfeite: é o que impede a
 * enxurrada. Ligar uma regra hoje não pode disparar para quem está na condição
 * há três meses — o motor descarta todo evento anterior a `ativadaEm`. Sem essa
 * data, acender "avisar quando a usina ficar muda" mandaria aviso de uma vez
 * para toda usina muda do histórico.
 *
 * ⚠️ Os gatilhos de inversor NÃO redetectam nada: leem `MonitoringAlert`, que é
 * recalculado a cada 15 min por `sync-alerts.ts` com thresholds configuráveis em
 * Personalizações. Uma segunda definição de "usina parada" aqui divergiria
 * daquela que o operador vê na tela, e o cliente receberia aviso de um problema
 * que ninguém consegue confirmar. Ver [[feedback_cruzamento_circular_fontes]].
 */
import { prisma } from "@/lib/prisma";
import { TIPOS_ALERTA, type TipoAlerta } from "@/lib/alertas-usinas";
import {
  DESCRICAO_GATILHO,
  ROTULO_ALERTA,
  type TipoGatilho,
} from "@/lib/mensagens-gatilhos-rotulos";

export { ROTULO_ALERTA };
export type { TipoGatilho };

/** Um cliente que entrou na condição, e o instante em que isso aconteceu. */
export interface Candidato {
  proprietarioId: string;
  eventoEm: Date;
}

export interface DefinicaoGatilho {
  tipo: TipoGatilho;
  nome: string;
  /** O que observa, em uma frase, para a tela do operador. */
  descricao: string;
  avaliar: (params: Record<string, unknown>) => Promise<Candidato[]>;
  /** Frase legível do recorte configurado, para a lista de ativações. */
  descrever: (params: Record<string, unknown>) => string;
}

/* ------------------------------------------------------------------ */
/* ALERTA_USINA                                                        */
/* ------------------------------------------------------------------ */

function tiposDosParams(params: Record<string, unknown>): TipoAlerta[] {
  const brutos = Array.isArray(params.tipos) ? (params.tipos as unknown[]) : [];
  const validos = brutos.filter(
    (t): t is TipoAlerta => typeof t === "string" && (TIPOS_ALERTA as string[]).includes(t),
  );
  // Sem tipo escolhido a regra não observa nada. Assumir "todos" faria uma
  // configuração incompleta virar aviso para a base inteira.
  return validos;
}

async function avaliarAlertaUsina(params: Record<string, unknown>): Promise<Candidato[]> {
  const tipos = tiposDosParams(params);
  if (tipos.length === 0) return [];

  const severidades = Array.isArray(params.severidades)
    ? (params.severidades as unknown[]).filter((s): s is string => typeof s === "string")
    : null;

  const alertas = await prisma.monitoringAlert.findMany({
    where: {
      status: "ABERTO",
      tipo: { in: tipos },
      ...(severidades?.length ? { severidade: { in: severidades } } : {}),
      // Só usina de cliente cadastrado: sem proprietário não há para quem
      // avisar. São 1.902 de 1.919 usinas hoje — a maioria cai fora aqui.
      client: { active: true, proprietarioId: { not: null } },
    },
    select: { createdAt: true, client: { select: { proprietarioId: true } } },
    orderBy: { createdAt: "asc" },
  });

  // Um cliente com duas usinas em alerta é UM candidato, com a data do alerta
  // MAIS ANTIGO — é o começo do problema dele, e é isso que decide se o evento
  // é anterior ou posterior a ligar a regra.
  const porProprietario = new Map<string, Date>();
  for (const a of alertas) {
    const id = a.client.proprietarioId;
    if (!id) continue;
    if (!porProprietario.has(id)) porProprietario.set(id, a.createdAt);
  }

  return Array.from(porProprietario, ([proprietarioId, eventoEm]) => ({
    proprietarioId,
    eventoEm,
  }));
}

/* ------------------------------------------------------------------ */
/* AGENDA_MENSAL                                                       */
/* ------------------------------------------------------------------ */

/**
 * Todo dia X do mês. É o gatilho do "relatório mensal está pronto".
 *
 * Por que data fixa e não um evento de "relatório gerado": o relatório da
 * Brasil Solar é montado sob demanda quando o cliente abre o portal
 * (`brasil-solar-relatorio.ts`) — não existe um instante em que ele "fica
 * pronto". O que existe é o fechamento do mês, e é isso que a data representa.
 */
async function avaliarAgendaMensal(params: Record<string, unknown>): Promise<Candidato[]> {
  const dia = typeof params.diaDoMes === "number" ? params.diaDoMes : 5;
  const hoje = new Date();
  if (hoje.getDate() !== dia) return [];

  const props = await prisma.brasilSolarProprietario.findMany({
    // Só quem tem usina ativa: sem geração não há relatório para anunciar.
    where: { active: true, plantas: { some: { active: true } } },
    select: { id: true },
  });

  // Meia-noite de hoje como evento: dá a mesma data para todo mundo da rodada,
  // independentemente da hora em que o cron passou.
  const eventoEm = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return props.map((p) => ({ proprietarioId: p.id, eventoEm }));
}

/* ------------------------------------------------------------------ */
/* ANIVERSARIO_SISTEMA                                                 */
/* ------------------------------------------------------------------ */

/**
 * Sistema que acabou de completar N meses de instalado — o gancho de limpeza e
 * revisão periódica.
 *
 * É uma JANELA de 7 dias, não "instalada há N meses ou mais": a segunda forma
 * é permanente e a regra reencontraria o mesmo cliente para sempre, sobrando só
 * o cooldown para segurar. A janela faz o cliente entrar e sair da condição.
 */
async function avaliarAniversario(params: Record<string, unknown>): Promise<Candidato[]> {
  const meses = typeof params.meses === "number" ? params.meses : 6;
  if (meses <= 0) return [];

  const fim = new Date();
  fim.setMonth(fim.getMonth() - meses);
  const inicio = new Date(fim);
  inicio.setDate(inicio.getDate() - 7);

  const plantas = await prisma.brasilSolarClient.findMany({
    where: {
      active: true,
      proprietarioId: { not: null },
      dataInstalacao: { gte: inicio, lte: fim },
    },
    select: { proprietarioId: true, dataInstalacao: true },
  });

  const porProprietario = new Map<string, Date>();
  for (const p of plantas) {
    if (!p.proprietarioId || !p.dataInstalacao) continue;
    // O evento é a data em que o sistema COMPLETOU os N meses, não a instalação.
    const completou = new Date(p.dataInstalacao);
    completou.setMonth(completou.getMonth() + meses);
    const atual = porProprietario.get(p.proprietarioId);
    if (!atual || completou < atual) porProprietario.set(p.proprietarioId, completou);
  }

  return Array.from(porProprietario, ([proprietarioId, eventoEm]) => ({
    proprietarioId,
    eventoEm,
  }));
}

/* ------------------------------------------------------------------ */

export const GATILHOS: Record<TipoGatilho, DefinicaoGatilho> = {
  ALERTA_USINA: {
    tipo: "ALERTA_USINA",
    ...DESCRICAO_GATILHO.ALERTA_USINA,
    avaliar: avaliarAlertaUsina,
    descrever: (p) => {
      const tipos = tiposDosParams(p);
      if (tipos.length === 0) return "⚠️ nenhum tipo de alerta escolhido — não dispara";
      return tipos.map((t) => ROTULO_ALERTA[t] ?? t).join(" · ");
    },
  },
  AGENDA_MENSAL: {
    tipo: "AGENDA_MENSAL",
    ...DESCRICAO_GATILHO.AGENDA_MENSAL,
    avaliar: avaliarAgendaMensal,
    descrever: (p) =>
      `todo dia ${typeof p.diaDoMes === "number" ? p.diaDoMes : 5} de cada mês`,
  },
  ANIVERSARIO_SISTEMA: {
    tipo: "ANIVERSARIO_SISTEMA",
    ...DESCRICAO_GATILHO.ANIVERSARIO_SISTEMA,
    avaliar: avaliarAniversario,
    descrever: (p) =>
      `ao completar ${typeof p.meses === "number" ? p.meses : 6} meses de instalado`,
  },
};

export function descreverGatilho(
  gatilho: string,
  params: unknown,
): string {
  const def = GATILHOS[gatilho as TipoGatilho];
  if (!def) return gatilho;
  return def.descrever((params ?? {}) as Record<string, unknown>);
}

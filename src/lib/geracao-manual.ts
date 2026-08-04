/**
 * Lançamento MANUAL de geração — paliativo enquanto a integração com a
 * plataforma de monitoramento da usina não existe.
 *
 * O operador informa o TOTAL DE UM PERÍODO (kWh) e este módulo rateia esse total
 * em linhas diárias de `MonitoringLog` com `origem = "MANUAL"`. Rateia porque
 * todo consumidor de geração (relatório BS, portal do cliente, análise de
 * créditos, visão geral) soma `geracaoDiaria` num intervalo de datas — gravar só
 * um registro com o período inteiro num único dia daria soma certa e gráfico
 * mentiroso.
 *
 * Dois formatos de período:
 *   MENSAL        — mês calendário fechado (1º ao último dia).
 *   PERSONALIZADO — ciclo de leitura da fatura (ex.: 10/04/2026 a 11/05/2026).
 *
 * A janela é sempre [inicio, fim) com FIM EXCLUSIVO, igual à janela que o
 * relatório usa (`gte dataLeituraAnterior, lt dataLeituraAtual`). Consequência
 * que o operador precisa ver na tela: em 10/04→11/05 o rateio cobre 10/04 a
 * 10/05, e o dia 11/05 abre o ciclo seguinte. É o que faz o total declarado
 * bater exatamente com o total que o relatório daquele mês soma, e o que impede
 * dois ciclos consecutivos de brigarem pelo dia da virada.
 *
 * Três regras que não podem ser afrouxadas:
 *
 * 1. DADO REAL VENCE. Dias que já têm linha `origem = "API"` nunca são
 *    sobrescritos, e o rateio desconta o que eles já somam — o total do período
 *    no banco fica igual ao total declarado, não à soma dos dois. Se um sync
 *    rodar depois e trouxer o dia, ele sobrescreve a linha MANUAL (todo upsert
 *    de sync grava `origem: "API"`), e o lançamento passa a aparecer como
 *    PARCIAL ou SUPERADO.
 *
 * 2. NÃO MEXE EM `statusMonitoramento`. Lançar à mão não faz a plataforma
 *    voltar a enviar: a usina continua OFFLINE/SEM_DADOS e continua aparecendo
 *    nos alertas. Silenciar isso esconderia justamente o problema que motivou
 *    o lançamento.
 *
 * 3. RATEIO É ESTIMATIVA. O valor do dia é média, não medição. Quem exibe
 *    precisa sinalizar (`origem`), por isso a coluna viaja junto nos selects.
 */

import { prisma } from "@/lib/prisma";
import { esperadaDoDiaDaUsina, performanceRatioMesAtual } from "@/lib/geracao-esperada";

/** Situação de um lançamento manual frente ao que o sync já trouxe depois. */
export type StatusLancamentoManual = "ATIVO" | "PARCIAL" | "SUPERADO";

export type TipoPeriodoManual = "MENSAL" | "PERSONALIZADO";

export interface LancamentoManual {
  id: string;
  clientId: string;
  clienteNome?: string;
  tipoPeriodo: TipoPeriodoManual;
  /** Início da janela (inclusive), ISO. */
  dataInicio: Date;
  /** Fim da janela (EXCLUSIVO), ISO. */
  dataFim: Date;
  /** Competência só pra rótulo: mês do último dia coberto. */
  ano: number;
  mes: number;
  /** Total do período declarado pelo operador. */
  kwhTotal: number;
  /** Parte do total que virou linha diária MANUAL. */
  kwhRateado: number;
  diasRateados: number;
  fonte: string | null;
  observacao: string | null;
  registradoPor: string;
  createdAt: Date;
  updatedAt: Date;
  /** Linhas MANUAL que ainda restam na janela (o sync pode ter sobrescrito). */
  diasManuaisRestantes: number;
  /** Soma atual da janela no banco (MANUAL + API) — pode divergir do declarado. */
  kwhTotalAtual: number;
  /** Parte da soma atual que veio medida da plataforma. */
  kwhApiAtual: number;
  status: StatusLancamentoManual;
}

export class GeracaoManualError extends Error {}

export function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/**
 * Dia do mês normalizado como os syncs gravam: meio-dia UTC. Sem isso o dia
 * escorrega conforme o fuso do processo (Railway roda em UTC, dev em BRT) e a
 * linha manual cai num dia diferente do que o operador digitou.
 */
export function dataDoDia(ano: number, mes: number, dia: number): Date {
  return new Date(Date.UTC(ano, mes - 1, dia, 12, 0, 0));
}

/** Meia-noite UTC do dia — usado nas bordas da janela. */
function meiaNoiteUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0));
}

/** Janela [início, fim) que cobre o mês calendário. */
export function janelaDoMes(ano: number, mes: number): { inicio: Date; fim: Date } {
  return {
    inicio: new Date(Date.UTC(ano, mes - 1, 1, 0, 0, 0)),
    fim: new Date(Date.UTC(ano, mes, 1, 0, 0, 0)),
  };
}

/**
 * Aceita "2026-04-10" (input date do navegador) e ISO completo, sempre como dia
 * de calendário em UTC — nunca deixa o fuso do processo deslocar o dia.
 * Ver feedback_data_apenas_dia / parseDateOnly.
 */
function parseDiaUtc(valor: string | Date, rotulo: string): Date {
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) throw new GeracaoManualError(`${rotulo} inválida`);
    return meiaNoiteUtc(valor);
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor.trim());
  if (!m) throw new GeracaoManualError(`${rotulo} inválida`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0));
  if (Number.isNaN(d.getTime())) throw new GeracaoManualError(`${rotulo} inválida`);
  return d;
}

/** Dias de calendário cobertos pela janela [inicio, fim), cada um ao meio-dia UTC. */
function diasDaJanela(inicio: Date, fim: Date): Date[] {
  const dias: Date[] = [];
  const cursor = new Date(inicio.getTime());
  while (cursor.getTime() < fim.getTime()) {
    dias.push(
      new Date(
        Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate(), 12, 0, 0),
      ),
    );
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dias;
}

const UM_DIA_MS = 24 * 60 * 60 * 1000;

/** Competência (rótulo): mês do último dia coberto, igual à referência da fatura. */
function competenciaDaJanela(fim: Date): { ano: number; mes: number } {
  const ultimo = new Date(fim.getTime() - UM_DIA_MS);
  return { ano: ultimo.getUTCFullYear(), mes: ultimo.getUTCMonth() + 1 };
}

/** Rótulo curto do período, do jeito que aparece na tela. */
export function rotuloPeriodo(l: {
  tipoPeriodo: TipoPeriodoManual;
  dataInicio: Date | string;
  dataFim: Date | string;
  ano: number;
  mes: number;
}): string {
  const MESES = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];
  if (l.tipoPeriodo === "MENSAL") return `${MESES[l.mes - 1]}/${l.ano}`;
  const ini = new Date(l.dataInicio);
  const fim = new Date(l.dataFim);
  const fmt = (d: Date) =>
    `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
  return `${fmt(ini)} a ${fmt(fim)}`;
}

export interface ResultadoLancamento {
  entryId: string;
  clientId: string;
  tipoPeriodo: TipoPeriodoManual;
  dataInicio: string;
  dataFim: string;
  ano: number;
  mes: number;
  kwhTotal: number;
  kwhRateado: number;
  kwhApi: number;
  diasRateados: number;
  kwhPorDia: number;
  /** Divergências que o operador precisa ver — nunca engolidas em silêncio. */
  avisos: string[];
}

export interface EntradaLancamento {
  clientId: string;
  tipoPeriodo?: TipoPeriodoManual;
  /** MENSAL: competência. Ignorados quando vêm dataInicio/dataFim. */
  ano?: number;
  mes?: number;
  /** PERSONALIZADO: janela [dataInicio, dataFim) — fim exclusivo. */
  dataInicio?: string | Date;
  dataFim?: string | Date;
  kwhTotal: number;
  fonte?: string | null;
  observacao?: string | null;
  registradoPor: string;
  /** Regravação: id do lançamento sendo corrigido (libera a checagem de sobreposição). */
  entryId?: string;
}

/**
 * Resolve a janela a partir da entrada e valida o formato. Não olha o banco —
 * validações que dependem de dados existentes ficam em `lancarGeracaoManual`.
 */
function resolveJanela(
  entrada: EntradaLancamento,
  hoje: Date,
): { tipoPeriodo: TipoPeriodoManual; inicio: Date; fim: Date; ano: number; mes: number } {
  const tipoPeriodo: TipoPeriodoManual =
    entrada.tipoPeriodo ?? (entrada.dataInicio && entrada.dataFim ? "PERSONALIZADO" : "MENSAL");

  if (tipoPeriodo === "MENSAL") {
    const ano = Number(entrada.ano);
    const mes = Number(entrada.mes);
    if (!Number.isInteger(ano) || ano < 2015 || ano > 2100) {
      throw new GeracaoManualError("Ano inválido");
    }
    if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
      throw new GeracaoManualError("Mês inválido");
    }
    const refInformada = ano * 12 + mes;
    const refHoje = hoje.getUTCFullYear() * 12 + (hoje.getUTCMonth() + 1);
    if (refInformada > refHoje) {
      throw new GeracaoManualError("Não é possível lançar geração de um mês futuro");
    }
    const { inicio, fim } = janelaDoMes(ano, mes);
    return { tipoPeriodo, inicio, fim, ano, mes };
  }

  if (!entrada.dataInicio || !entrada.dataFim) {
    throw new GeracaoManualError("Informe a data inicial e a data final do período");
  }
  const inicio = parseDiaUtc(entrada.dataInicio, "Data inicial");
  const fim = parseDiaUtc(entrada.dataFim, "Data final");

  if (fim.getTime() <= inicio.getTime()) {
    throw new GeracaoManualError("A data final tem que ser depois da data inicial");
  }
  const dias = Math.round((fim.getTime() - inicio.getTime()) / UM_DIA_MS);
  // Teto de 2 meses: janela maior é quase sempre erro de digitação no ano, e
  // rateio de meses inteiros com uma média só distorce a sazonalidade.
  if (dias > 62) {
    throw new GeracaoManualError(
      `O período tem ${dias} dias. Lance no máximo ~2 meses por vez (um ciclo de leitura).`,
    );
  }
  const hojeUtc = meiaNoiteUtc(hoje);
  if (inicio.getTime() > hojeUtc.getTime()) {
    throw new GeracaoManualError("A data inicial está no futuro");
  }

  const { ano, mes } = competenciaDaJanela(fim);
  return { tipoPeriodo, inicio, fim, ano, mes };
}

/**
 * Grava (ou regrava) um lançamento manual e rateia o total pelos dias da janela.
 * Regravar a MESMA janela substitui o rateio anterior por inteiro.
 */
export async function lancarGeracaoManual(
  entrada: EntradaLancamento,
  hoje: Date = new Date(),
): Promise<ResultadoLancamento> {
  const { clientId, registradoPor } = entrada;
  const kwhTotal = Number(entrada.kwhTotal);

  const { tipoPeriodo, inicio, fim, ano, mes } = resolveJanela(entrada, hoje);
  if (!Number.isFinite(kwhTotal) || kwhTotal < 0) {
    throw new GeracaoManualError("Total de geração inválido");
  }

  const client = await prisma.brasilSolarClient.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      nome: true,
      geracaoMediaEsperada: true,
      geracaoAnualEsperada: true,
      potenciaInstalada: true,
    },
  });
  if (!client) throw new GeracaoManualError("Usina não encontrada");

  // Sobreposição com outro lançamento dobraria o kWh dos dias em comum.
  const conflitos = await prisma.manualGenerationEntry.findMany({
    where: {
      clientId,
      dataInicio: { lt: fim },
      dataFim: { gt: inicio },
      ...(entrada.entryId ? { id: { not: entrada.entryId } } : {}),
      NOT: { dataInicio: inicio, dataFim: fim },
    },
    select: { tipoPeriodo: true, dataInicio: true, dataFim: true, ano: true, mes: true },
  });
  if (conflitos.length > 0) {
    const lista = conflitos
      .map((c) =>
        rotuloPeriodo({
          tipoPeriodo: c.tipoPeriodo as TipoPeriodoManual,
          dataInicio: c.dataInicio,
          dataFim: c.dataFim,
          ano: c.ano,
          mes: c.mes,
        }),
      )
      .join(", ");
    throw new GeracaoManualError(
      `O período informado se sobrepõe a outro lançamento manual desta usina (${lista}). Exclua ou ajuste o outro antes.`,
    );
  }

  const logs = await prisma.monitoringLog.findMany({
    where: { clientId, data: { gte: inicio, lt: fim } },
    select: { data: true, geracaoDiaria: true, origem: true },
  });

  const avisos: string[] = [];
  const chaveDia = (d: Date) => d.toISOString().slice(0, 10);
  const diasComApi = new Set<string>();
  let kwhApi = 0;
  for (const log of logs) {
    if (log.origem === "MANUAL") continue;
    diasComApi.add(chaveDia(log.data));
    kwhApi += log.geracaoDiaria;
  }

  // Dias futuros não podem receber kWh: no período em curso o rateio para hoje.
  const hojeUtc = meiaNoiteUtc(hoje);
  const limite = new Date(Math.min(fim.getTime(), hojeUtc.getTime() + UM_DIA_MS));
  const todosOsDias = diasDaJanela(inicio, fim);
  const diasRateaveis = diasDaJanela(inicio, limite);
  if (diasRateaveis.length < todosOsDias.length) {
    avisos.push(
      `Período em curso: o total foi rateado só nos ${diasRateaveis.length} dia(s) que já aconteceram (de ${todosOsDias.length}).`,
    );
  }

  const diasParaRatear = diasRateaveis.filter((d) => !diasComApi.has(chaveDia(d)));

  if (diasParaRatear.length === 0) {
    throw new GeracaoManualError(
      `Todos os ${diasRateaveis.length} dia(s) do período já têm geração medida pela plataforma (${kwhApi.toFixed(1)} kWh). Não há dia para lançar à mão.`,
    );
  }

  const kwhRateado = kwhTotal - kwhApi;
  if (kwhRateado < 0) {
    throw new GeracaoManualError(
      `A plataforma já registrou ${kwhApi.toFixed(1)} kWh neste período, acima do total informado (${kwhTotal.toFixed(1)} kWh). Confira o número antes de lançar.`,
    );
  }
  if (kwhApi > 0) {
    avisos.push(
      `${kwhApi.toFixed(1)} kWh do período já vieram medidos da plataforma (${diasComApi.size} dia(s)); foram descontados e só ${kwhRateado.toFixed(1)} kWh entraram como manual.`,
    );
  }

  const kwhPorDia = kwhRateado / diasParaRatear.length;

  await prisma.$transaction(async (tx) => {
    await tx.monitoringLog.deleteMany({
      where: { clientId, data: { gte: inicio, lt: fim }, origem: "MANUAL" },
    });

    await tx.monitoringLog.createMany({
      data: diasParaRatear.map((data) => ({
        clientId,
        data,
        geracaoDiaria: kwhPorDia,
        geracaoEsperada: esperadaDoDiaDaUsina(client, data),
        origem: "MANUAL",
      })),
    });

    const dados = {
      tipoPeriodo,
      ano,
      mes,
      kwhTotal,
      kwhRateado,
      diasRateados: diasParaRatear.length,
      fonte: entrada.fonte ?? null,
      observacao: entrada.observacao ?? null,
      registradoPor,
    };
    await tx.manualGenerationEntry.upsert({
      where: { clientId_dataInicio_dataFim: { clientId, dataInicio: inicio, dataFim: fim } },
      update: dados,
      create: { clientId, dataInicio: inicio, dataFim: fim, ...dados },
    });
  });

  const entry = await prisma.manualGenerationEntry.findUniqueOrThrow({
    where: { clientId_dataInicio_dataFim: { clientId, dataInicio: inicio, dataFim: fim } },
    select: { id: true },
  });

  await atualizaDesnormalizados(clientId, hoje);

  return {
    entryId: entry.id,
    clientId,
    tipoPeriodo,
    dataInicio: inicio.toISOString(),
    dataFim: fim.toISOString(),
    ano,
    mes,
    kwhTotal,
    kwhRateado,
    kwhApi,
    diasRateados: diasParaRatear.length,
    kwhPorDia,
    avisos,
  };
}

/** Apaga o lançamento e as linhas diárias que ele criou. Dado medido fica. */
export async function removerGeracaoManualPorId(
  entryId: string,
  hoje: Date = new Date(),
): Promise<{ linhasRemovidas: number; clientId: string } | null> {
  const entry = await prisma.manualGenerationEntry.findUnique({
    where: { id: entryId },
    select: { id: true, clientId: true, dataInicio: true, dataFim: true },
  });
  if (!entry) return null;

  const removidas = await prisma.$transaction(async (tx) => {
    const r = await tx.monitoringLog.deleteMany({
      where: {
        clientId: entry.clientId,
        data: { gte: entry.dataInicio, lt: entry.dataFim },
        origem: "MANUAL",
      },
    });
    await tx.manualGenerationEntry.delete({ where: { id: entry.id } });
    return r.count;
  });

  await atualizaDesnormalizados(entry.clientId, hoje);
  return { linhasRemovidas: removidas, clientId: entry.clientId };
}

/**
 * Remove o lançamento MENSAL de um mês (usado pela tela em lote, que trabalha
 * por competência). Lançamento personalizado não é tocado aqui: ele não é
 * editável por uma coluna de mês — só na tela da usina.
 */
export async function removerGeracaoManualDoMes(
  clientId: string,
  ano: number,
  mes: number,
  hoje: Date = new Date(),
): Promise<{ linhasRemovidas: number }> {
  const entry = await prisma.manualGenerationEntry.findFirst({
    where: { clientId, ano, mes, tipoPeriodo: "MENSAL" },
    select: { id: true },
  });
  if (!entry) return { linhasRemovidas: 0 };
  const r = await removerGeracaoManualPorId(entry.id, hoje);
  return { linhasRemovidas: r?.linhasRemovidas ?? 0 };
}

/**
 * Recalcula os campos desnormalizados da usina depois de mexer nas linhas.
 * Só toca no acumulado/PR do mês corrente e NUNCA em `statusMonitoramento`
 * ou `ultimaLeitura`: quem não recebe dado da plataforma continua marcado como
 * quem não recebe dado da plataforma.
 */
async function atualizaDesnormalizados(clientId: string, hoje: Date) {
  const client = await prisma.brasilSolarClient.findUnique({
    where: { id: clientId },
    select: {
      geracaoMediaEsperada: true,
      geracaoAnualEsperada: true,
      potenciaInstalada: true,
    },
  });
  if (!client) return;

  const { inicio, fim } = janelaDoMes(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1);
  const agg = await prisma.monitoringLog.aggregate({
    where: { clientId, data: { gte: inicio, lt: fim } },
    _sum: { geracaoDiaria: true },
  });
  const geracaoMes = agg._sum.geracaoDiaria ?? 0;

  await prisma.brasilSolarClient.update({
    where: { id: clientId },
    data: {
      geracaoMesAtual: geracaoMes,
      performanceRatio: performanceRatioMesAtual(client, geracaoMes, hoje),
    },
  });
}

function classificaStatus(
  diasManuaisRestantes: number,
  diasRateados: number,
): StatusLancamentoManual {
  if (diasManuaisRestantes === 0) return "SUPERADO";
  if (diasManuaisRestantes < diasRateados) return "PARCIAL";
  return "ATIVO";
}

/**
 * Lançamentos de uma usina (mais recentes primeiro), já confrontados com o que
 * está hoje no banco — é o confronto que mostra quando o sync assumiu o período.
 */
export async function listarLancamentosDaUsina(clientId: string): Promise<LancamentoManual[]> {
  const entries = await prisma.manualGenerationEntry.findMany({
    where: { clientId },
    orderBy: { dataInicio: "desc" },
  });
  return enriquecerLancamentos(entries);
}

/** Lançamentos cuja competência é o mês informado (tela em lote). */
export async function listarLancamentosDoMes(
  ano: number,
  mes: number,
): Promise<LancamentoManual[]> {
  const entries = await prisma.manualGenerationEntry.findMany({
    where: { ano, mes },
    include: { client: { select: { nome: true } } },
    orderBy: { client: { nome: "asc" } },
  });
  return enriquecerLancamentos(entries);
}

type EntryRow = {
  id: string;
  clientId: string;
  tipoPeriodo: string;
  dataInicio: Date;
  dataFim: Date;
  ano: number;
  mes: number;
  kwhTotal: number;
  kwhRateado: number;
  diasRateados: number;
  fonte: string | null;
  observacao: string | null;
  registradoPor: string;
  createdAt: Date;
  updatedAt: Date;
  client?: { nome: string };
};

async function enriquecerLancamentos(entries: EntryRow[]): Promise<LancamentoManual[]> {
  if (entries.length === 0) return [];

  // Uma consulta só: pega todas as linhas que caem em qualquer das janelas e
  // depois atribui cada linha à sua janela. Consultar janela a janela custaria
  // uma query por lançamento.
  const clientIds = Array.from(new Set(entries.map((e) => e.clientId)));
  const inicio = new Date(Math.min(...entries.map((e) => e.dataInicio.getTime())));
  const fim = new Date(Math.max(...entries.map((e) => e.dataFim.getTime())));

  const logs = await prisma.monitoringLog.findMany({
    where: { clientId: { in: clientIds }, data: { gte: inicio, lt: fim } },
    select: { clientId: true, data: true, geracaoDiaria: true, origem: true },
  });

  const porCliente = new Map<string, typeof logs>();
  for (const log of logs) {
    const arr = porCliente.get(log.clientId);
    if (arr) arr.push(log);
    else porCliente.set(log.clientId, [log]);
  }

  return entries.map((e) => {
    let manuais = 0;
    let totalKwh = 0;
    let apiKwh = 0;
    for (const log of porCliente.get(e.clientId) ?? []) {
      const t = log.data.getTime();
      if (t < e.dataInicio.getTime() || t >= e.dataFim.getTime()) continue;
      totalKwh += log.geracaoDiaria;
      if (log.origem === "MANUAL") manuais += 1;
      else apiKwh += log.geracaoDiaria;
    }
    return {
      id: e.id,
      clientId: e.clientId,
      clienteNome: e.client?.nome,
      tipoPeriodo: e.tipoPeriodo as TipoPeriodoManual,
      dataInicio: e.dataInicio,
      dataFim: e.dataFim,
      ano: e.ano,
      mes: e.mes,
      kwhTotal: e.kwhTotal,
      kwhRateado: e.kwhRateado,
      diasRateados: e.diasRateados,
      fonte: e.fonte,
      observacao: e.observacao,
      registradoPor: e.registradoPor,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
      diasManuaisRestantes: manuais,
      kwhTotalAtual: totalKwh,
      kwhApiAtual: apiKwh,
      status: classificaStatus(manuais, e.diasRateados),
    };
  });
}

export interface UsinaDoMes {
  id: string;
  nome: string;
  codigoUc: string | null;
  cidade: string | null;
  plataformaMonitoramento: string | null;
  potenciaInstalada: number | null;
  statusMonitoramento: string;
  /** Soma do mês calendário hoje no banco (medido + manual). */
  kwhMes: number;
  kwhApi: number;
  kwhManual: number;
  diasComDado: number;
  /** Lançamento manual já existente com competência no mês, se houver. */
  lancamento: {
    id: string;
    tipoPeriodo: TipoPeriodoManual;
    /** Rótulo do período — no personalizado mostra as datas. */
    periodoLabel: string;
    kwhTotal: number;
    fonte: string | null;
    observacao: string | null;
    registradoPor: string;
    atualizadoEm: Date;
    status: StatusLancamentoManual;
  } | null;
}

/**
 * Usinas ativas com o retrato do mês — alimenta a tela de lançamento em lote.
 * `somenteSemDado` filtra as que não têm nenhum kWh medido no mês (o caso de
 * uso principal: plataforma que não integra ou parou de enviar).
 */
export async function usinasDoMes(
  ano: number,
  mes: number,
  opcoes: { somenteSemDado?: boolean; busca?: string } = {},
): Promise<UsinaDoMes[]> {
  const { inicio, fim } = janelaDoMes(ano, mes);

  const clients = await prisma.brasilSolarClient.findMany({
    where: {
      active: true,
      ...(opcoes.busca
        ? {
            OR: [
              { nome: { contains: opcoes.busca, mode: "insensitive" as const } },
              { codigoUc: { contains: opcoes.busca } },
              { cidade: { contains: opcoes.busca, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      nome: true,
      codigoUc: true,
      cidade: true,
      plataformaMonitoramento: true,
      potenciaInstalada: true,
      statusMonitoramento: true,
    },
    orderBy: { nome: "asc" },
  });

  const ids = clients.map((c) => c.id);
  const [logs, entries] = await Promise.all([
    prisma.monitoringLog.findMany({
      where: { clientId: { in: ids }, data: { gte: inicio, lt: fim } },
      select: { clientId: true, geracaoDiaria: true, origem: true },
    }),
    prisma.manualGenerationEntry.findMany({ where: { clientId: { in: ids }, ano, mes } }),
  ]);

  const porCliente = new Map<
    string,
    { api: number; manual: number; dias: number; diasManuais: number }
  >();
  for (const log of logs) {
    const cur = porCliente.get(log.clientId) ?? { api: 0, manual: 0, dias: 0, diasManuais: 0 };
    cur.dias += 1;
    if (log.origem === "MANUAL") {
      cur.manual += log.geracaoDiaria;
      cur.diasManuais += 1;
    } else {
      cur.api += log.geracaoDiaria;
    }
    porCliente.set(log.clientId, cur);
  }
  // Mais de um lançamento pode ter competência no mesmo mês (dois meio-ciclos).
  // A coluna de digitação só faz sentido com um; com dois, mostra o primeiro e
  // manda editar na usina.
  const entryPorCliente = new Map<string, (typeof entries)[number]>();
  for (const e of entries) if (!entryPorCliente.has(e.clientId)) entryPorCliente.set(e.clientId, e);

  const linhas = clients.map((c) => {
    const agg = porCliente.get(c.id) ?? { api: 0, manual: 0, dias: 0, diasManuais: 0 };
    const entry = entryPorCliente.get(c.id);
    return {
      ...c,
      kwhMes: agg.api + agg.manual,
      kwhApi: agg.api,
      kwhManual: agg.manual,
      diasComDado: agg.dias,
      lancamento: entry
        ? {
            id: entry.id,
            tipoPeriodo: entry.tipoPeriodo as TipoPeriodoManual,
            periodoLabel: rotuloPeriodo({
              tipoPeriodo: entry.tipoPeriodo as TipoPeriodoManual,
              dataInicio: entry.dataInicio,
              dataFim: entry.dataFim,
              ano: entry.ano,
              mes: entry.mes,
            }),
            kwhTotal: entry.kwhTotal,
            fonte: entry.fonte,
            observacao: entry.observacao,
            registradoPor: entry.registradoPor,
            atualizadoEm: entry.updatedAt,
            status: classificaStatus(agg.diasManuais, entry.diasRateados),
          }
        : null,
    };
  });

  // "Sem dado" = sem nenhum kWh MEDIDO. Quem já tem lançamento manual continua
  // na lista: é justamente onde se corrige um valor digitado errado.
  return opcoes.somenteSemDado ? linhas.filter((l) => l.kwhApi <= 0) : linhas;
}

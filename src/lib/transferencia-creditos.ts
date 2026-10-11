/**
 * Transferência de créditos — o acompanhamento mês a mês do saldo transferido.
 *
 * ## O que é (e por que não é rateio)
 *
 * Crédito que ficou PRESO numa geradora (estoque grande, rateio com problema na
 * RGE) só sai de lá por transferência: encerra-se o contrato da geradora com a
 * RGE (troca de titularidade) e manda-se à RGE, por email, o documento
 * "transferência de créditos". O saldo vai de UMA VEZ para as UCs de destino.
 * Rateio é % da geração de todo mês; isto é um ESTOQUE em kWh.
 *
 * O documento da RGE ("Solicitação de Transferência de Saldo") divide o saldo
 * em PERCENTUAL por UC favorecida, sem dizer kWh — por isso o cadastro guarda o
 * % e o total em kWh pode chegar depois (saldo da geradora ou 1ª fatura).
 *
 * ## Como a fatura do destino separa a transferência do resto
 *
 * A fatura da RGE discrimina cada kWh compensado pelo MÊS DE ORIGEM
 * (`ConsumerBill.injetadaDetalhes`). O crédito transferido chega como um bloco
 * com um mês de origem ANTERIOR ao aceite; geração própria e rateio vêm com o
 * mês corrente. Medido em 10/10/2026:
 *
 *   SUBWAY Fernando Ferrari — aceite 30/01/2026, 63.800 kWh da ALEXANDRE DALLA PASQUA
 *     fatura 02/2026: FEV/26 = 894 (geração própria) · JUL/25 = 4.991 (transferência)
 *     saldo 58.809 → 4.991 + 58.809 = 63.800, exato
 *   ELTERONICA FRAZZON — aceite 02/02/2026, 70.840 kWh
 *     faturas 02 a 07/2026: só NOV/25, e o saldo cai exatamente o compensado
 *
 * Regra: numa fatura de mês ≥ mês do aceite, o que tem origem ANTES do mês do
 * aceite é desta transferência — até esgotar os kWh transferidos para a UC.
 * Duas transferências para a mesma UC consomem na ordem do aceite (a mais
 * antiga primeiro), sem contar o mesmo kWh duas vezes.
 *
 * ⚠️ Limite conhecido: crédito ANTIGO que a UC já tinha de outra fonte (rateio
 * anterior, geração própria acumulada) também tem origem antes do aceite e seria
 * contado aqui. O teto nos kWh transferidos impede contar mais do que veio, mas
 * não distingue os dois. A tela mostra o saldo da fatura ao lado para conferir.
 */

import { parseInjetadaDetalhes } from "@/lib/injetada-detalhes";

export const STATUS_TRANSFERENCIA = ["ENVIADA", "ACEITA", "REJEITADA"] as const;
export type StatusTransferencia = (typeof STATUS_TRANSFERENCIA)[number];

export const STATUS_TRANSFERENCIA_LABEL: Record<StatusTransferencia, string> = {
  ENVIADA: "Enviada à RGE",
  ACEITA: "Aceita pela RGE",
  REJEITADA: "Rejeitada",
};

/** Situação de UMA UC de destino — o que o operador quer saber de relance. */
export type SituacaoDestino =
  | "AGUARDANDO_ACEITE"
  | "AGUARDANDO_FATURA"
  | "EM_CONSUMO"
  | "ESGOTADA"
  | "REJEITADA";

export const SITUACAO_DESTINO_LABEL: Record<SituacaoDestino, string> = {
  AGUARDANDO_ACEITE: "Aguardando aceite",
  AGUARDANDO_FATURA: "Aguardando fatura",
  EM_CONSUMO: "Em consumo",
  ESGOTADA: "Esgotada",
  REJEITADA: "Rejeitada",
};

/** Créditos de energia vencem 60 meses depois do mês em que foram gerados. */
export const MESES_VALIDADE_CREDITO = 60;

/** Prazo de atendimento que o próprio formulário da RGE declara. */
export const PRAZO_ANALISE_RGE_DIAS = 30;

/**
 * Dias corridos desde o email à RGE. Nulo sem a data de envio. As datas são
 * gravadas ao meio-dia UTC, então a diferença em dias inteiros não escorrega
 * com o fuso.
 */
export function diasDesdeEnvio(enviadoEm: Date | string | null, hoje: Date = new Date()): number | null {
  if (!enviadoEm) return null;
  const d = new Date(enviadoEm);
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((hoje.getTime() - d.getTime()) / 86_400_000));
}

/** Abaixo disto o saldo é arredondamento, não crédito. */
const KWH_DESPREZIVEL = 0.5;

export interface AnoMes {
  ano: number;
  mes: number;
}

const MESES_ABREV = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

/** {2025, 7} → "JUL/25" — a grafia da fatura da RGE. */
export function rotuloMesOrigem(m: AnoMes): string {
  return `${MESES_ABREV[m.mes - 1]}/${String(m.ano % 100).padStart(2, "0")}`;
}

function chave(m: AnoMes): number {
  return m.ano * 12 + (m.mes - 1);
}

function deChave(k: number): AnoMes {
  return { ano: Math.floor(k / 12), mes: (k % 12) + 1 };
}

/**
 * Mês do aceite. Lê em UTC: as datas são gravadas ao meio-dia UTC, e em hora
 * de Brasília um 1º do mês à meia-noite UTC viraria o último dia do anterior.
 */
export function mesDoAceite(aceitoEm: Date): AnoMes {
  return { ano: aceitoEm.getUTCFullYear(), mes: aceitoEm.getUTCMonth() + 1 };
}

// ─────────────────────────── cálculo (puro) ───────────────────────────

export interface FaturaDestino {
  ano: number;
  mes: number;
  consumoKwh: number | null;
  energiaCompensada: number | null;
  /** Saldo de créditos da instalação impresso na fatura. */
  saldoKwh: number | null;
  /** `ConsumerBill.injetadaDetalhes` cru (JSON em string). */
  injetadaDetalhes: string | null;
}

export interface TransferenciaDaUc {
  itemId: string;
  status: string;
  aceitoEm: Date | null;
  /** Nulo = total ainda desconhecido: a transferência consome sem teto. */
  kwh: number | null;
}

export interface MesAcompanhamento extends AnoMes {
  consumoKwh: number | null;
  compensadoKwh: number | null;
  /** kWh desta transferência compensados nesta fatura. */
  kwhTransferencia: number;
  /** Meses de origem que contaram como transferência ("JUL/25"). */
  origens: string[];
  /** Quanto da transferência sobra DEPOIS desta fatura. Nulo sem o total em kWh. */
  restanteKwh: number | null;
  /** Saldo de créditos que a fatura imprime — inclui o que não é transferência. */
  saldoFaturaKwh: number | null;
}

export interface Acompanhamento {
  situacao: SituacaoDestino;
  usadoKwh: number;
  /** Nulo enquanto o total em kWh não foi informado. */
  restanteKwh: number | null;
  /**
   * Só quando falta o total: o que a 1ª fatura com a transferência indica
   * (compensado + saldo impresso). É PISTA para o operador conferir, nunca é
   * gravado sozinho — o saldo da fatura inclui crédito de outras fontes.
   */
  sugestaoKwh: number | null;
  meses: MesAcompanhamento[];
  /** Primeira fatura em que a transferência apareceu compensando. */
  primeiraFatura: AnoMes | null;
  /** Última fatura da UC que já está no sistema (de mês ≥ aceite). */
  ultimaFatura: AnoMes | null;
  /** Meses de origem do crédito transferido, como a fatura imprime. */
  origens: string[];
  /** Mês em que vence o crédito mais antigo (origem + 60 meses). */
  venceEm: AnoMes | null;
  /** Média de kWh/mês das últimas (até 3) faturas com compensação. */
  mediaMensalKwh: number | null;
  /** No ritmo da média, mês da fatura em que o saldo acaba. */
  previsaoEsgotar: AnoMes | null;
}

export function vazio(situacao: SituacaoDestino, kwh: number | null): Acompanhamento {
  return {
    situacao,
    usadoKwh: 0,
    restanteKwh: kwh,
    sugestaoKwh: null,
    meses: [],
    primeiraFatura: null,
    ultimaFatura: null,
    origens: [],
    venceEm: null,
    mediaMensalKwh: null,
    previsaoEsgotar: null,
  };
}

/**
 * Acompanha TODAS as transferências de UMA UC sobre as faturas dela.
 * Devolve um acompanhamento por `itemId`.
 */
export function acompanharUc(
  faturas: FaturaDestino[],
  transferencias: TransferenciaDaUc[],
): Map<string, Acompanhamento> {
  const out = new Map<string, Acompanhamento>();

  // Só a transferência ACEITA e com data consome crédito. As outras ficam
  // registradas, mas não tocam nas faturas.
  const ativas = transferencias
    .filter((t) => t.status === "ACEITA" && t.aceitoEm)
    .map((t) => ({ ...t, aceite: chave(mesDoAceite(t.aceitoEm!)) }))
    .sort((a, b) => a.aceite - b.aceite);

  for (const t of transferencias) {
    if (t.status === "REJEITADA") out.set(t.itemId, vazio("REJEITADA", t.kwh));
    else if (t.status !== "ACEITA" || !t.aceitoEm) out.set(t.itemId, vazio("AGUARDANDO_ACEITE", t.kwh));
  }
  if (ativas.length === 0) return out;

  const ordenadas = [...faturas].sort((a, b) => chave(a) - chave(b));
  const estado = ativas.map((t) => ({
    t,
    // Sem o total, não há teto: tudo que tem origem antes do aceite conta.
    restante: t.kwh ?? Infinity,
    usado: 0,
    meses: [] as MesAcompanhamento[],
    origens: new Set<number>(),
  }));

  for (const f of ordenadas) {
    const kf = chave(f);
    const detalhes = parseInjetadaDetalhes(f.injetadaDetalhes);
    // O que já foi atribuído a transferências mais antigas NESTA fatura. Como a
    // ordem é por aceite, o "pool" de cada uma (origem < aceite dela) contém o
    // das anteriores — basta descontar o que elas já levaram.
    let jaAlocado = 0;

    for (const e of estado) {
      if (kf < e.t.aceite) continue;
      const antigos = detalhes.filter((d) => chave(d) < e.t.aceite && d.kwh > 0);
      const pool = antigos.reduce((s, d) => s + d.kwh, 0);
      const leva = Math.max(0, Math.min(e.restante, pool - jaAlocado));
      jaAlocado += leva;
      e.restante -= leva;
      e.usado += leva;
      if (leva > 0) for (const d of antigos) e.origens.add(chave(d));
      e.meses.push({
        ano: f.ano,
        mes: f.mes,
        consumoKwh: f.consumoKwh,
        compensadoKwh: f.energiaCompensada,
        kwhTransferencia: leva,
        origens: leva > 0 ? antigos.map((d) => rotuloMesOrigem(d)) : [],
        restanteKwh: e.t.kwh == null ? null : e.restante,
        saldoFaturaKwh: f.saldoKwh,
      });
    }
  }

  for (const e of estado) {
    const usado = e.usado;
    const semTotal = e.t.kwh == null;
    const comConsumo = e.meses.filter((m) => m.kwhTransferencia > 0);
    const ultimos = comConsumo.slice(-3);
    const media = ultimos.length
      ? ultimos.reduce((s, m) => s + m.kwhTransferencia, 0) / ultimos.length
      : null;
    const ultima = e.meses.at(-1) ?? null;
    const origensOrd = [...e.origens].sort((a, b) => a - b);
    const restante = semTotal ? null : e.restante <= KWH_DESPREZIVEL ? 0 : e.restante;
    const primeira = comConsumo[0];

    let previsao: AnoMes | null = null;
    if (media && media > 0 && restante != null && restante > 0 && ultima) {
      previsao = deChave(chave(ultima) + Math.ceil(restante / media));
    }

    out.set(e.t.itemId, {
      situacao: restante === 0 ? "ESGOTADA" : usado > 0 ? "EM_CONSUMO" : "AGUARDANDO_FATURA",
      usadoKwh: usado,
      restanteKwh: restante,
      sugestaoKwh:
        semTotal && primeira && primeira.saldoFaturaKwh != null
          ? primeira.kwhTransferencia + primeira.saldoFaturaKwh
          : null,
      meses: e.meses,
      primeiraFatura: comConsumo[0] ? { ano: comConsumo[0].ano, mes: comConsumo[0].mes } : null,
      ultimaFatura: ultima ? { ano: ultima.ano, mes: ultima.mes } : null,
      origens: origensOrd.map((k) => rotuloMesOrigem(deChave(k))),
      venceEm: origensOrd.length ? deChave(origensOrd[0] + MESES_VALIDADE_CREDITO) : null,
      mediaMensalKwh: media,
      previsaoEsgotar: previsao,
    });
  }

  return out;
}

// ─────────────────────────── validação da entrada ───────────────────────────

/** Folga de arredondamento entre o saldo calculado e o impresso na fatura. */
export const TOLERANCIA_SOMA_KWH = 1;

/** O formulário da RGE aceita no máximo 2 casas e a soma tem de dar 100,00%. */
export const TOLERANCIA_SOMA_PCT = 0.005;

export interface EntradaTransferencia {
  plantId: string | null;
  ucOrigemCodigo: string;
  /** Nulo enquanto não se conhece — o documento só traz percentuais. */
  kwhTotal: number | null;
  status: StatusTransferencia;
  enviadoEm: Date | null;
  aceitoEm: Date | null;
  observacao: string | null;
  titularNome: string | null;
  titularEmail: string | null;
  itens: { consumerUnitId: string; percentual: number; kwh: number | null }[];
}

/** "2026-01-30" → meio-dia UTC (ver `mesDoAceite`). Vazio → null. */
function dataDoForm(v: unknown): Date | null | "invalida" {
  if (v == null || v === "") return null;
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(v)) return "invalida";
  const d = new Date(`${v.slice(0, 10)}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? "invalida" : d;
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Valida o corpo do POST/PATCH. Devolve a entrada limpa ou a lista de erros. */
export function validarEntrada(body: unknown): { ok: true; valor: EntradaTransferencia } | { ok: false; erros: string[] } {
  const b = (body ?? {}) as Record<string, unknown>;
  const erros: string[] = [];

  const ucOrigemCodigo = typeof b.ucOrigemCodigo === "string" ? b.ucOrigemCodigo.trim() : "";
  if (!ucOrigemCodigo) erros.push("Informe o código da UC de origem.");

  // O total é opcional: no dia do envio só existem os percentuais.
  const semTotal = b.kwhTotal == null || b.kwhTotal === "";
  const kwhTotal = semTotal ? null : Number(b.kwhTotal);
  if (kwhTotal != null && (!Number.isFinite(kwhTotal) || kwhTotal <= 0)) {
    erros.push("O total em kWh, quando informado, tem de ser maior que zero.");
  }

  const status = String(b.status ?? "ENVIADA") as StatusTransferencia;
  if (!STATUS_TRANSFERENCIA.includes(status)) erros.push("Situação inválida.");

  const enviadoEm = dataDoForm(b.enviadoEm);
  const aceitoEm = dataDoForm(b.aceitoEm);
  if (enviadoEm === "invalida") erros.push("Data de envio inválida.");
  if (aceitoEm === "invalida") erros.push("Data do aceite inválida.");
  // Sem a data do aceite não há como separar a transferência na fatura.
  if (status === "ACEITA" && !aceitoEm) erros.push("Transferência aceita precisa da data do aceite da RGE.");

  const itensBrutos = Array.isArray(b.itens) ? b.itens : [];
  const itens: EntradaTransferencia["itens"] = [];
  const vistos = new Set<string>();
  for (const it of itensBrutos as Record<string, unknown>[]) {
    const id = typeof it?.consumerUnitId === "string" ? it.consumerUnitId : "";
    const pct = Number(it?.percentual);
    if (!id) continue;
    if (vistos.has(id)) {
      erros.push("A mesma UC aparece duas vezes nos destinos.");
      continue;
    }
    vistos.add(id);
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
      erros.push("Todo destino precisa de um percentual entre 0 e 100.");
    } else if (Math.abs(pct * 100 - Math.round(pct * 100)) > 1e-6) {
      erros.push("A RGE aceita no máximo 2 casas decimais nos percentuais.");
    }
    itens.push({
      consumerUnitId: id,
      percentual: pct,
      kwh: kwhTotal != null && Number.isFinite(kwhTotal) && Number.isFinite(pct) ? (kwhTotal * pct) / 100 : null,
    });
  }
  if (itens.length === 0) erros.push("Inclua pelo menos uma UC de destino.");

  const soma = itens.reduce((s, i) => s + (Number.isFinite(i.percentual) ? i.percentual : 0), 0);
  if (itens.length && Math.abs(soma - 100) > TOLERANCIA_SOMA_PCT) {
    erros.push(`A soma dos percentuais (${soma.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%) tem de dar 100%.`);
  }

  if (erros.length) return { ok: false, erros: [...new Set(erros)] };
  return {
    ok: true,
    valor: {
      plantId: typeof b.plantId === "string" && b.plantId ? b.plantId : null,
      ucOrigemCodigo,
      kwhTotal,
      status,
      enviadoEm: enviadoEm as Date | null,
      aceitoEm: aceitoEm as Date | null,
      observacao: texto(b.observacao),
      titularNome: texto(b.titularNome),
      titularEmail: texto(b.titularEmail),
      itens,
    },
  };
}

// ─────────────────────────── documento da RGE ───────────────────────────

/**
 * O formulário "Solicitação de Transferência de Saldo" vai com o código ANTIGO
 * (10 dígitos) da doadora e das favorecidas — a RGE não aceita o novo.
 * Devolve o antigo, ou nulo quando o cadastro só tem o código novo.
 */
export function codigoAntigoParaRge(antigo: string | null | undefined, codigo: string | null | undefined): string | null {
  const a = (antigo ?? "").replace(/\D/g, "");
  if (a) return a;
  const c = (codigo ?? "").replace(/\D/g, "");
  // 11 ou 12 dígitos é o formato novo; até 10, a UC ainda está no código antigo.
  return c && c.length <= 10 ? c : null;
}

/** 100 → "100%", 33.33 → "33,33%" — no máximo 2 casas, como o formulário pede. */
export function percentualRge(p: number): string {
  return `${p.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

export interface DocumentoRge {
  doadora: string;
  favorecidas: { codigo: string; percentual: string }[];
  titularNome: string;
  titularEmail: string;
}

/** Monta os dados do formulário, ou diz o que falta no cadastro para emitir. */
export function montarDocumentoRge(t: {
  ucOrigemCodigo: string;
  usinaCodigoAntigo: string | null;
  usinaCodigo: string | null;
  titularNome: string | null;
  titularEmail: string | null;
  destinos: { nome: string; codigoUc: string; codigoUcAntigo: string | null; percentual: number }[];
}): { ok: true; valor: DocumentoRge } | { ok: false; erros: string[] } {
  const erros: string[] = [];

  const doadora =
    codigoAntigoParaRge(t.usinaCodigoAntigo, t.ucOrigemCodigo) ?? codigoAntigoParaRge(null, t.usinaCodigo);
  if (!doadora) erros.push("Falta o código ANTIGO da UC doadora (cadastro da usina ou UC de origem).");

  const favorecidas: DocumentoRge["favorecidas"] = [];
  for (const d of t.destinos) {
    const codigo = codigoAntigoParaRge(d.codigoUcAntigo, d.codigoUc);
    if (!codigo) erros.push(`Falta o código ANTIGO da UC ${d.nome}.`);
    else favorecidas.push({ codigo, percentual: percentualRge(d.percentual) });
  }
  if (t.destinos.length === 0) erros.push("A transferência não tem UC de destino.");

  const soma = t.destinos.reduce((s, d) => s + d.percentual, 0);
  if (t.destinos.length && Math.abs(soma - 100) > TOLERANCIA_SOMA_PCT) erros.push("Os percentuais não somam 100%.");

  if (!t.titularNome) erros.push("Informe o nome do titular que assina o pedido.");
  if (!t.titularEmail) erros.push("Informe o email do titular.");

  if (erros.length || !doadora) return { ok: false, erros };
  return { ok: true, valor: { doadora, favorecidas, titularNome: t.titularNome!, titularEmail: t.titularEmail! } };
}

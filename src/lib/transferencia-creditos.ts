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
  kwh: number;
}

export interface MesAcompanhamento extends AnoMes {
  consumoKwh: number | null;
  compensadoKwh: number | null;
  /** kWh desta transferência compensados nesta fatura. */
  kwhTransferencia: number;
  /** Meses de origem que contaram como transferência ("JUL/25"). */
  origens: string[];
  /** Quanto da transferência sobra DEPOIS desta fatura. */
  restanteKwh: number;
  /** Saldo de créditos que a fatura imprime — inclui o que não é transferência. */
  saldoFaturaKwh: number | null;
}

export interface Acompanhamento {
  situacao: SituacaoDestino;
  usadoKwh: number;
  restanteKwh: number;
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

export function vazio(situacao: SituacaoDestino, kwh: number): Acompanhamento {
  return {
    situacao,
    usadoKwh: 0,
    restanteKwh: kwh,
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
    restante: t.kwh,
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
      if (leva > 0) for (const d of antigos) e.origens.add(chave(d));
      e.meses.push({
        ano: f.ano,
        mes: f.mes,
        consumoKwh: f.consumoKwh,
        compensadoKwh: f.energiaCompensada,
        kwhTransferencia: leva,
        origens: leva > 0 ? antigos.map((d) => rotuloMesOrigem(d)) : [],
        restanteKwh: e.restante,
        saldoFaturaKwh: f.saldoKwh,
      });
    }
  }

  for (const e of estado) {
    const usado = e.t.kwh - e.restante;
    const comConsumo = e.meses.filter((m) => m.kwhTransferencia > 0);
    const ultimos = comConsumo.slice(-3);
    const media = ultimos.length
      ? ultimos.reduce((s, m) => s + m.kwhTransferencia, 0) / ultimos.length
      : null;
    const ultima = e.meses.at(-1) ?? null;
    const origensOrd = [...e.origens].sort((a, b) => a - b);
    const restante = e.restante <= KWH_DESPREZIVEL ? 0 : e.restante;

    let previsao: AnoMes | null = null;
    if (media && media > 0 && restante > 0 && ultima) {
      previsao = deChave(chave(ultima) + Math.ceil(restante / media));
    }

    out.set(e.t.itemId, {
      situacao: restante === 0 ? "ESGOTADA" : usado > 0 ? "EM_CONSUMO" : "AGUARDANDO_FATURA",
      usadoKwh: usado,
      restanteKwh: restante,
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

/** Folga na soma dos destinos contra o total — arredondamento de kWh. */
export const TOLERANCIA_SOMA_KWH = 1;

export interface EntradaTransferencia {
  plantId: string | null;
  ucOrigemCodigo: string;
  kwhTotal: number;
  status: StatusTransferencia;
  enviadoEm: Date | null;
  aceitoEm: Date | null;
  observacao: string | null;
  itens: { consumerUnitId: string; kwh: number }[];
}

/** "2026-01-30" → meio-dia UTC (ver `mesDoAceite`). Vazio → null. */
function dataDoForm(v: unknown): Date | null | "invalida" {
  if (v == null || v === "") return null;
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(v)) return "invalida";
  const d = new Date(`${v.slice(0, 10)}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? "invalida" : d;
}

/** Valida o corpo do POST/PATCH. Devolve a entrada limpa ou a lista de erros. */
export function validarEntrada(body: unknown): { ok: true; valor: EntradaTransferencia } | { ok: false; erros: string[] } {
  const b = (body ?? {}) as Record<string, unknown>;
  const erros: string[] = [];

  const ucOrigemCodigo = typeof b.ucOrigemCodigo === "string" ? b.ucOrigemCodigo.trim() : "";
  if (!ucOrigemCodigo) erros.push("Informe o código da UC de origem.");

  const kwhTotal = Number(b.kwhTotal);
  if (!Number.isFinite(kwhTotal) || kwhTotal <= 0) erros.push("Informe o total de kWh transferido.");

  const status = String(b.status ?? "ENVIADA") as StatusTransferencia;
  if (!STATUS_TRANSFERENCIA.includes(status)) erros.push("Situação inválida.");

  const enviadoEm = dataDoForm(b.enviadoEm);
  const aceitoEm = dataDoForm(b.aceitoEm);
  if (enviadoEm === "invalida") erros.push("Data de envio inválida.");
  if (aceitoEm === "invalida") erros.push("Data do aceite inválida.");
  // Sem a data do aceite não há como separar a transferência na fatura.
  if (status === "ACEITA" && !aceitoEm) erros.push("Transferência aceita precisa da data do aceite da RGE.");

  const itensBrutos = Array.isArray(b.itens) ? b.itens : [];
  const itens: { consumerUnitId: string; kwh: number }[] = [];
  const vistos = new Set<string>();
  for (const it of itensBrutos as Record<string, unknown>[]) {
    const id = typeof it?.consumerUnitId === "string" ? it.consumerUnitId : "";
    const kwh = Number(it?.kwh);
    if (!id) continue;
    if (vistos.has(id)) {
      erros.push("A mesma UC aparece duas vezes nos destinos.");
      continue;
    }
    vistos.add(id);
    if (!Number.isFinite(kwh) || kwh <= 0) erros.push("Todo destino precisa de kWh maior que zero.");
    itens.push({ consumerUnitId: id, kwh });
  }
  if (itens.length === 0) erros.push("Inclua pelo menos uma UC de destino.");

  const soma = itens.reduce((s, i) => s + (Number.isFinite(i.kwh) ? i.kwh : 0), 0);
  if (itens.length && Number.isFinite(kwhTotal) && Math.abs(soma - kwhTotal) > TOLERANCIA_SOMA_KWH) {
    erros.push(
      `A soma dos destinos (${soma.toLocaleString("pt-BR")} kWh) não fecha com o total (${kwhTotal.toLocaleString("pt-BR")} kWh).`,
    );
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
      observacao: typeof b.observacao === "string" && b.observacao.trim() ? b.observacao.trim() : null,
      itens,
    },
  };
}

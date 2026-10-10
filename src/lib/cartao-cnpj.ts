/**
 * Validade do cartão CNPJ para a RGE.
 *
 * 📏 Regra do Paulo (10/10/2026): a RGE NÃO aceita cartão CNPJ emitido há mais
 * de 6 meses. O aviso começa aos 5 meses, para sobrar um mês de margem para
 * emitir outro na Receita antes de um rateio ser devolvido por isso.
 *
 * A data sai do próprio documento: o comprovante da Receita termina com
 * "Emitido no dia DD/MM/AAAA às HH:MM:SS (data e hora de Brasília)". Cartão
 * escaneado ou fotografado não tem texto — aí a data fica desconhecida e isso
 * é DITO, nunca estimado pela data do envio.
 *
 * Regra pura, sem banco: serve a rota, o pacote e as telas.
 */

export const MESES_AVISO_CARTAO_CNPJ = 5;
export const MESES_LIMITE_CARTAO_CNPJ = 6;

/**
 *   ok        — emitido há menos de 5 meses
 *   vencendo  — entre 5 e 6 meses: ainda aceito, hora de emitir outro
 *   vencido   — mais de 6 meses: a RGE recusa
 *   sem_data  — não deu para ler a data de emissão no arquivo
 */
export type SituacaoCartaoCnpj = "ok" | "vencendo" | "vencido" | "sem_data";

/** Data de emissão (AAAA-MM-DD) lida do texto do comprovante. Null = não achou. */
export function dataEmissaoCartaoCnpj(texto: string): string | null {
  const m = /emitido\s+no\s+dia\s+(\d{2})\s*\/\s*(\d{2})\s*\/\s*(\d{4})/i.exec(texto);
  if (!m) return null;
  const [, d, mes, a] = m;
  const data = new Date(Date.UTC(Number(a), Number(mes) - 1, Number(d)));
  // 31/02 e afins: o Date "corrige" para março, e a data lida deixaria de ser a do papel.
  if (data.getUTCDate() !== Number(d) || data.getUTCMonth() !== Number(mes) - 1) return null;
  return `${a}-${mes}-${d}`;
}

/**
 * CNPJ impresso no comprovante (14 dígitos). É o primeiro do texto: o campo
 * "NÚMERO DE INSCRIÇÃO" abre o documento. Null em cartão escaneado.
 */
export function cnpjDoCartao(texto: string): string | null {
  const m = /\b(\d{2})\.?(\d{3})\.?(\d{3})\/(\d{4})-?(\d{2})\b/.exec(texto);
  return m ? m.slice(1).join("") : null;
}

/**
 * Página da Receita que emite o comprovante, já com o CNPJ preenchido quando
 * ele é conhecido. A emissão pede captcha — por isso é um atalho para o
 * operador, e não uma busca automática.
 */
export function urlReceitaCartaoCnpj(cnpj?: string | null): string {
  const base = "https://solucoes.receita.fazenda.gov.br/Servicos/cnpjreva/Cnpjreva_Solicitacao.asp";
  const d = (cnpj ?? "").replace(/\D/g, "");
  return d.length === 14 ? `${base}?cnpj=${d}` : base;
}

/** Soma meses a uma data AAAA-MM-DD, sem escorregar de mês (31/08 + 6 = 28/02). */
export function somaMeses(iso: string, meses: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimoDia));
  return alvo.toISOString().slice(0, 10);
}

export interface ValidadeCartaoCnpj {
  situacao: SituacaoCartaoCnpj;
  emitidoEm: string | null;
  /** Dia em que completa 5 meses — quando o aviso começa. */
  avisaEm: string | null;
  /** Último dia em que a RGE ainda aceita (6 meses da emissão). */
  aceitoAte: string | null;
}

export function validadeCartaoCnpj(
  emitidoEm: string | null | undefined,
  hoje: Date = new Date(),
): ValidadeCartaoCnpj {
  if (!emitidoEm || !/^\d{4}-\d{2}-\d{2}$/.test(emitidoEm)) {
    return { situacao: "sem_data", emitidoEm: null, avisaEm: null, aceitoAte: null };
  }
  const avisaEm = somaMeses(emitidoEm, MESES_AVISO_CARTAO_CNPJ);
  const aceitoAte = somaMeses(emitidoEm, MESES_LIMITE_CARTAO_CNPJ);
  // Comparação por data-calendário de Brasília, que é o fuso do comprovante.
  const hojeIso = new Date(hoje.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  const situacao: SituacaoCartaoCnpj =
    hojeIso > aceitoAte ? "vencido" : hojeIso >= avisaEm ? "vencendo" : "ok";
  return { situacao, emitidoEm, avisaEm, aceitoAte };
}

/** AAAA-MM-DD → DD/MM/AAAA, sem passar por fuso. */
export function dataBr(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

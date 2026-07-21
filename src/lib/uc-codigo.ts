/**
 * Normalização do código da UC (migração RGE jul/2026).
 *
 * A concessionária passou a imprimir o "Número da UC" no formato pontuado
 * `3.562.981.001-26`, enquanto o parser de fatura e o de-para gravam SÓ DÍGITOS
 * (`356298100126`). O formato canônico no banco é DÍGITOS — se um for gravado
 * pontuado e outro em dígitos, o sistema trata como UCs diferentes e duplica.
 *
 * Este helper converte o formato pontuado da RGE para dígitos, preservando
 * qualquer outro valor (códigos antigos de 10 dígitos, códigos de outras
 * distribuidoras, null/undefined/vazio) intactos.
 */
const NUMERO_UC_FMT = /^\d\.\d{3}\.\d{3}\.\d{3}-\d{2}$/;

export function normalizeCodigoUc(v: string | null | undefined): string | null | undefined {
  if (typeof v !== "string") return v;
  const t = v.trim();
  if (NUMERO_UC_FMT.test(t)) return t.replace(/\D/g, "");
  return v;
}

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
// Forma longa (12 dígitos): 3.562.981.001-26
// Forma curta (11 dígitos): 429.474.001-20 — sem o primeiro grupo. Confirmada no
// portal da RGE (2026-07-22) em UCs antigas; ex.: CAUZZO JÚLIO DE CASTILHOS e
// IRFADI SANTO CRISTO. Aqui o casamento é ancorado (^...$) no campo de código da
// UC, então não há risco de confundir com o CPF que tem o mesmo arranjo.
const NUMERO_UC_FMT = /^(?:\d\.)?\d{3}\.\d{3}\.\d{3}-\d{2}$/;

export function normalizeCodigoUc(v: string | null | undefined): string | null | undefined {
  if (typeof v !== "string") return v;
  const t = v.trim();
  if (NUMERO_UC_FMT.test(t)) return t.replace(/\D/g, "");
  return v;
}

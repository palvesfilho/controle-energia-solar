/**
 * Formatação da LINHA DIGITÁVEL do boleto, como ela sai impressa.
 *
 * O Asaas devolve 47 dígitos corridos
 * (`46191110000000000004282981993015715830000000500`). Ninguém consegue
 * conferir isso contra o boleto do banco, e conferir é exatamente o que a
 * pessoa faz antes de pagar. Impressa, a linha vem em cinco campos:
 *
 *   AAAAA.AAAAA  BBBBB.BBBBBB  CCCCC.CCCCCC  D  EEEEEEEEEEEEEE
 *      10 díg.       11 díg.       11 díg.   1      14 díg.
 *
 * (Febraban: banco+moeda+campo livre, dígito verificador geral, fator de
 * vencimento e valor.)
 *
 * ⚠️ **Só agrupa; nunca altera dígito.** Se o tamanho não for o esperado,
 * devolve o que veio — um número de pagamento "consertado" por formatação é
 * pior do que um número feio.
 */

/** 47 dígitos = boleto bancário. 48 = conta de consumo/arrecadação. */
export function formatarLinhaDigitavel(bruto: string | null | undefined): string {
  const d = (bruto ?? "").replace(/\D/g, "");

  if (d.length === 47) {
    return [
      `${d.slice(0, 5)}.${d.slice(5, 10)}`,
      `${d.slice(10, 15)}.${d.slice(15, 21)}`,
      `${d.slice(21, 26)}.${d.slice(26, 32)}`,
      d.slice(32, 33),
      d.slice(33),
    ].join(" ");
  }

  // Arrecadação (tributos, concessionárias): quatro blocos de 12.
  if (d.length === 48) {
    return [d.slice(0, 12), d.slice(12, 24), d.slice(24, 36), d.slice(36)].join(" ");
  }

  return bruto ?? "";
}

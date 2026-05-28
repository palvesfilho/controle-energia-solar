/**
 * Recalcula o "valor total da fatura" a partir dos itens da ConsumerBill,
 * somando apenas os valores positivos (que aumentam a conta) e ignorando
 * qualquer valor negativo (créditos compensados, ajustes a favor, etc.).
 *
 * Por que: a fatura impressa da RGE traz às vezes ajustes que não refletem
 * fielmente o consumo do mês (refaturamentos, ressarcimentos, etc.).
 * Recalculando do zero a partir dos itens positivos, temos o valor bruto
 * "limpo" do mês — base pra cobrar do cliente.
 *
 * Itens considerados (todos somados quando > 0):
 *  - Consumo TE / TUSD (Grupo B + Grupo A ponta/fora ponta)
 *  - Custo de disponibilidade TE / TUSD
 *  - Bandeira tarifária (total ou por posto)
 *  - Demanda + Ultrapassagem (Grupo A)
 *  - Reativo excedente (Grupo A)
 *  - Iluminação pública (COSIP)
 *  - Juros / multa / outros encargos
 *
 * NÃO entram: injetadaOucTe/Tusd (são negativos = créditos), nem nenhum
 * valor < 0 — a regra é estritamente "soma o que aumenta a conta".
 */

/** Subconjunto da ConsumerBill que o calculador precisa. */
export interface FaturaCalcInput {
  // Grupo B (consumo único)
  consumoTeValor: number | null;
  consumoTusdValor: number | null;
  // Custo de disponibilidade
  custoDispTeValor: number | null;
  custoDispTusdValor: number | null;
  // Bandeira (Grupo B)
  bandeiraValor: number | null;
  // Grupo A — consumo por posto
  consumoTePontaValor: number | null;
  consumoTeForaPontaValor: number | null;
  consumoTusdPontaValor: number | null;
  consumoTusdForaPontaValor: number | null;
  // Grupo A — bandeira por posto
  bandeiraValorPonta: number | null;
  bandeiraValorForaPonta: number | null;
  // Grupo A — demanda
  demandaTusdValor: number | null;
  demandaUltrapassagemValor: number | null;
  // Grupo A — reativo excedente
  reativoExcedentePontaValor: number | null;
  reativoExcedenteForaPontaValor: number | null;
  // Encargos / outros
  iluminacaoPublicaCip: number | null;
  jurosMora: number | null;
  multaAtraso: number | null;
  atualizacaoMonetaria: number | null;
  multasOutros: number | null;
}

export interface FaturaCalcResult {
  valorTotalCalculado: number;
  // Quais campos efetivamente contribuíram (>0). Útil pra debug/auditoria.
  parcelas: Array<{ campo: keyof FaturaCalcInput; valor: number }>;
}

function pos(v: number | null | undefined): number {
  return v != null && Number.isFinite(v) && v > 0 ? v : 0;
}

export function calcularValorTotalFatura(
  bill: FaturaCalcInput,
): FaturaCalcResult {
  const parcelas: FaturaCalcResult["parcelas"] = [];
  let total = 0;

  const campos: (keyof FaturaCalcInput)[] = [
    "consumoTeValor",
    "consumoTusdValor",
    "custoDispTeValor",
    "custoDispTusdValor",
    "bandeiraValor",
    "consumoTePontaValor",
    "consumoTeForaPontaValor",
    "consumoTusdPontaValor",
    "consumoTusdForaPontaValor",
    "bandeiraValorPonta",
    "bandeiraValorForaPonta",
    "demandaTusdValor",
    "demandaUltrapassagemValor",
    "reativoExcedentePontaValor",
    "reativoExcedenteForaPontaValor",
    "iluminacaoPublicaCip",
    "jurosMora",
    "multaAtraso",
    "atualizacaoMonetaria",
    "multasOutros",
  ];

  for (const campo of campos) {
    const v = pos(bill[campo]);
    if (v > 0) {
      parcelas.push({ campo, valor: v });
      total += v;
    }
  }

  return { valorTotalCalculado: total, parcelas };
}

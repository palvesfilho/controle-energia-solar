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
 *
 * ⚠️ Grupo A e Grupo B guardam a MESMA cobrança em campos diferentes, e somar as
 * duas laterais conta duas vezes. A linha `Consumo Ponta [KWh] - TUSD` começa com
 * "consumo", então o parser monômio a captura em `consumoTusdValor` ao mesmo tempo
 * que o parser Grupo A a captura em `consumoTusdPontaValor` — valores idênticos em
 * 13/13 faturas da GRÁFICA JACUI, R$ 29.788 duplicados em 13 meses. Por isso
 * `escolherLateral` abaixo: havendo campos por posto, os monômios são ignorados.
 *
 * 🔑 O TE hoje escapa por acidente — o rótulo dele é `Cons Ponta - TE`, não
 * "Consumo", então `consumoTeValor` fica null no Grupo A. É o MESMO bug que deixa
 * `tarifaTE` null. Quem for corrigir aquele bug vai popular `consumoTeValor` e
 * criaria a segunda duplicação; a escolha de lateral já cobre esse caso.
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
  // Grupo A — TUSD sobre a geração (só UC com micro/minigeração no Grupo A).
  // Pesa muito: R$ 4.200 de R$ 4.333 do subtotal na OBA FOOD SERVICE.
  tusdGeracaoValor?: number | null;
  // Encargos / outros
  iluminacaoPublicaCip: number | null;
  jurosMora: number | null;
  multaAtraso: number | null;
  atualizacaoMonetaria: number | null;
}

export interface FaturaCalcResult {
  valorTotalCalculado: number;
  // Quais campos efetivamente contribuíram (>0). Útil pra debug/auditoria.
  parcelas: Array<{ campo: keyof FaturaCalcInput; valor: number }>;
}

function pos(v: number | null | undefined): number {
  return v != null && Number.isFinite(v) && v > 0 ? v : 0;
}

/** Campos que só existem no Grupo A (cobrança separada por posto tarifário). */
const CAMPOS_POR_POSTO: (keyof FaturaCalcInput)[] = [
  "consumoTePontaValor",
  "consumoTeForaPontaValor",
  "consumoTusdPontaValor",
  "consumoTusdForaPontaValor",
  "bandeiraValorPonta",
  "bandeiraValorForaPonta",
];

/** Equivalentes monômios (Grupo B) — a MESMA cobrança, em campo de posto único. */
const CAMPOS_MONOMIOS: (keyof FaturaCalcInput)[] = [
  "consumoTeValor",
  "consumoTusdValor",
  "bandeiraValor",
];

/**
 * Fatura com qualquer campo por posto preenchido é Grupo A: a cobrança de consumo
 * e bandeira já está inteira nos campos por posto, e o que estiver nos monômios é
 * eco da mesma linha. Sem nenhum campo por posto (Grupo B, Nova Palma), nada muda.
 */
function ehPorPosto(bill: FaturaCalcInput): boolean {
  return CAMPOS_POR_POSTO.some((c) => bill[c] != null);
}

export function calcularValorTotalFatura(
  bill: FaturaCalcInput,
): FaturaCalcResult {
  const parcelas: FaturaCalcResult["parcelas"] = [];
  let total = 0;

  const porPosto = ehPorPosto(bill);

  const campos: (keyof FaturaCalcInput)[] = [
    // Consumo e bandeira: UMA lateral só, nunca as duas.
    ...(porPosto ? CAMPOS_POR_POSTO : CAMPOS_MONOMIOS),
    // Os demais valem pros dois grupos (ou são null onde não se aplicam).
    "custoDispTeValor",
    "custoDispTusdValor",
    "demandaTusdValor",
    "demandaUltrapassagemValor",
    "tusdGeracaoValor",
    "reativoExcedentePontaValor",
    "reativoExcedenteForaPontaValor",
    "iluminacaoPublicaCip",
    "jurosMora",
    "multaAtraso",
    "atualizacaoMonetaria",
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

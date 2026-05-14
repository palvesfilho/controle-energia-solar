/**
 * Fallback do parser PDF quando o OCR Infosimples vem corrompido.
 *
 * Caso real: na fatura abr/2026 do Othavio, o array `energia.medidor` veio
 * com colunas embaralhadas — `consumo_kwh: "Energia Ativa Injetada TE..."`
 * (texto no campo numérico) e leituras vazias. Isso deixa
 * `energiaInjetadaMedidorKwh = null` mesmo com `energiaInjetada > 0`.
 *
 * O parser do PDF (`parseFaturaPdf`) é mais resiliente porque roda regex
 * direto no texto, não depende da estrutura do OCR. Quando detectamos OCR
 * Infosimples incompleto e há PDF salvo localmente, rodamos o parser PDF
 * pra preencher SOMENTE os campos do medidor de injeção que estavam null.
 *
 * Não sobrescreve nenhum campo que o Infosimples já preencheu — segurança.
 */
import { parseFaturaPdf } from "./fatura-pdf-parser";
import { readFromStorage } from "./file-storage";

/** Campos do medidor de injeção que o Infosimples às vezes deixa null. */
const INJECTION_METER_FIELDS = [
  "energiaInjetadaMedidorKwh",
  "leituraInjetadaAnterior",
  "leituraInjetadaAtual",
  "constanteMedidorInjetada",
] as const;

type BillData = Record<string, unknown>;

export interface FallbackResult {
  enriched: BillData;
  usedFallback: boolean;
  fieldsBackfilled: string[];
  reason?: string;
}

/**
 * Detecta se vale rodar o fallback. Critério: a fatura aparenta ter geração GD
 * (energiaInjetada > 0) mas o medidor de injeção veio vazio. Se a UC não tem
 * geração própria, todos os campos null é estado normal e não disparamos fallback.
 */
function shouldRunFallback(billData: BillData): boolean {
  const ei = billData.energiaInjetada;
  const eim = billData.energiaInjetadaMedidorKwh;
  const hasInjection = typeof ei === "number" && ei > 0;
  const meterEmpty = eim == null;
  return hasInjection && meterEmpty;
}

/**
 * Mescla campos do medidor de injeção. Só preenche os que o Infosimples
 * deixou null E o PDF conseguiu extrair. Nunca sobrescreve.
 */
export async function enrichBillFromPdfFallback(
  billData: BillData,
  pdfUrl: string | null,
): Promise<FallbackResult> {
  if (!shouldRunFallback(billData)) {
    return { enriched: billData, usedFallback: false, fieldsBackfilled: [] };
  }
  if (!pdfUrl) {
    return { enriched: billData, usedFallback: false, fieldsBackfilled: [], reason: "sem PDF salvo" };
  }

  const file = await readFromStorage(pdfUrl);
  if (!file) {
    return { enriched: billData, usedFallback: false, fieldsBackfilled: [], reason: "PDF não está no storage" };
  }
  const buf = file.data;

  let parsedBill: BillData;
  try {
    const parsed = await parseFaturaPdf(new Uint8Array(buf));
    parsedBill = parsed.bill as unknown as BillData;
  } catch (e) {
    return {
      enriched: billData,
      usedFallback: false,
      fieldsBackfilled: [],
      reason: `parseFaturaPdf falhou: ${e instanceof Error ? e.message : "erro"}`,
    };
  }

  const enriched = { ...billData };
  const fieldsBackfilled: string[] = [];
  for (const field of INJECTION_METER_FIELDS) {
    if (enriched[field] == null && parsedBill[field] != null) {
      enriched[field] = parsedBill[field];
      fieldsBackfilled.push(field);
    }
  }

  return {
    enriched,
    usedFallback: fieldsBackfilled.length > 0,
    fieldsBackfilled,
  };
}

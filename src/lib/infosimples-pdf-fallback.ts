/**
 * Fallback do parser PDF quando o OCR Infosimples vem corrompido.
 *
 * Caso 1 — medidor de injeção: na fatura abr/2026 do Othavio, o array
 * `energia.medidor` veio com colunas embaralhadas — `consumo_kwh: "Energia
 * Ativa Injetada TE..."` (texto no campo numérico) e leituras vazias. Isso
 * deixa `energiaInjetadaMedidorKwh = null` mesmo com `energiaInjetada > 0`.
 *
 * Caso 2 — bloco de compensação (crédito oUC/mUC da usina): a partir de
 * jun/2026 a RGE trocou o rótulo por "Energ Atv Inj. oUC mPT - TE MES/AA" e o
 * OCR do Infosimples passou a devolver essas linhas com as colunas ROTACIONADAS
 * — a descrição cai em `base_icms`, a tarifa vira `descricao`, o valor vira
 * `quantidade_faturada`. `parseInjetadaOuc` só recupera o lado que casa com a
 * heurística de shift (normalmente o TUSD) e `injetadaOucTeValor` fica null.
 * Sem ele o `calcularValorCobrado` recusa a fatura com "Sem injetadaOucTeValor
 * na fatura" e a UC não pode ser cobrada.
 *
 * Caso 3 — consumo e valor total: na mesma rotação, `medidor[0].consumo_kwh`
 * recebe uma TARIFA (0,5885) e `valor_total` vira 0. A fatura fica com 0,58 kWh
 * de consumo e R$ 0 de total mesmo com o PDF mostrando 742 kWh / R$ 217,50.
 *
 * O parser do PDF (`parseFaturaPdf`) é mais resiliente porque roda regex direto
 * no texto, não depende da estrutura do OCR. Quando detectamos OCR Infosimples
 * incoerente e há PDF salvo, rodamos o parser PDF pra recuperar os campos.
 *
 * Segurança: nada é sobrescrito por palpite. Um bloco só é substituído quando
 * o próprio OCR se contradiz (um lado do crédito sem o outro, consumo menor que
 * o consumo faturado, medidor com valor de tarifa) E o PDF é da MESMA referência
 * (mês/ano) E o parse do PDF está saudável. Fora disso, só preenchemos campos
 * que vieram null.
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

/**
 * Bloco de compensação — substituído em conjunto, nunca campo a campo: misturar
 * o TE do PDF com o TUSD estimado por divisão do OCR (508,9999902715137 kWh em
 * vez de 509) deixa a fatura internamente inconsistente. Inclui a geração
 * própria porque a rotação também troca uma pela outra: em faturas sem linha
 * oUC o OCR classificou a injeção PRÓPRIA como crédito da usina.
 */
const INJECTION_CREDIT_FIELDS = [
  "injetadaOucTeKwh",
  "injetadaOucTeValor",
  "injetadaOucTusdKwh",
  "injetadaOucTusdValor",
  "injetadaDetalhes",
  "energiaInjetada",
  "energiaCompensada",
  "energiaInjetadaPropriaTeKwh",
  "energiaInjetadaPropriaTeValor",
  "energiaInjetadaPropriaTusdKwh",
  "energiaInjetadaPropriaTusdValor",
] as const;

/**
 * Créditos de bandeira — entram no cálculo da cobrança e ficam no mesmo trecho
 * rotacionado. Preenchidos só quando o OCR deixou null.
 */
const CREDIT_SIDE_FIELDS = [
  "bandeiraAmarelaCreditoValor",
  "bandeiraVermelhaCreditoValor",
  "bandeiraVermelha2CreditoValor",
] as const;

type BillData = Record<string, unknown>;

export interface FallbackResult {
  enriched: BillData;
  usedFallback: boolean;
  /** Campos que estavam null e o PDF preencheu. */
  fieldsBackfilled: string[];
  /** Campos sobrescritos porque o valor do OCR se contradizia. */
  fieldsReplaced: string[];
  reason?: string;
}

/** Linha de log única pros 3 pontos de sync (UC, usina, sync-all). */
export function describeFallback(r: FallbackResult): string {
  const partes: string[] = [];
  if (r.fieldsBackfilled.length) partes.push(`preenchidos: ${r.fieldsBackfilled.join(", ")}`);
  if (r.fieldsReplaced.length) {
    partes.push(`substituídos (OCR incoerente): ${r.fieldsReplaced.join(", ")}`);
  }
  if (r.reason) partes.push(`atenção: ${r.reason}`);
  return partes.join(" | ") || "nada a fazer";
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Detecta se vale rodar o fallback do medidor. Critério: a fatura aparenta ter
 * geração GD (energiaInjetada > 0) mas o medidor de injeção veio vazio. Se a UC
 * não tem geração própria, todos os campos null é estado normal.
 */
function meterLooksBroken(billData: BillData): boolean {
  const ei = num(billData.energiaInjetada);
  const eim = billData.energiaInjetadaMedidorKwh;
  return ei != null && ei > 0 && eim == null;
}

/**
 * Medidor com valor de TARIFA no lugar da leitura: `consumo_kwh` rotacionado
 * devolve 0,45156029. Nenhum medidor de injeção real mede menos de 1 kWh no mês
 * quando a fatura registra compensação.
 */
function meterLooksLikeTariff(billData: BillData): boolean {
  const eim = num(billData.energiaInjetadaMedidorKwh);
  return eim != null && eim > 0 && eim < 2;
}

/**
 * Detecta OCR rotacionado no bloco de compensação. Dois sinais:
 *  - `injetadaDetalhes` tem entrada `SHIFTED_*` — a linha só foi recuperada
 *    pela heurística de colunas deslocadas, então a origem (mês) se perdeu;
 *  - um lado (TE ou TUSD) veio e o outro não. Na fatura RGE as duas linhas
 *    sempre andam juntas: só uma presente = a outra sumiu no OCR.
 */
export function creditBlockLooksBroken(billData: BillData): boolean {
  const detalhes = billData.injetadaDetalhes;
  if (typeof detalhes === "string" && detalhes.includes("SHIFTED_")) return true;

  const teValor = num(billData.injetadaOucTeValor);
  const tusdValor = num(billData.injetadaOucTusdValor);
  const teKwh = num(billData.injetadaOucTeKwh);
  const tusdKwh = num(billData.injetadaOucTusdKwh);
  if ((teValor == null) !== (tusdValor == null)) return true;
  if ((teKwh == null) !== (tusdKwh == null)) return true;
  return false;
}

/**
 * `consumoKwh` (lido do medidor no OCR) incoerente com o consumo FATURADO
 * TE/TUSD, que vem de outra coluna do mesmo OCR: 0,5885 kWh contra 742 kWh
 * faturados é a assinatura da rotação de colunas.
 *
 * Consumo BAIXO por si só não é sintoma — UC geradora fatura o custo de
 * disponibilidade com o medidor em 0 kWh, e isso é o estado correto.
 */
function consumoLooksBroken(billData: BillData): boolean {
  const consumo = num(billData.consumoKwh);
  const faturado = num(billData.consumoTeKwh) ?? num(billData.consumoTusdKwh);
  return faturado != null && faturado > 0 && (consumo == null || consumo < faturado * 0.5);
}

/** Fatura sem valor total — nada a cobrar e nada a repassar. */
function valorTotalLooksBroken(billData: BillData): boolean {
  const total = num(billData.valorTotal);
  return total == null || total === 0;
}

/** Consumo ou valor total incoerentes — dispara a leitura do PDF. */
export function consumoBlockLooksBroken(billData: BillData): boolean {
  return consumoLooksBroken(billData) || valorTotalLooksBroken(billData);
}

/** O PDF só é aceito se traz os dois lados do crédito — senão não resolve nada. */
function creditBlockComplete(parsed: BillData): boolean {
  return (
    num(parsed.injetadaOucTeValor) != null &&
    num(parsed.injetadaOucTusdValor) != null &&
    num(parsed.injetadaOucTeKwh) != null &&
    num(parsed.injetadaOucTusdKwh) != null
  );
}

/**
 * PDF sem NENHUMA linha oUC/mUC mas com injeção própria: estado legítimo (toda a
 * energia injetada é do painel do próprio cliente). Nesse caso o crédito da
 * usina precisa ser ZERADO — foi a rotação do OCR que rotulou a injeção própria
 * como crédito de outra UC.
 */
function creditBlockIsPropriaOnly(parsed: BillData): boolean {
  const semOuc =
    num(parsed.injetadaOucTeValor) == null && num(parsed.injetadaOucTusdValor) == null;
  const temPropria =
    num(parsed.energiaInjetadaPropriaTeValor) != null ||
    num(parsed.energiaInjetadaPropriaTusdValor) != null;
  return semOuc && temPropria;
}

/**
 * A saúde do parse do PDF é avaliada por BLOCO, não em bloco único: há faturas
 * em que o PDF entrega a compensação inteira e não entrega o "Total a pagar"
 * (LABIMED BLOCO B 07/2026). Exigir tudo junto jogaria fora o dado bom.
 * O casamento de mês/ano de referência — checado antes — já é a prova de que o
 * documento foi lido.
 */
function pdfTemConsumo(parsed: BillData): boolean {
  const consumo = num(parsed.consumoKwh);
  return consumo != null && consumo > 0;
}

function pdfTemValorTotal(parsed: BillData): boolean {
  const total = num(parsed.valorTotal);
  return total != null && total > 0;
}

/**
 * Mescla campos do PDF na fatura vinda do Infosimples. Ver o cabeçalho do
 * arquivo para as regras de substituição.
 */
export async function enrichBillFromPdfFallback(
  billData: BillData,
  pdfUrl: string | null,
): Promise<FallbackResult> {
  const meterBroken = meterLooksBroken(billData) || meterLooksLikeTariff(billData);
  const creditBroken = creditBlockLooksBroken(billData);
  const consumoBroken = consumoBlockLooksBroken(billData);
  const nothing: FallbackResult = {
    enriched: billData,
    usedFallback: false,
    fieldsBackfilled: [],
    fieldsReplaced: [],
  };

  if (!meterBroken && !creditBroken && !consumoBroken) return nothing;
  if (!pdfUrl) return { ...nothing, reason: "sem PDF salvo" };

  const file = await readFromStorage(pdfUrl);
  if (!file) return { ...nothing, reason: "PDF não está no storage" };

  let parsedBill: BillData;
  try {
    const parsed = await parseFaturaPdf(new Uint8Array(file.data));
    parsedBill = parsed.bill as unknown as BillData;
  } catch (e) {
    return {
      ...nothing,
      reason: `parseFaturaPdf falhou: ${e instanceof Error ? e.message : "erro"}`,
    };
  }

  // Guarda: PDF de outra referência (arquivo trocado / nome reaproveitado)
  // não pode alimentar esta fatura.
  const mesmaRef =
    parsedBill.mesReferencia === billData.mesReferencia &&
    parsedBill.anoReferencia === billData.anoReferencia;
  if (!mesmaRef) {
    return {
      ...nothing,
      reason:
        `PDF é da referência ${parsedBill.mesReferencia}/${parsedBill.anoReferencia}, ` +
        `fatura é ${billData.mesReferencia}/${billData.anoReferencia}`,
    };
  }

  const enriched = { ...billData };
  const fieldsBackfilled: string[] = [];
  const fieldsReplaced: string[] = [];
  const avisos: string[] = [];

  const fill = (field: string) => {
    if (enriched[field] == null && parsedBill[field] != null) {
      enriched[field] = parsedBill[field];
      fieldsBackfilled.push(field);
    }
  };
  const replace = (field: string) => {
    if (enriched[field] !== parsedBill[field]) {
      enriched[field] = parsedBill[field];
      fieldsReplaced.push(field);
    }
  };

  // Bloco 1 — medidor de injeção.
  for (const field of INJECTION_METER_FIELDS) fill(field);
  if (meterLooksLikeTariff(billData)) {
    const pdfMedidor = num(parsedBill.energiaInjetadaMedidorKwh);
    if (pdfMedidor != null && pdfMedidor >= 2) {
      replace("energiaInjetadaMedidorKwh");
      for (const f of ["leituraInjetadaAnterior", "leituraInjetadaAtual", "constanteMedidorInjetada"]) {
        if (parsedBill[f] != null) replace(f);
      }
    } else {
      avisos.push("medidor de injeção do OCR parece ser tarifa e o PDF não trouxe leitura melhor");
    }
  }

  // Bloco 2 — compensação (crédito da usina + geração própria).
  if (creditBroken) {
    if (creditBlockComplete(parsedBill) || creditBlockIsPropriaOnly(parsedBill)) {
      for (const field of INJECTION_CREDIT_FIELDS) replace(field);
      for (const field of CREDIT_SIDE_FIELDS) fill(field);
      if (creditBlockIsPropriaOnly(parsedBill)) {
        avisos.push(
          "PDF não tem linha oUC/mUC — toda a injeção é geração própria do cliente; " +
          "crédito da usina zerado",
        );
      }
    } else {
      avisos.push(
        "bloco de compensação rotacionado no OCR e o PDF também não trouxe os dois lados (TE/TUSD)",
      );
    }
  }

  // Bloco 3 — consumo e valor total, avaliados separadamente.
  if (consumoBroken) {
    if (consumoLooksBroken(billData)) {
      if (pdfTemConsumo(parsedBill)) {
        replace("consumoKwh");
        for (const f of ["leituraAnterior", "leituraAtual", "diasFaturamento"]) {
          if (parsedBill[f] != null) replace(f);
        }
      } else if (num(billData.consumoKwh) == null) {
        // PDF concordar com um consumo baixo não é anomalia — só avisamos quando
        // o consumo não existe em nenhuma das duas fontes.
        avisos.push("fatura sem consumo no OCR e o PDF também não trouxe consumo");
      }
    }
    if (valorTotalLooksBroken(billData)) {
      if (pdfTemValorTotal(parsedBill)) replace("valorTotal");
      else avisos.push("fatura sem valor total e o PDF também não trouxe o total a pagar");
    }
    fill("vencimento");
    fill("codigoBarras");
  }

  return {
    enriched,
    usedFallback: fieldsBackfilled.length > 0 || fieldsReplaced.length > 0,
    fieldsBackfilled,
    fieldsReplaced,
    reason: avisos.length ? avisos.join("; ") : undefined,
  };
}

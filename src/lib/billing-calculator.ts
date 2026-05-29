/**
 * Cálculo de cobrança do cliente final a partir da fatura de energia.
 *
 * Duas regras implementadas (ConsumerUnit.regraRemuneracao):
 *
 *   - FAT_UNICA_COMPENSADA_BANDEIRAS:
 *       cobrança = (energiaCompensada + ajusteSaldo) × percentCompensado
 *                + bandeiraCredito × percentBandeira
 *                + parcelaInstantâneo                  (se UC geradora descontado)
 *                + valorTotal RGE                      (pass-through — fatura única)
 *
 *   - PERCENTUAL_SOBRE_COMPENSADO:
 *       igual ao FAT_UNICA, **sem** somar o valorTotal da RGE.
 *       (cliente paga a RGE direto; a gente cobra só o percentual)
 *
 * Regras legadas (DESC_COMPENSADA, DESC_FATURA_COMPENSADA_DOMMO, etc.) retornam
 * null com mensagem "ainda não implementada".
 */

export type RegraRemuneracao =
  | "FAT_UNICA_COMPENSADA_BANDEIRAS"
  | "PERCENTUAL_SOBRE_COMPENSADO"
  | "DESC_COMPENSADA"
  | "DESC_FATURA_COMPENSADA_DOMMO";

export interface BillInput {
  // Créditos de energia compensada (vêm negativos na fatura — viramos absoluto).
  injetadaOucTeValor: number | null;
  injetadaOucTusdValor: number | null;
  // Crédito de bandeira por cor (vêm negativos na fatura — viramos absoluto).
  // Se algum vier null, simplesmente não soma.
  bandeiraAmarelaCreditoValor?: number | null;
  bandeiraVermelhaCreditoValor?: number | null;
  bandeiraVermelha2CreditoValor?: number | null;
  // Ajuste de saldo de crédito da concessionária (vem negativo — somado ao
  // compensado, com a mesma alíquota percentCompensado).
  ajusteSaldoCredito?: number | null;
  // Valor total cobrado pela RGE — usado SÓ em FAT_UNICA (passa direto pra
  // cobrança), porque a gente cobra a conta inteira e repassa pra concessionária.
  valorTotal?: number | null;
  // Campos usados só em UC geradora com regra USINA_CONSUMO_DESCONTADO:
  consumoInstantaneoKwh?: number | null;
  tarifaTE?: number | null;
  tarifaTUSD?: number | null;
}

export interface UnitInput {
  regraRemuneracao: string | null;
  percentCompensado: number | null;
  percentBandeira: number | null;
  isGeradoraDescontado?: boolean;
}

export interface CalcResultado {
  valorCobrado: number | null;
  regra: string | null;
  detalhamento: {
    injetadaOucTeValor: number | null;
    injetadaOucTusdValor: number | null;
    energiaCompensadaValor: number | null;
    ajusteSaldoValor: number | null;
    descontoContrato: number | null;
    parcelaEnergia: number | null;          // (compensada + ajuste) × descontoContrato
    bandeiraCreditoValor: number | null;    // |amarelaCred|+|vermelhaCred|+|vermelha2Cred|
    descontoContratoBandeira: number | null;
    parcelaBandeira: number | null;
    consumoInstantaneoKwh: number | null;
    consumoInstantaneoValor: number | null;
    parcelaInstantaneo: number | null;
    valorTotalRGE: number | null;           // só preenchido em FAT_UNICA
  };
  problemas: string[];
}

/**
 * Núcleo comum: calcula compensada + ajuste + bandeira + instantâneo.
 * O caller (FAT_UNICA ou PERCENTUAL_SOBRE_COMPENSADO) decide se soma valorTotal.
 */
function calcularPercentualSobreCompensadoBase(
  bill: BillInput,
  unit: UnitInput,
  somarValorTotal: boolean,
  regraNome: string,
): CalcResultado {
  const problemas: string[] = [];

  if (bill.injetadaOucTeValor == null) problemas.push("Sem injetadaOucTeValor na fatura");
  if (bill.injetadaOucTusdValor == null) problemas.push("Sem injetadaOucTusdValor na fatura");

  const descontoContrato = unit.percentCompensado;
  if (descontoContrato == null) problemas.push("UC sem Desconto de Contrato cadastrado");

  const descontoBandeira = unit.percentBandeira;

  // 1) Energia compensada — soma dos absolutos de TE e TUSD.
  const energiaCompensadaValor =
    bill.injetadaOucTeValor != null && bill.injetadaOucTusdValor != null
      ? Math.abs(bill.injetadaOucTeValor) + Math.abs(bill.injetadaOucTusdValor)
      : null;

  // 2) Ajuste de saldo de crédito — também na mesma alíquota do compensado.
  //    Vem negativo na fatura (é crédito a transferir); pegamos absoluto.
  const ajusteSaldoValor =
    bill.ajusteSaldoCredito != null ? Math.abs(bill.ajusteSaldoCredito) : null;

  // 3) Parcela de energia: (compensada + ajuste) × percentCompensado.
  //    Se compensada é null, parcela é null. Ajuste null vira 0 — só não pode
  //    inflar o resultado quando compensada existe e ajuste falta.
  const parcelaEnergia =
    energiaCompensadaValor != null && descontoContrato != null
      ? (energiaCompensadaValor + (ajusteSaldoValor ?? 0)) * descontoContrato
      : null;

  // 4) Crédito de bandeira — soma dos absolutos das 3 cores (mês verde = 0).
  const bandeiraCreditoValor =
    bill.bandeiraAmarelaCreditoValor != null ||
    bill.bandeiraVermelhaCreditoValor != null ||
    bill.bandeiraVermelha2CreditoValor != null
      ? Math.abs(bill.bandeiraAmarelaCreditoValor ?? 0) +
        Math.abs(bill.bandeiraVermelhaCreditoValor ?? 0) +
        Math.abs(bill.bandeiraVermelha2CreditoValor ?? 0)
      : null;

  const parcelaBandeira =
    bandeiraCreditoValor != null && descontoBandeira != null
      ? bandeiraCreditoValor * descontoBandeira
      : null;

  // 5) Consumo instantâneo (só UC geradora em DESCONTADO).
  let consumoInstantaneoValor: number | null = null;
  let parcelaInstantaneo: number | null = null;
  if (unit.isGeradoraDescontado) {
    const kwh = bill.consumoInstantaneoKwh;
    const te = bill.tarifaTE;
    const tusd = bill.tarifaTUSD;
    if (kwh == null) {
      problemas.push(
        "UC geradora em DESCONTADO sem consumoInstantaneoKwh preenchido — cobrança ignora consumo instantâneo",
      );
    } else if (te == null || tusd == null) {
      problemas.push(
        "Fatura sem tarifaTE/tarifaTUSD — não foi possível valorar consumo instantâneo",
      );
    } else {
      consumoInstantaneoValor = kwh * (te + tusd);
      if (descontoContrato != null) {
        parcelaInstantaneo = consumoInstantaneoValor * descontoContrato;
      }
    }
  }

  // 6) Valor RGE pass-through (só FAT_UNICA).
  const valorTotalRGE = somarValorTotal ? bill.valorTotal ?? null : null;
  if (somarValorTotal && bill.valorTotal == null) {
    problemas.push("Fatura sem valorTotal — FAT_UNICA não conseguiu somar a conta da RGE");
  }

  // 7) Soma final.
  let valorCobrado: number | null = null;
  if (parcelaEnergia != null) {
    valorCobrado =
      parcelaEnergia +
      (parcelaBandeira ?? 0) +
      (parcelaInstantaneo ?? 0) +
      (somarValorTotal ? bill.valorTotal ?? 0 : 0);
  }

  return {
    valorCobrado,
    regra: regraNome,
    detalhamento: {
      injetadaOucTeValor: bill.injetadaOucTeValor,
      injetadaOucTusdValor: bill.injetadaOucTusdValor,
      energiaCompensadaValor,
      ajusteSaldoValor,
      descontoContrato,
      parcelaEnergia,
      bandeiraCreditoValor,
      descontoContratoBandeira: descontoBandeira,
      parcelaBandeira,
      consumoInstantaneoKwh: bill.consumoInstantaneoKwh ?? null,
      consumoInstantaneoValor,
      parcelaInstantaneo,
      valorTotalRGE,
    },
    problemas,
  };
}

function notImplementedResult(regra: string | null, msg: string): CalcResultado {
  return {
    valorCobrado: null,
    regra,
    detalhamento: {
      injetadaOucTeValor: null,
      injetadaOucTusdValor: null,
      energiaCompensadaValor: null,
      ajusteSaldoValor: null,
      descontoContrato: null,
      parcelaEnergia: null,
      bandeiraCreditoValor: null,
      descontoContratoBandeira: null,
      parcelaBandeira: null,
      consumoInstantaneoKwh: null,
      consumoInstantaneoValor: null,
      parcelaInstantaneo: null,
      valorTotalRGE: null,
    },
    problemas: [msg],
  };
}

export function calcularValorCobrado(
  bill: BillInput,
  unit: UnitInput,
): CalcResultado {
  switch (unit.regraRemuneracao) {
    case "FAT_UNICA_COMPENSADA_BANDEIRAS":
      return calcularPercentualSobreCompensadoBase(
        bill,
        unit,
        /* somarValorTotal */ true,
        "FAT_UNICA_COMPENSADA_BANDEIRAS",
      );
    case "PERCENTUAL_SOBRE_COMPENSADO":
      return calcularPercentualSobreCompensadoBase(
        bill,
        unit,
        /* somarValorTotal */ false,
        "PERCENTUAL_SOBRE_COMPENSADO",
      );
    case "DESC_COMPENSADA":
    case "DESC_FATURA_COMPENSADA_DOMMO":
      return notImplementedResult(
        unit.regraRemuneracao,
        `Regra "${unit.regraRemuneracao}" ainda não implementada`,
      );
    default:
      return notImplementedResult(
        unit.regraRemuneracao ?? null,
        "UC sem regra de remuneração selecionada",
      );
  }
}

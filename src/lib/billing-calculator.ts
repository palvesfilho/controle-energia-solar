/**
 * Cálculo de cobrança do cliente final a partir da fatura de energia.
 *
 * Três regras de remuneração suportadas (ConsumerUnit.regraRemuneracao):
 *   - DESC_COMPENSADA               → TODO
 *   - DESC_COMPENSADA_BANDEIRAS     → implementado
 *   - DESC_FATURA_COMPENSADA_DOMMO  → TODO
 */

export type RegraRemuneracao =
  | "DESC_COMPENSADA"
  | "DESC_COMPENSADA_BANDEIRAS"
  | "DESC_FATURA_COMPENSADA_DOMMO";

export interface BillInput {
  injetadaOucTeValor: number | null;   // R$ creditado em TE (vem negativo na fatura)
  injetadaOucTusdValor: number | null; // R$ creditado em TUSD (vem negativo na fatura)
  bandeiraValor: number | null;
  // Campos usados só em UC geradora com regra USINA_CONSUMO_DESCONTADO:
  // somamos o consumo instantâneo (kWh gerado e consumido na hora) × tarifa
  // ao valor cobrado, antes de aplicar o desconto de contrato.
  consumoInstantaneoKwh?: number | null;
  tarifaTE?: number | null;
  tarifaTUSD?: number | null;
}

export interface UnitInput {
  regraRemuneracao: string | null;
  percentCompensado: number | null;
  percentBandeira: number | null;
  // True quando a UC é a geradora da plant e a plant é USINA_CONSUMO_DESCONTADO.
  // Nesse caso incorpora consumo instantâneo no cálculo.
  isGeradoraDescontado?: boolean;
}

export interface CalcResultado {
  valorCobrado: number | null;
  regra: string | null;
  detalhamento: {
    injetadaOucTeValor: number | null;
    injetadaOucTusdValor: number | null;
    energiaCompensadaValor: number | null;   // |injetadaOucTeValor| + |injetadaOucTusdValor|
    descontoContrato: number | null;
    parcelaEnergia: number | null;           // energiaCompensadaValor × descontoContrato
    bandeiraValor: number | null;
    descontoContratoBandeira: number | null;
    parcelaBandeira: number | null;          // bandeiraValor × descontoContratoBandeira
    // Só preenchidos quando isGeradoraDescontado = true
    consumoInstantaneoKwh: number | null;
    consumoInstantaneoValor: number | null;  // kwh × (tarifaTE + tarifaTUSD)
    parcelaInstantaneo: number | null;       // consumoInstantaneoValor × descontoContrato
  };
  problemas: string[];
}

/**
 * Aplica a regra DESC_COMPENSADA_BANDEIRAS:
 *   valor = (|injetadaOucTeValor| + |injetadaOucTusdValor|) × descontoContrato
 *         + bandeiraValor × descontoContratoBandeira
 *
 * injetadaOucTeValor e injetadaOucTusdValor vêm negativos na fatura
 * (representam crédito deduzido) — tomamos o valor absoluto.
 */
function calcularDescCompensadaBandeiras(
  bill: BillInput,
  unit: UnitInput,
): CalcResultado {
  const problemas: string[] = [];

  if (bill.injetadaOucTeValor == null) problemas.push("Sem injetadaOucTeValor na fatura");
  if (bill.injetadaOucTusdValor == null) problemas.push("Sem injetadaOucTusdValor na fatura");

  const descontoContrato = unit.percentCompensado;
  if (descontoContrato == null) problemas.push("UC sem Desconto de Contrato cadastrado");

  const descontoBandeira = unit.percentBandeira;
  // Bandeira em R$ pode ser nula (mês Verde sem cobrança) — não é problema.

  const energiaCompensadaValor =
    bill.injetadaOucTeValor != null && bill.injetadaOucTusdValor != null
      ? Math.abs(bill.injetadaOucTeValor) + Math.abs(bill.injetadaOucTusdValor)
      : null;

  const parcelaEnergia =
    energiaCompensadaValor != null && descontoContrato != null
      ? energiaCompensadaValor * descontoContrato
      : null;

  const parcelaBandeira =
    bill.bandeiraValor != null && descontoBandeira != null
      ? bill.bandeiraValor * descontoBandeira
      : null;

  // Parcela extra pra UC geradora em DESCONTADO: consumo instantâneo × tarifa
  // com o mesmo desconto de contrato aplicado. Se a flag não está ligada ou
  // faltam dados, fica null (não entra no valor).
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

  // Soma parcelas disponíveis. Se bandeira é null (mês verde), soma só energia.
  let valorCobrado: number | null = null;
  if (parcelaEnergia != null) {
    valorCobrado =
      parcelaEnergia + (parcelaBandeira ?? 0) + (parcelaInstantaneo ?? 0);
  }

  return {
    valorCobrado,
    regra: "DESC_COMPENSADA_BANDEIRAS",
    detalhamento: {
      injetadaOucTeValor: bill.injetadaOucTeValor,
      injetadaOucTusdValor: bill.injetadaOucTusdValor,
      energiaCompensadaValor,
      descontoContrato,
      parcelaEnergia,
      bandeiraValor: bill.bandeiraValor,
      descontoContratoBandeira: descontoBandeira,
      parcelaBandeira,
      consumoInstantaneoKwh: bill.consumoInstantaneoKwh ?? null,
      consumoInstantaneoValor,
      parcelaInstantaneo,
    },
    problemas,
  };
}

export function calcularValorCobrado(
  bill: BillInput,
  unit: UnitInput,
): CalcResultado {
  switch (unit.regraRemuneracao) {
    case "DESC_COMPENSADA_BANDEIRAS":
      return calcularDescCompensadaBandeiras(bill, unit);
    case "DESC_COMPENSADA":
    case "DESC_FATURA_COMPENSADA_DOMMO":
      return {
        valorCobrado: null,
        regra: unit.regraRemuneracao,
        detalhamento: {
          injetadaOucTeValor: null,
          injetadaOucTusdValor: null,
          energiaCompensadaValor: null,
          descontoContrato: null,
          parcelaEnergia: null,
          bandeiraValor: null,
          descontoContratoBandeira: null,
          parcelaBandeira: null,
          consumoInstantaneoKwh: null,
          consumoInstantaneoValor: null,
          parcelaInstantaneo: null,
        },
        problemas: [`Regra "${unit.regraRemuneracao}" ainda não implementada`],
      };
    default:
      return {
        valorCobrado: null,
        regra: unit.regraRemuneracao ?? null,
        detalhamento: {
          injetadaOucTeValor: null,
          injetadaOucTusdValor: null,
          energiaCompensadaValor: null,
          descontoContrato: null,
          parcelaEnergia: null,
          bandeiraValor: null,
          descontoContratoBandeira: null,
          parcelaBandeira: null,
          consumoInstantaneoKwh: null,
          consumoInstantaneoValor: null,
          parcelaInstantaneo: null,
        },
        problemas: ["UC sem regra de remuneração selecionada"],
      };
  }
}

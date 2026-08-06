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
 *   - FAT_UNICA_COMPENSADA_BANDEIRAS_DIMARZARI:
 *       cobrança idêntica à FAT_UNICA — trafega como `valorCobradoDimarzari` /
 *       `valorCobrancaDimarzari`. O que muda é só a EXIBIÇÃO: o "valor sem
 *       desconto" do demonstrativo vira `valorCobranca × 1,25`
 *       (ver MULTIPLICADOR_SEM_DESCONTO), e a economia é a diferença.
 *
 *   - PERCENTUAL_SOBRE_COMPENSADO:
 *       igual ao FAT_UNICA, **sem** somar o valorTotal da RGE.
 *       (cliente paga a RGE direto; a gente cobra só o percentual)
 *
 * Regras legadas (DESC_COMPENSADA, DESC_FATURA_COMPENSADA_DOMMO, etc.) retornam
 * null com mensagem "ainda não implementada".
 */

import { precoKwhSolar, type PrecoKwhInput } from "@/lib/preco-kwh";

export type RegraRemuneracao =
  | "FAT_UNICA_COMPENSADA_BANDEIRAS"
  | "FAT_UNICA_COMPENSADA_BANDEIRAS_DIMARZARI"
  | "PERCENTUAL_SOBRE_COMPENSADO"
  | "DESC_COMPENSADA"
  | "DESC_FATURA_COMPENSADA_DOMMO";

// Herda de `PrecoKwhInput` os campos do posto FORA PONTA (Grupo A) — é o preço
// que vale para o consumo instantâneo, porque é o horário em que há sol.
export interface BillInput extends PrecoKwhInput {
  // Créditos de energia compensada (vêm negativos na fatura — viramos absoluto).
  // Esses campos representam APENAS o crédito da nossa usina (linhas oUC).
  injetadaOucTeValor: number | null;
  injetadaOucTusdValor: number | null;
  // Geração própria do cliente (Lei 14.300) — linhas "Energia Ativa Injetada"
  // sem "oUC". Subtraída do compensado antes de aplicar o desconto da Associação,
  // porque 100% do benefício é do cliente.
  energiaInjetadaPropriaTeValor?: number | null;
  energiaInjetadaPropriaTusdValor?: number | null;
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
  // Tarifa BASE (sem impostos) — fallback quando tarifa com tributos não veio
  // do parser (faturas legadas pré 2026-06-27).
  tarifaTE?: number | null;
  tarifaTUSD?: number | null;
  // Tarifa COM tributos (ICMS+PIS+COFINS) — Grupo B / posto único.
  tarifaTeComTributos?: number | null;
  tarifaTusdComTributos?: number | null;
}

export interface UnitInput {
  regraRemuneracao: string | null;
  percentCompensado: number | null;
  percentBandeira: number | null;
  isGeradoraDescontado?: boolean;
}

export interface CalcResultado {
  valorCobrado: number | null;
  /**
   * SÓ EXIBIÇÃO — exclusivo da regra FAT_UNICA_COMPENSADA_BANDEIRAS_DIMARZARI.
   * É o `valorCobrado` multiplicado por MULTIPLICADOR_SEM_DESCONTO (1,25),
   * usado como "quanto a conta seria sem o desconto" na tela/PDF.
   * NÃO é cobrado do cliente e NÃO é gravado em ConsumerUnitBilling.
   * Nas demais regras vem null.
   */
  valorCobradoDimarzari?: number | null;
  regra: string | null;
  detalhamento: {
    injetadaOucTeValor: number | null;
    injetadaOucTusdValor: number | null;
    energiaCompensadaValor: number | null;
    geracaoPropriaValor: number | null;     // descontada antes do percentCompensado
    energiaCompensadaLiquida: number | null; // compensada − geração própria
    ajusteSaldoValor: number | null;
    descontoContrato: number | null;
    parcelaEnergia: number | null;          // (compensadaLiquida + ajuste) × descontoContrato
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

  // 1) Energia compensada — soma dos absolutos de TE e TUSD (linhas oUC = nossa usina).
  //    Os campos injetadaOuc* já vêm separados da geração própria (Lei 14.300)
  //    pelo parser; não precisa subtrair de novo aqui.
  const energiaCompensadaValor =
    bill.injetadaOucTeValor != null && bill.injetadaOucTusdValor != null
      ? Math.abs(bill.injetadaOucTeValor) + Math.abs(bill.injetadaOucTusdValor)
      : null;

  // 1.5) Geração própria — exposta no detalhamento apenas pra auditoria.
  //      NÃO entra na fórmula porque já foi separada nos campos oUC.
  const geracaoPropriaTe = bill.energiaInjetadaPropriaTeValor;
  const geracaoPropriaTusd = bill.energiaInjetadaPropriaTusdValor;
  const geracaoPropriaValor =
    geracaoPropriaTe != null || geracaoPropriaTusd != null
      ? Math.abs(geracaoPropriaTe ?? 0) + Math.abs(geracaoPropriaTusd ?? 0)
      : null;
  // Líquida = mesma coisa que compensada (mantido pra compat do detalhamento).
  const energiaCompensadaLiquida = energiaCompensadaValor;

  // 2) Ajuste de saldo de crédito — também na mesma alíquota do compensado.
  //    Vem negativo na fatura (é crédito a transferir); pegamos absoluto.
  const ajusteSaldoValor =
    bill.ajusteSaldoCredito != null ? Math.abs(bill.ajusteSaldoCredito) : null;

  // 3) Parcela de energia: (compensada + ajuste) × percentCompensado.
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
  //    Preferimos a tarifa COM tributos (preço real que o cliente pagaria por
  //    aquele kWh se tivesse passado pela rede). Caímos no fallback da base
  //    sem impostos só quando os campos novos ainda não foram preenchidos
  //    (faturas legadas antes do parser ser atualizado em 2026-06-27).
  //    🔑 No Grupo A o preço é o do posto FORA PONTA — é onde há sol. Quem
  //    decide é `precoKwhSolar` (lib/preco-kwh.ts), a regra única do sistema.
  let consumoInstantaneoValor: number | null = null;
  let parcelaInstantaneo: number | null = null;
  if (unit.isGeradoraDescontado) {
    const kwh = bill.consumoInstantaneoKwh;
    const preco = precoKwhSolar(bill);
    if (kwh == null) {
      problemas.push(
        "UC geradora em DESCONTADO sem consumoInstantaneoKwh preenchido — cobrança ignora consumo instantâneo",
      );
    } else if (preco.precoKwh == null) {
      problemas.push(
        preco.motivo ??
          "Fatura sem tarifaTE/tarifaTUSD — não foi possível valorar consumo instantâneo",
      );
    } else {
      if (preco.estimado) {
        problemas.push(
          preco.motivo ??
            "Fatura sem tarifa com tributos — usando gross-up estimado; reparsear o PDF preenche o campo correto",
        );
      }
      consumoInstantaneoValor = kwh * preco.precoKwh;
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
      geracaoPropriaValor,
      energiaCompensadaLiquida,
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
      geracaoPropriaValor: null,
      energiaCompensadaLiquida: null,
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

/**
 * Multiplicador de EXIBIÇÃO por regra.
 *
 * Não altera em nada o que o cliente paga (`valorCobranca`). Só define o valor
 * "como se a conta fosse sem o desconto" mostrado no demonstrativo:
 *
 *     custoTotalSemDesconto = valorCobranca × multiplicador
 *     economia              = custoTotalSemDesconto − valorCobranca
 *
 * Regras ausentes deste mapa mantêm o cálculo somatório (fatura RGE + créditos).
 */
export const MULTIPLICADOR_SEM_DESCONTO: Record<string, number> = {
  FAT_UNICA_COMPENSADA_BANDEIRAS_DIMARZARI: 1.25,
};

export interface CustoSemDesconto {
  custoSemDesconto: number;
  economia: number;
  /** true = veio do multiplicador da regra; false = somatório padrão */
  viaMultiplicador: boolean;
  multiplicador: number | null;
}

/**
 * Resolve o par (custo sem desconto, economia) exibido no demonstrativo.
 *
 * @param custoSomatorio  cálculo padrão (valorTotalRGE + valorCompensado)
 * @param economiaPadrao  economia padrão (ConsumerUnitBilling.valorEconomia)
 */
export function resolverCustoSemDesconto(
  regraRemuneracao: string | null,
  valorCobranca: number,
  custoSomatorio: number,
  economiaPadrao: number,
): CustoSemDesconto {
  const mult = regraRemuneracao ? MULTIPLICADOR_SEM_DESCONTO[regraRemuneracao] : undefined;
  if (mult == null) {
    return {
      custoSemDesconto: custoSomatorio,
      economia: economiaPadrao,
      viaMultiplicador: false,
      multiplicador: null,
    };
  }
  const custoSemDesconto = valorCobranca * mult;
  return {
    custoSemDesconto,
    economia: custoSemDesconto - valorCobranca,
    viaMultiplicador: true,
    multiplicador: mult,
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
    // Variante DIMARZARI — a COBRANÇA é idêntica à FAT_UNICA. O multiplicador
    // do contrato não entra aqui: ele só infla o "sem desconto" exibido no
    // demonstrativo (ver resolverCustoSemDesconto).
    case "FAT_UNICA_COMPENSADA_BANDEIRAS_DIMARZARI": {
      const base = calcularPercentualSobreCompensadoBase(
        bill,
        unit,
        /* somarValorTotal */ true,
        "FAT_UNICA_COMPENSADA_BANDEIRAS_DIMARZARI",
      );
      const mult = MULTIPLICADOR_SEM_DESCONTO["FAT_UNICA_COMPENSADA_BANDEIRAS_DIMARZARI"];
      return {
        ...base,
        // valorCobrado (o que o cliente paga) NÃO muda.
        valorCobradoDimarzari: base.valorCobrado != null ? base.valorCobrado * mult : null,
      };
    }
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

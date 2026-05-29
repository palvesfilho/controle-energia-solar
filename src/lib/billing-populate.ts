/**
 * Preenche automaticamente ConsumerUnitBilling a partir de ConsumerBill
 * (após sync Infosimples ou upload manual).
 *
 * Regras:
 *  - Se o ConsumerUnitBilling já tem asaasChargeId, NÃO mexe (cobrança já emitida).
 *  - Caso contrário, recalcula e sobrescreve os campos valorFatura, valorCompensado,
 *    valorEconomia, valorCobranca, dataVencimento.
 *  - status fica PENDENTE (só muda quando for enviado ao Asaas).
 *  - Nunca toca em observacoes, notificarEmail, notificarWhatsapp, faturaUrl.
 */

import { prisma } from "@/lib/prisma";
import { calcularValorCobrado } from "@/lib/billing-calculator";
import {
  deriveConsumoInstantaneo,
  syncGeracaoInversorForBill,
} from "@/lib/geracao-inversor";

export interface PopulateResult {
  billingId: string | null;
  skipped: boolean;
  skipReason?: string;
  valorFatura: number | null;
  valorCompensado: number | null;
  valorCobranca: number | null;
  valorEconomia: number | null;
  dataVencimento: Date | null;
  problemas: string[];
}

/**
 * Calcula data de vencimento da cobrança com base nas regras da UC.
 *
 * - DIA_FIXO_MES: dia `valorVencimento` do mês SEGUINTE ao de referência da bill.
 * - TRES_DIAS_ANTES_VENC: `bill.vencimento` − 3 dias.
 */
function computarVencimento(
  regra: string | null,
  diaFixo: number | null,
  anoRef: number,
  mesRef: number,
  billVencimento: Date | null,
): Date | null {
  if (regra === "DIA_FIXO_MES") {
    if (diaFixo == null || diaFixo < 1 || diaFixo > 31) return null;
    // mês seguinte ao de referência
    const ano = mesRef === 12 ? anoRef + 1 : anoRef;
    const mes = mesRef === 12 ? 1 : mesRef + 1;
    return new Date(ano, mes - 1, diaFixo);
  }
  if (regra === "TRES_DIAS_ANTES_VENC") {
    if (!billVencimento) return null;
    const d = new Date(billVencimento);
    d.setDate(d.getDate() - 3);
    return d;
  }
  return null;
}

export async function populateBillingFromBill(
  billId: string,
): Promise<PopulateResult> {
  const bill = await prisma.consumerBill.findUnique({
    where: { id: billId },
    select: {
      id: true,
      consumerUnitId: true,
      anoReferencia: true,
      mesReferencia: true,
      valorTotal: true,
      vencimento: true,
      injetadaOucTeValor: true,
      injetadaOucTusdValor: true,
      bandeiraValor: true,
      bandeiraAmarelaCreditoValor: true,
      bandeiraVermelhaCreditoValor: true,
      bandeiraVermelha2CreditoValor: true,
      ajusteSaldoCredito: true,
      consumoInstantaneoKwh: true,
      geracaoInversorKwh: true,
      geracaoInversorOrigem: true,
      energiaInjetadaMedidorKwh: true,
      tarifaTE: true,
      tarifaTUSD: true,
      consumerUnit: {
        select: {
          id: true,
          codigoUc: true,
          plantId: true,
          regraRemuneracao: true,
          percentCompensado: true,
          percentBandeira: true,
          regraVencimento: true,
          valorVencimento: true,
          plant: {
            select: {
              numeroUsina: true,
              unidadeConsumidora: true,
              codigoCliente: true,
              regraInstalacao: true,
            },
          },
        },
      },
    },
  });

  if (!bill || !bill.consumerUnitId || !bill.consumerUnit) {
    return {
      billingId: null,
      skipped: true,
      skipReason: "Bill sem ConsumerUnit vinculada",
      valorFatura: null,
      valorCompensado: null,
      valorCobranca: null,
      valorEconomia: null,
      dataVencimento: null,
      problemas: [],
    };
  }

  const uc = bill.consumerUnit;

  // Detecta se é UC geradora com regra DESCONTADO — nesse caso o cálculo
  // da cobrança inclui o consumo instantâneo (energia gerada e consumida
  // na hora, não compensada na fatura).
  const codigosGeradora = new Set(
    [
      uc.plant?.numeroUsina,
      uc.plant?.unidadeConsumidora,
      uc.plant?.codigoCliente,
    ].filter(Boolean) as string[],
  );
  const isGeradoraDescontado =
    !!uc.codigoUc &&
    codigosGeradora.has(uc.codigoUc) &&
    uc.plant?.regraInstalacao === "USINA_CONSUMO_DESCONTADO";

  // Se UC geradora em DESCONTADO, tenta coletar geração do inversor
  // automaticamente (Fronius/Huawei/etc.) e deriva o consumo instantâneo.
  // Valor MANUAL tem precedência — não é sobrescrito.
  let geracaoInversorKwh = bill.geracaoInversorKwh;
  let consumoInstantaneoKwh = bill.consumoInstantaneoKwh;
  if (isGeradoraDescontado) {
    if (bill.geracaoInversorOrigem !== "MANUAL") {
      const syncResult = await syncGeracaoInversorForBill(bill.id).catch(
        () => null,
      );
      if (syncResult?.geracaoInversorKwh != null) {
        geracaoInversorKwh = syncResult.geracaoInversorKwh;
      }
    }
    // Deriva o consumo instantâneo a partir da geração e da injeção no medidor.
    // Se qualquer dos dois falta, mantém o valor atual de consumoInstantaneoKwh
    // (pode ter sido preenchido manualmente direto nesse campo).
    const derivado = deriveConsumoInstantaneo(
      geracaoInversorKwh,
      bill.energiaInjetadaMedidorKwh,
    );
    if (derivado != null) {
      consumoInstantaneoKwh = derivado;
      await prisma.consumerBill.update({
        where: { id: bill.id },
        data: { consumoInstantaneoKwh: derivado },
      });
    }
  }

  const calc = calcularValorCobrado(
    {
      injetadaOucTeValor: bill.injetadaOucTeValor,
      injetadaOucTusdValor: bill.injetadaOucTusdValor,
      bandeiraAmarelaCreditoValor: bill.bandeiraAmarelaCreditoValor,
      bandeiraVermelhaCreditoValor: bill.bandeiraVermelhaCreditoValor,
      bandeiraVermelha2CreditoValor: bill.bandeiraVermelha2CreditoValor,
      ajusteSaldoCredito: bill.ajusteSaldoCredito,
      valorTotal: bill.valorTotal,
      consumoInstantaneoKwh,
      tarifaTE: bill.tarifaTE,
      tarifaTUSD: bill.tarifaTUSD,
    },
    {
      regraRemuneracao: uc.regraRemuneracao,
      percentCompensado: uc.percentCompensado,
      percentBandeira: uc.percentBandeira,
      isGeradoraDescontado,
    },
  );

  // Total compensado pro cliente — soma de tudo que reduz a conta da RGE:
  //   - energia compensada (TE + TUSD)
  //   - ajuste de saldo de crédito
  //   - crédito de bandeira (amarela / vermelha 1 / vermelha 2)
  //   - consumo instantâneo (só UC geradora em DESCONTADO)
  const componentesCompensado = [
    calc.detalhamento.energiaCompensadaValor,
    calc.detalhamento.ajusteSaldoValor,
    calc.detalhamento.bandeiraCreditoValor,
    calc.detalhamento.consumoInstantaneoValor,
  ];
  const valorCompensado = componentesCompensado.some((v) => v != null)
    ? componentesCompensado.reduce<number>((acc, v) => acc + (v ?? 0), 0)
    : null;

  const valorCobranca = calc.valorCobrado;

  // Economia do cliente: o que deixou de pagar vs. cenário "sem solar".
  // - Em PERCENTUAL_SOBRE_COMPENSADO: cliente paga RGE direto + nosso %, então
  //   economia = compensado − nossa cobrança.
  // - Em FAT_UNICA: cobrança inclui valorTotal RGE, então economia =
  //   compensado − (cobrança − valorTotal RGE) = compensado + valorTotal − cobrança.
  //   Equivalente: economia = compensado − nossa parte (excluindo passthrough).
  const valorTotalRGE = calc.detalhamento.valorTotalRGE;
  const valorEconomia =
    valorCompensado != null && valorCobranca != null
      ? valorCompensado - (valorCobranca - (valorTotalRGE ?? 0))
      : null;

  const dataVencimento = computarVencimento(
    uc.regraVencimento,
    uc.valorVencimento,
    bill.anoReferencia,
    bill.mesReferencia,
    bill.vencimento,
  );

  const existing = await prisma.consumerUnitBilling.findUnique({
    where: {
      consumerUnitId_ano_mes: {
        consumerUnitId: bill.consumerUnitId,
        ano: bill.anoReferencia,
        mes: bill.mesReferencia,
      },
    },
    select: { id: true, asaasChargeId: true },
  });

  if (existing?.asaasChargeId) {
    return {
      billingId: existing.id,
      skipped: true,
      skipReason: "Cobrança já enviada ao Asaas — valores preservados",
      valorFatura: bill.valorTotal,
      valorCompensado,
      valorCobranca,
      valorEconomia,
      dataVencimento,
      problemas: calc.problemas,
    };
  }

  const data = {
    valorFatura: bill.valorTotal,
    valorCompensado,
    valorCobranca,
    valorEconomia,
    dataVencimento,
    // Reset da validação do demonstrativo se os valores foram recalculados.
    // Quando a cobrança já foi emitida (asaasChargeId), o branch acima já saiu
    // com skipped — não chegamos aqui. Logo, é seguro zerar.
    demonstrativoValidadoEm: null,
    demonstrativoValidadoPor: null,
  };

  const billing = existing
    ? await prisma.consumerUnitBilling.update({
        where: { id: existing.id },
        data,
      })
    : await prisma.consumerUnitBilling.create({
        data: {
          consumerUnitId: bill.consumerUnitId,
          ano: bill.anoReferencia,
          mes: bill.mesReferencia,
          ...data,
        },
      });

  return {
    billingId: billing.id,
    skipped: false,
    valorFatura: bill.valorTotal,
    valorCompensado,
    valorCobranca,
    valorEconomia,
    dataVencimento,
    problemas: calc.problemas,
  };
}

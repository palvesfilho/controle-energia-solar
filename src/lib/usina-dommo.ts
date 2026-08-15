/**
 * Regime "USINA DOMMO SOLUÇÕES" — regra ÚNICA de identificação.
 *
 * São as usinas em que a Dommo Soluções (a gestora, empresa do Paulo) fica com
 * **100% do lucro da operação**. Nelas o contrato de investidor não se aplica:
 *
 *   - NÃO paga gestão fixa (`InvestorPlant.gestaoFixaContrato`)
 *   - NÃO tem R$/kWh de contrato (`InvestorPlant.valorKwhContrato`)
 *   - A remuneração é, nas palavras do Paulo (15/08/2026):
 *       valor total do kWh compensado NO PREÇO VIGENTE
 *       − valor total do desconto dado ao cliente final NO PREÇO VIGENTE
 *
 * A fórmula está em `calcularRemuneracaoDommo()`, no fim deste arquivo.
 *
 * ⛔ **Nada de R$ 0,00 calado.** Quando falta dado para apurar (tarifa podre
 * barrada pela faixa de `preco-kwh.ts`, UC sem desconto cadastrado, fatura sem
 * linhas oUC), a apuração devolve `null` e a payable **não é criada**, com o
 * motivo no resultado do sync. Zero gravado passaria por "mês sem compensação".
 *
 * 🎛 **O operador escolhe; o CNPJ só confere.** A verdade é o campo
 * `InvestorPlant.isUsinaDommo`, marcado por quem cadastra. O casamento de CNPJ
 * serve para PRÉ-MARCAR na tela e para avisar quando os dois discordam — nunca
 * para decidir sozinho. Um investidor pode ter o CNPJ da Dommo num vínculo que
 * não segue este regime, e vice-versa.
 */

import { calcularValorCobrado } from "@/lib/billing-calculator";

/** CNPJ da Dommo Soluções, só dígitos. */
export const CNPJ_DOMMO_SOLUCOES = "57485803000109";

/** Como o CNPJ aparece na tela. */
export const CNPJ_DOMMO_SOLUCOES_FORMATADO = "57.485.803/0001-09";

export const NOME_REGIME_DOMMO = "Usina Dommo Soluções";

/**
 * Motivo exibido quando falta o dado de cadastro para calcular a Dommo.
 * Texto único — as bordas repetem o mesmo, senão o operador vê explicações
 * diferentes para a mesma pendência.
 */
/**
 * Nota de contexto na tela de faturamento. Não é aviso de erro: explica por que
 * "Gestão de energia" aparece vazia e de onde sai o valor bruto neste regime.
 */
export const NOTA_REGIME_DOMMO =
  `${NOME_REGIME_DOMMO}: a gestora fica com 100% do lucro. Não há gestão fixa ` +
  `nem R$/kWh de contrato — a remuneração é o valor cheio (instantâneo + ` +
  `compensado + bandeiras) menos o desconto dado ao cliente. O cap de injeção ` +
  `não se aplica.`;

export const MOTIVO_SEM_DESCONTO_CADASTRADO =
  `${NOME_REGIME_DOMMO}: a UC não tem "Desconto de Contrato" (percentCompensado) ` +
  `cadastrado, e a remuneração é o valor cheio MENOS esse desconto — sem ele não ` +
  `há como calcular. Preencha o desconto no cadastro da UC.`;

/** Deixa só os dígitos. Aceita null/undefined para não obrigar guarda no caller. */
export function normalizarCnpj(valor: string | null | undefined): string {
  return (valor ?? "").replace(/\D/g, "");
}

/**
 * `true` quando o investidor é a própria Dommo Soluções pelo CNPJ.
 *
 * Olha `cnpj` e também `document` — o campo legado onde CNPJ de investidor
 * antigo foi digitado antes de `cnpj` existir (ver comentário no schema).
 */
export function isInvestidorDommo(
  investor: { cnpj?: string | null; document?: string | null } | null | undefined,
): boolean {
  if (!investor) return false;
  return (
    normalizarCnpj(investor.cnpj) === CNPJ_DOMMO_SOLUCOES ||
    normalizarCnpj(investor.document) === CNPJ_DOMMO_SOLUCOES
  );
}

/**
 * Divergência entre o que o operador marcou e o que o CNPJ diz.
 * Devolve o aviso pronto, ou `null` quando os dois concordam.
 *
 * Não é erro — é aviso. Marcar o regime numa usina cujo investidor NÃO é a
 * Dommo é legítimo (ex.: CNPJ ainda não cadastrado), e o contrário também.
 */
export function avisoDivergenciaDommo(
  isUsinaDommo: boolean,
  investor: { cnpj?: string | null; document?: string | null } | null | undefined,
): string | null {
  const cnpjEhDommo = isInvestidorDommo(investor);
  if (isUsinaDommo === cnpjEhDommo) return null;
  return cnpjEhDommo
    ? `O investidor tem o CNPJ da Dommo Soluções (${CNPJ_DOMMO_SOLUCOES_FORMATADO}), ` +
        `mas o vínculo NÃO está marcado como ${NOME_REGIME_DOMMO}.`
    : `O vínculo está marcado como ${NOME_REGIME_DOMMO}, mas o CNPJ do investidor ` +
        `não é o da Dommo (${CNPJ_DOMMO_SOLUCOES_FORMATADO}).`;
}

// ---------------------------------------------------------------------------
// A FÓRMULA
// ---------------------------------------------------------------------------

/**
 * Remuneração da Dommo numa UC, num mês. Definida pelo Paulo em 15/08/2026:
 *
 *   valor cheio do INSTANTÂNEO (TE+TUSD)      − desconto ao cliente
 * + valor cheio do COMPENSADO (TE+TUSD)       − desconto ao cliente
 * + valor cheio do compensado em BENEFICIÁRIA − desconto ao cliente
 * + valor cheio das BANDEIRAS aplicadas       − desconto em bandeira, se houver
 *
 * 🔑 **"valor cheio − desconto" já é uma multiplicação que o sistema faz.**
 * `ConsumerUnit.percentCompensado` guarda a fração COBRADA (0,80 = cliente paga
 * 80%, desconto de 20%), então `cheio − desconto = cheio × percentCompensado`.
 * Idem para bandeira com `percentBandeira`. Por isso esta função não recalcula
 * nada: ela SOMA as parcelas que `calcularValorCobrado` já devolve no
 * `detalhamento`, que é a mesma conta feita para cobrar o cliente.
 *
 * 🔑 **A linha das beneficiárias não é um termo separado no código.** Cada UC do
 * rateio tem sua própria ConsumerBill e gera sua própria payable; a soma das
 * payables da usina é que forma o total. Titular e beneficiárias entram pelo
 * mesmo caminho — o 3º termo do Paulo é o 2º aplicado às outras UCs.
 *
 * ⛔ **O `valorTotal` da RGE fica de fora.** Em regras FAT_UNICA ele entra na
 * COBRANÇA do cliente como repasse (a gente cobra a conta inteira e paga a
 * concessionária). Repasse não é lucro; somá-lo aqui inflaria a remuneração
 * pelo valor da conta de luz.
 */
export interface RemuneracaoDommoResultado {
  /** Soma das parcelas. `null` quando não deu para calcular. */
  valor: number | null;
  parcelas: {
    instantaneo: number | null;
    compensado: number | null;
    bandeira: number | null;
  };
  /** Problemas que o operador precisa ver (tarifa podre, desconto ausente…). */
  avisos: string[];
}

/**
 * @param detalhamento  o `detalhamento` devolvido por `calcularValorCobrado`
 * @param problemas     o `problemas` da mesma chamada (repassado como aviso)
 */
export function calcularRemuneracaoDommo(
  detalhamento: {
    parcelaInstantaneo: number | null;
    parcelaEnergia: number | null;
    parcelaBandeira: number | null;
    descontoContrato: number | null;
  },
  problemas: string[] = [],
): RemuneracaoDommoResultado {
  const avisos = [...problemas];

  // Sem o desconto cadastrado, `parcelaEnergia` vem null e a conta não existe —
  // não devolvemos 0, que passaria por "mês sem compensação".
  if (detalhamento.descontoContrato == null) {
    avisos.push(MOTIVO_SEM_DESCONTO_CADASTRADO);
    return {
      valor: null,
      parcelas: { instantaneo: null, compensado: null, bandeira: null },
      avisos,
    };
  }

  const instantaneo = detalhamento.parcelaInstantaneo;
  const compensado = detalhamento.parcelaEnergia;
  const bandeira = detalhamento.parcelaBandeira;

  // A parcela de energia é a espinha: sem ela não há remuneração a apurar.
  // Instantâneo e bandeira são "quando houver" — null vira 0 na soma.
  if (compensado == null) {
    avisos.push(
      `${NOME_REGIME_DOMMO}: fatura sem o valor da energia compensada (linhas oUC) ` +
        `— não dá para apurar a remuneração deste mês.`,
    );
    return {
      valor: null,
      parcelas: { instantaneo, compensado: null, bandeira },
      avisos,
    };
  }

  return {
    valor: (instantaneo ?? 0) + compensado + (bandeira ?? 0),
    parcelas: { instantaneo, compensado, bandeira },
    avisos,
  };
}

/**
 * Campos da ConsumerBill que a apuração Dommo precisa. Exportado como constante
 * para que os dois chamadores (gravação da payable e tela de faturamento) não
 * possam divergir: um `select` incompleto faria a mesma fatura render valores
 * diferentes em cada tela, sem erro nenhum.
 */
export const SELECT_BILL_DOMMO = {
  injetadaOucTeValor: true,
  injetadaOucTusdValor: true,
  bandeiraAmarelaCreditoValor: true,
  bandeiraVermelhaCreditoValor: true,
  bandeiraVermelha2CreditoValor: true,
  ajusteSaldoCredito: true,
  valorTotal: true,
  consumoInstantaneoKwh: true,
  tarifaTE: true,
  tarifaTUSD: true,
  tarifaTeComTributos: true,
  tarifaTusdComTributos: true,
  consumoTeForaPontaKwh: true,
  consumoTeForaPontaValor: true,
  consumoTusdForaPontaKwh: true,
  consumoTusdForaPontaValor: true,
  tarifaTeForaPonta: true,
  tarifaTusdForaPonta: true,
  energiaInjetadaPropriaTeValor: true,
  energiaInjetadaPropriaTusdValor: true,
  consumerUnit: {
    select: {
      codigoUc: true,
      nome: true,
      regraRemuneracao: true,
      percentCompensado: true,
      percentBandeira: true,
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
} as const;

export interface BillParaDommo {
  injetadaOucTeValor: number | null;
  injetadaOucTusdValor: number | null;
  bandeiraAmarelaCreditoValor: number | null;
  bandeiraVermelhaCreditoValor: number | null;
  bandeiraVermelha2CreditoValor: number | null;
  ajusteSaldoCredito: number | null;
  valorTotal: number | null;
  consumoInstantaneoKwh: number | null;
  tarifaTE: number | null;
  tarifaTUSD: number | null;
  tarifaTeComTributos: number | null;
  tarifaTusdComTributos: number | null;
  consumoTeForaPontaKwh: number | null;
  consumoTeForaPontaValor: number | null;
  consumoTusdForaPontaKwh: number | null;
  consumoTusdForaPontaValor: number | null;
  tarifaTeForaPonta: number | null;
  tarifaTusdForaPonta: number | null;
  energiaInjetadaPropriaTeValor: number | null;
  energiaInjetadaPropriaTusdValor: number | null;
  consumerUnit: {
    codigoUc: string;
    nome: string | null;
    regraRemuneracao: string | null;
    percentCompensado: number | null;
    percentBandeira: number | null;
    plant: {
      numeroUsina: string | null;
      unidadeConsumidora: string | null;
      codigoCliente: string | null;
      regraInstalacao: string | null;
    } | null;
  } | null;
}

/**
 * Apura a remuneração Dommo de uma ConsumerBill.
 *
 * Roda `calcularValorCobrado` — a MESMA função que apura o que o cliente paga —
 * e soma as parcelas do `detalhamento`. Não reimplementa a conta: no regime
 * Dommo a remuneração É a receita.
 *
 * Usada tanto na gravação da payable quanto na tela de faturamento, que
 * precisa saber POR QUE uma UC não gerou parcela.
 */
export function apurarRemuneracaoDommo(
  bill: BillParaDommo,
): RemuneracaoDommoResultado {
  const uc = bill.consumerUnit;
  if (!uc) {
    return {
      valor: null,
      parcelas: { instantaneo: null, compensado: null, bandeira: null },
      avisos: ["Fatura sem UC vinculada — regime Dommo não pôde apurar"],
    };
  }

  // Mesma derivação de billing-populate: UC geradora + plant em DESCONTADO.
  // `isGeradoraDescontado` é DERIVADO, não existe coluna.
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

  const calc = calcularValorCobrado(
    {
      injetadaOucTeValor: bill.injetadaOucTeValor,
      injetadaOucTusdValor: bill.injetadaOucTusdValor,
      bandeiraAmarelaCreditoValor: bill.bandeiraAmarelaCreditoValor,
      bandeiraVermelhaCreditoValor: bill.bandeiraVermelhaCreditoValor,
      bandeiraVermelha2CreditoValor: bill.bandeiraVermelha2CreditoValor,
      ajusteSaldoCredito: bill.ajusteSaldoCredito,
      valorTotal: bill.valorTotal,
      consumoInstantaneoKwh: bill.consumoInstantaneoKwh,
      tarifaTE: bill.tarifaTE,
      tarifaTUSD: bill.tarifaTUSD,
      tarifaTeComTributos: bill.tarifaTeComTributos,
      tarifaTusdComTributos: bill.tarifaTusdComTributos,
      consumoTeForaPontaKwh: bill.consumoTeForaPontaKwh,
      consumoTeForaPontaValor: bill.consumoTeForaPontaValor,
      consumoTusdForaPontaKwh: bill.consumoTusdForaPontaKwh,
      consumoTusdForaPontaValor: bill.consumoTusdForaPontaValor,
      tarifaTeForaPonta: bill.tarifaTeForaPonta,
      tarifaTusdForaPonta: bill.tarifaTusdForaPonta,
      energiaInjetadaPropriaTeValor: bill.energiaInjetadaPropriaTeValor,
      energiaInjetadaPropriaTusdValor: bill.energiaInjetadaPropriaTusdValor,
    },
    {
      regraRemuneracao: uc.regraRemuneracao,
      percentCompensado: uc.percentCompensado,
      percentBandeira: uc.percentBandeira,
      isGeradoraDescontado,
    },
  );

  return calcularRemuneracaoDommo(calc.detalhamento, calc.problemas);
}

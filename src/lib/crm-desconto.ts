/**
 * A ponte entre o desconto COMBINADO na proposta e o que o Gestor cobra.
 *
 * Os dois lados falam em percentual e querem dizer o oposto um do outro:
 *
 *   CRM / proposta   `desconto = 15`            -> 15% de desconto
 *   Gestor / UC      `percentCompensado = 0,85` -> cobra 85% (= 15% off)
 *
 * Trocar um pelo outro por engano cobraria 15% em vez de 85% — a conta ficaria
 * cinco vezes menor e ninguem estranharia o formato. Por isso a conversao mora
 * aqui, sozinha, e nao espalhada por tela e rota.
 *
 * Sobre o QUE o desconto incide continua sendo regra do
 * `billing-calculator.ts`: a energia COMPENSADA da fatura, nao o valor total.
 * A proposta calcula a economia do cliente sobre `consumo x (TE + TUSD)`, que
 * e a mesma parcela de energia — as duas contas batem.
 */

/** Faixa aceita para um desconto vindo do CRM. */
const DESCONTO_MIN = 0;
const DESCONTO_MAX = 100;

/**
 * Desconto (15) -> fracao COBRADA no banco (0,85), do jeito que
 * `ConsumerUnit.percentCompensado` guarda.
 *
 * Null entra, null sai: sem desconto na proposta, o cadastro fica em branco e
 * o operador decide. Ver [[feedback_nao_estimar_realidade_do_cliente]].
 */
export function descontoParaPercentCobrado(desconto: number | null | undefined): number | null {
  if (desconto == null || !Number.isFinite(desconto)) return null;
  if (desconto < DESCONTO_MIN || desconto > DESCONTO_MAX) return null;
  // 2 casas no percentual = 4 na fracao; evita 0,8500000000000001.
  return Number(((100 - desconto) / 100).toFixed(4));
}

/**
 * Desconto (15) -> valor do FORMULARIO da UC, que trabalha em inteiro
 * percentual (85). A conversao para decimal acontece depois, no submit do
 * form — ver [[project_percent_uc_convencao]].
 */
export function descontoParaInputPercentCobrado(desconto: number | null | undefined): string {
  const fracao = descontoParaPercentCobrado(desconto);
  return fracao == null ? "" : String(Number((fracao * 100).toFixed(2)));
}

/**
 * Caminho inverso: fracao cobrada gravada na UC (0,85) -> desconto (15).
 * Serve para conferir o cadastro contra o que a proposta combinou.
 */
export function percentCobradoParaDesconto(percentCompensado: number | null | undefined): number | null {
  if (percentCompensado == null || !Number.isFinite(percentCompensado)) return null;
  return Number(((1 - percentCompensado) * 100).toFixed(2));
}

/** Resultado da conferencia entre a proposta e o que esta cadastrado na UC. */
export interface ConferenciaDesconto {
  /** Desconto combinado na proposta, em percentual (15). */
  descontoProposta: number | null;
  /** Desconto que o cadastro da UC pratica hoje, em percentual. */
  descontoCadastrado: number | null;
  /** UC ainda sem "Desconto de Contrato" — nao gera cobranca nenhuma. */
  semCadastro: boolean;
  /** Cadastro existe mas diverge da proposta. */
  divergente: boolean;
}

/**
 * Compara o combinado com o cadastrado.
 *
 * Tolerancia de 0,01 ponto percentual: o banco guarda fracao com 4 casas, e
 * 0,8499999 nao e divergencia, e ruido de ponto flutuante.
 */
export function conferirDesconto(
  descontoProposta: number | null | undefined,
  percentCompensado: number | null | undefined,
): ConferenciaDesconto {
  const daProposta = descontoProposta ?? null;
  const cadastrado = percentCobradoParaDesconto(percentCompensado);
  const semCadastro = percentCompensado == null;
  const divergente =
    daProposta != null && cadastrado != null && Math.abs(daProposta - cadastrado) > 0.01;
  return { descontoProposta: daProposta, descontoCadastrado: cadastrado, semCadastro, divergente };
}

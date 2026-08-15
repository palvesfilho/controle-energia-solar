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
 * 🚧 **O CÁLCULO AINDA NÃO ESTÁ IMPLEMENTADO.** A fórmula está em definição
 * (as usinas do Paulo começam a rodar por volta de setembro/2026). O que existe
 * hoje é só a MARCAÇÃO — e, deliberadamente, todo caminho que produziria
 * dinheiro para uma usina marcada **recusa em voz alta** em vez de cair calado
 * na fórmula antiga e pagar R$ 0. Ver `MOTIVO_REGRA_NAO_IMPLEMENTADA`.
 *
 * 🎛 **O operador escolhe; o CNPJ só confere.** A verdade é o campo
 * `InvestorPlant.isUsinaDommo`, marcado por quem cadastra. O casamento de CNPJ
 * serve para PRÉ-MARCAR na tela e para avisar quando os dois discordam — nunca
 * para decidir sozinho. Um investidor pode ter o CNPJ da Dommo num vínculo que
 * não segue este regime, e vice-versa.
 */

/** CNPJ da Dommo Soluções, só dígitos. */
export const CNPJ_DOMMO_SOLUCOES = "57485803000109";

/** Como o CNPJ aparece na tela. */
export const CNPJ_DOMMO_SOLUCOES_FORMATADO = "57.485.803/0001-09";

export const NOME_REGIME_DOMMO = "Usina Dommo Soluções";

/**
 * Motivo exibido quando algo tentaria calcular dinheiro para uma usina Dommo.
 * Texto único — as três bordas (payables, relatório, fechamento) repetem o
 * mesmo, senão o operador vê explicações diferentes para a mesma pendência.
 */
export const MOTIVO_REGRA_NAO_IMPLEMENTADA =
  `${NOME_REGIME_DOMMO}: a gestora fica com 100% do lucro, então não há gestão ` +
  `fixa nem R$/kWh de contrato. A fórmula própria (kWh compensado no preço ` +
  `vigente − desconto do cliente) ainda NÃO está implementada — nenhum valor é ` +
  `gerado para não sair errado.`;

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

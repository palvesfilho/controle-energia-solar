/**
 * Em qual módulo do AURA cada venda do CRM deve aparecer.
 *
 * Divisão fechada com o Paulo em 15/08/2026:
 *   - Associação de Energia recebe APENAS as adesões assinadas de desconto
 *     na fatura;
 *   - obra (inspeção, fotovoltaica, piso aquecido…) e plano de monitoramento
 *     vão para a Gestão de Clientes da rede Brasil Solar.
 *
 * REGRA ÚNICA: quem precisar saber o módulo de uma linha chama daqui. Se esta
 * função e a tela discordarem, a linha aparece no lugar errado sem ninguém
 * perceber — é o tipo de meia-correção que falha calada
 * ([[feedback_correcao_pela_metade_falha_calada]]).
 *
 * Uma venda pode legitimamente cair nos DOIS. `desconto_fatura_telhado` é o
 * caso: o cliente cede o telhado, então vira usina + UC para a Associação
 * cadastrar E gera obra de instalação para a Brasil Solar executar. São duas
 * tarefas distintas da mesma venda, não duplicação.
 */

export type ModuloCrm = "assoc" | "bs";

/** O que a função precisa saber de uma linha do de-para. */
export interface RegraDeParaMinima {
  geraObra: boolean;
  destinoGestao: string;
  ativo: boolean;
}

/**
 * Módulos onde a linha deve aparecer.
 *
 * Lista vazia = a linha não é trabalho de ninguém (produto ignorado, tipo
 * `cotacao_seguro`). Os dois = tarefa em cada módulo.
 *
 * `regra` nula significa produto do CRM sem de-para: cai nos DOIS de propósito.
 * Ele ainda não tem destino, então esconder de um lado faria o produto novo
 * ficar invisível para metade da operação — o oposto do que a caixa
 * "Produto sem de-para" existe para evitar.
 *
 * Repare que usa `regra.geraObra` (a intenção do de-para) e NÃO o `geraObra`
 * calculado no sync, que é falso para adesão assinada sem venda ganha. Fosse
 * pelo calculado, uma adesão assinada de produto de obra não apareceria em
 * módulo nenhum.
 */
export function modulosDaVenda(regra: RegraDeParaMinima | null | undefined): ModuloCrm[] {
  if (!regra) return ["assoc", "bs"];
  if (!regra.ativo) return [];

  const modulos: ModuloCrm[] = [];

  // Associação: as adesões de desconto na fatura. USINA_UC é a adesão em que o
  // cliente também cede o telhado — continua sendo desconto na fatura.
  if (regra.destinoGestao === "ADESAO" || regra.destinoGestao === "USINA_UC") {
    modulos.push("assoc");
  }

  // Brasil Solar: obra e plano de monitoramento.
  if (regra.geraObra || regra.destinoGestao === "MONITORAMENTO") {
    modulos.push("bs");
  }

  return modulos;
}

/** Atalho para filtrar uma lista já cruzada com o de-para. */
export function pertenceAoModulo(
  regra: RegraDeParaMinima | null | undefined,
  modulo: ModuloCrm,
): boolean {
  return modulosDaVenda(regra).includes(modulo);
}

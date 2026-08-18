/**
 * Rótulos e descrições dos gatilhos de Ativação — a metade CLIENT-SAFE.
 *
 * Existe separado de `mensagens-gatilhos.ts` porque aquele importa o Prisma: a
 * tela de ativações precisa do texto "o que este gatilho observa", e importar o
 * avaliador junto arrastaria o cliente de banco para dentro do bundle do
 * navegador. Aqui não há nada além de texto.
 */

export type TipoGatilho = "ALERTA_USINA" | "AGENDA_MENSAL" | "ANIVERSARIO_SISTEMA";

/**
 * Tipos de alerta na linguagem do CLIENTE, não na do sistema.
 *
 * OFFLINE é o que o Paulo chama de "sistema desconectado do wi-fi": a detecção
 * é `ultimaLeitura` parada há mais de 48 h, e na prática quase sempre é o
 * datalogger sem rede — a usina continua gerando. Ver
 * [[project_growatt_zero_kwh_datalogger_mudo]].
 */
export const ROTULO_ALERTA: Record<string, string> = {
  OFFLINE: "Usina sem comunicação (wi-fi / datalogger)",
  BAIXA_GERACAO: "Gerando abaixo do esperado",
  TENSAO_FORA: "Tensão da rede fora da faixa",
  TEMPERATURA_INVERSOR: "Inversor quente demais",
  FREQUENCIA_REDE: "Frequência da rede fora da faixa",
  CONTRATO_PROXIMO_VENCIMENTO: "Contrato perto de vencer",
  CONTRATO_VENCIDO: "Contrato vencido",
};

export const DESCRICAO_GATILHO: Record<TipoGatilho, { nome: string; descricao: string }> = {
  ALERTA_USINA: {
    nome: "Alerta na usina do cliente",
    descricao:
      "Dispara quando abre um alerta do tipo escolhido na usina do cliente — sem comunicação, gerando abaixo do esperado, inversor quente. Usa os mesmos alertas e thresholds que o time vê na tela.",
  },
  AGENDA_MENSAL: {
    nome: "Todo mês, em dia fixo",
    descricao:
      "Dispara todo mês no dia escolhido, para todo cliente com usina ativa. É o aviso de que o relatório do mês fechou.",
  },
  ANIVERSARIO_SISTEMA: {
    nome: "Sistema completou X meses",
    descricao:
      "Dispara quando a usina do cliente completa o tempo escolhido de instalada. É o gancho de limpeza e revisão periódica.",
  },
};

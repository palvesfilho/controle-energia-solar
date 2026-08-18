/**
 * Ativações prontas — a divisão 2 saindo da caixa já configurada.
 *
 * Todas nascem DESLIGADAS. O modelo preenche gatilho, texto e cooldown; ligar
 * continua sendo ato explícito de gente, porque a partir dali a mensagem sai
 * sozinha.
 *
 * O texto muda de tom em relação às campanhas: aqui a empresa está avisando de
 * um problema no sistema do cliente, não oferecendo serviço. Quem escreve isso
 * como venda queima a confiança do canal — o pedido de orçamento vem depois, no
 * telefone, quando o cliente já entendeu que alguém está de olho na usina dele.
 */
import type { TipoGatilho } from "@/lib/mensagens-gatilhos-rotulos";

export interface ModeloAtivacao {
  id: string;
  nome: string;
  gatilho: TipoGatilho;
  params: Record<string, unknown>;
  titulo: string;
  mensagem: string;
  ctaLabel: string | null;
  cooldownDias: number;
  /** Por que este gatilho e este cooldown. Aparece na tela ao escolher. */
  porQue: string;
}

export const MODELOS_ATIVACAO: ModeloAtivacao[] = [
  {
    id: "wifi-caiu",
    nome: "Usina sem comunicação — avisar o cliente",
    gatilho: "ALERTA_USINA",
    params: { tipos: ["OFFLINE"] },
    titulo: "Perdemos o sinal da sua usina",
    mensagem:
      "Sua usina parou de enviar dados para o monitoramento. Na maioria das vezes é o wi-fi que caiu, e a energia continua sendo gerada normalmente. Podemos ajudar a reconectar.",
    ctaLabel: "Quero ajuda para reconectar",
    cooldownDias: 30,
    porQue:
      "O alerta OFFLINE nasce com a leitura parada há mais de 48 h — quase sempre datalogger sem rede, não usina parada. Cooldown de 30 dias porque o problema pode durar semanas e o aviso não pode virar diário.",
  },
  {
    id: "gerando-abaixo",
    nome: "Gerando abaixo do esperado",
    gatilho: "ALERTA_USINA",
    params: { tipos: ["BAIXA_GERACAO"], severidades: ["CRITICA"] },
    titulo: "Sua usina está gerando menos",
    mensagem:
      "A geração da sua usina caiu bastante em relação ao esperado. Pode ser sujeira nos módulos, sombra nova ou algo no inversor — vale uma olhada da nossa equipe.",
    ctaLabel: "Quero uma verificação",
    cooldownDias: 45,
    porQue:
      "Só severidade CRÍTICA: a MÉDIA acende com variação normal de clima e o cliente receberia aviso em todo mês nublado. Cooldown longo — a causa costuma levar semanas para ser resolvida.",
  },
  {
    id: "inversor-quente",
    nome: "Inversor com temperatura alta",
    gatilho: "ALERTA_USINA",
    params: { tipos: ["TEMPERATURA_INVERSOR"] },
    titulo: "Seu inversor está esquentando",
    mensagem:
      "Registramos temperatura alta no seu inversor. Isso reduz a geração e, se persistir, encurta a vida do equipamento. Normalmente é ventilação ou sujeira no local.",
    ctaLabel: "Quero que verifiquem",
    cooldownDias: 30,
    porQue:
      "Inversor acima de 65 °C derrata (reduz potência) e acima de 75 °C desliga. É o alerta que mais vira visita técnica paga.",
  },
  {
    id: "relatorio-mensal",
    nome: "Relatório do mês está pronto",
    gatilho: "AGENDA_MENSAL",
    params: { diaDoMes: 5 },
    titulo: "Seu relatório do mês está pronto",
    mensagem:
      "Fechamos o mês da sua usina. Veja quanto você gerou, quanto economizou e como foi o desempenho em relação ao esperado.",
    ctaLabel: null,
    cooldownDias: 25,
    porQue:
      "Dia 5 dá folga para o fechamento do mês anterior. Sem botão de interesse de propósito: é serviço, não oferta — e é o aviso que traz o cliente para dentro do app todo mês, que é o que faz as campanhas da divisão 1 alcançarem alguém.",
  },
  {
    id: "limpeza-6-meses",
    nome: "6 meses de instalado — limpeza",
    gatilho: "ANIVERSARIO_SISTEMA",
    params: { meses: 6 },
    titulo: "Sua usina faz 6 meses",
    mensagem:
      "Sua usina completou 6 meses. É o intervalo em que a sujeira nos módulos já começa a aparecer na geração — a limpeza devolve o que se perde.",
    ctaLabel: "Quero agendar a limpeza",
    cooldownDias: 150,
    porQue:
      "Janela de 7 dias em torno do aniversário. Cooldown de 150 dias para a regra poder reencontrar o mesmo cliente no próximo semestre, e não antes.",
  },
  {
    id: "revisao-12-meses",
    nome: "1 ano de instalado — revisão",
    gatilho: "ANIVERSARIO_SISTEMA",
    params: { meses: 12 },
    titulo: "Sua usina completou 1 ano",
    mensagem:
      "Um ano de geração. É quando os fabricantes recomendam a revisão preventiva: conexões, estrutura e inversor — o que evita a parada que ninguém avisa.",
    ctaLabel: "Quero a revisão",
    cooldownDias: 300,
    porQue: "Marco redondo, fácil de aceitar, e é o intervalo de revisão dos fabricantes de inversor.",
  },
];

export function buscarModeloAtivacao(id: string): ModeloAtivacao | undefined {
  return MODELOS_ATIVACAO.find((m) => m.id === id);
}

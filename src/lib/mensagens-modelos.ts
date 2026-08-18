/**
 * Catálogo de campanhas prontas do módulo MENSAGENS.
 *
 * Cada modelo já vem com público sugerido — é o que separa esta ferramenta de
 * um "enviar aviso para todo mundo". A oferta de limpeza faz sentido para quem
 * tem telhado sujo há seis meses; a de reconexão de wi-fi, para quem está sem
 * leitura. Mandar as duas para a base inteira queima a lista e ensina o cliente
 * a ignorar notificação.
 *
 * Fica em código, e não em banco, porque é conteúdo versionado: o texto que
 * converte é resultado de teste, e vale poder ver no histórico o que mudou. O
 * operador sempre pode editar antes de enviar — o modelo preenche o formulário,
 * não amarra.
 *
 * ⚠️ Limites do celular (aplicados também no schema da API): título vira
 * reticências perto de 50 caracteres no Android, e o corpo mostra ~2 linhas
 * fechado. Texto que só aparece ao expandir a notificação não é lido.
 */
import type { FiltroPublico } from "@/lib/mensagens-publico";

export interface ModeloCampanha {
  id: string;
  categoria: "Serviços" | "Receita recorrente" | "Relacionamento" | "Operação";
  nome: string;
  titulo: string;
  mensagem: string;
  ctaLabel: string | null;
  /** Público sugerido — o operador vê o recorte já marcado e pode mexer. */
  filtro: FiltroPublico;
  /** Por que este público, em uma linha. Aparece na tela ao escolher. */
  porQue: string;
}

export const MODELOS_CAMPANHA: ModeloCampanha[] = [
  {
    id: "limpeza-semestral",
    categoria: "Serviços",
    nome: "Limpeza semestral de módulos",
    titulo: "Sua usina pode gerar mais",
    mensagem:
      "Módulo sujo perde até 20% de geração. Agende a limpeza da sua usina com a equipe da Brasil Solar e volte ao máximo de produção.",
    ctaLabel: "Quero agendar",
    filtro: { idadeMesesMin: 6 },
    porQue: "Sistema com 6+ meses de instalação — já acumulou sujeira suficiente para a perda aparecer na conta.",
  },
  {
    id: "reconexao-wifi",
    categoria: "Operação",
    nome: "Reconexão de wi-fi (usina muda)",
    titulo: "Perdemos o sinal da sua usina",
    mensagem:
      "Sua usina parou de enviar dados — normalmente é o wi-fi que caiu, e a energia continua sendo gerada. Podemos reconectar para você voltar a acompanhar tudo pelo app.",
    ctaLabel: "Quero reconectar",
    filtro: { semLeituraDias: 5 },
    porQue:
      "Usina sem leitura há 5 dias. Quase sempre é datalogger mudo, não usina parada — e o cliente não sabe que está no escuro.",
  },
  {
    id: "manutencao-preventiva",
    categoria: "Serviços",
    nome: "Manutenção preventiva anual",
    titulo: "Revisão anual da sua usina",
    mensagem:
      "Faz mais de um ano que sua usina foi instalada. A revisão preventiva checa conexões, estrutura e inversor — e evita a parada que ninguém avisa.",
    ctaLabel: "Quero a revisão",
    filtro: { idadeMesesMin: 12 },
    porQue: "Sistema com 12+ meses. É o intervalo de revisão recomendado pelos fabricantes de inversor.",
  },
  {
    id: "seguro-usina",
    categoria: "Receita recorrente",
    nome: "Seguro da usina",
    titulo: "Sua usina está protegida?",
    mensagem:
      "Granizo, vendaval e furto não avisam. O seguro da usina cobre o equipamento e a geração que você deixaria de ter. Fale com a gente e receba a cotação.",
    ctaLabel: "Quero a cotação",
    filtro: {},
    porQue: "Vale para toda a base — mas comece pelos sistemas maiores, onde o prejuízo de uma perda é maior.",
  },
  {
    id: "garantia-vencendo",
    categoria: "Receita recorrente",
    nome: "Garantia vencendo — extensão",
    titulo: "Sua garantia está acabando",
    mensagem:
      "A garantia do seu sistema vence nos próximos meses. Dá para estender a cobertura do inversor antes do prazo acabar — depois, não dá mais.",
    ctaLabel: "Quero estender",
    filtro: { garantiaVenceEmDias: 90 },
    porQue: "Garantia terminando em 90 dias. Depois do vencimento a extensão deixa de ser possível — a janela é curta e é a que converte.",
  },
  {
    id: "instale-o-app",
    categoria: "Relacionamento",
    nome: "Instale o app (base sem push)",
    titulo: "Acompanhe sua usina pelo celular",
    mensagem:
      "Instale o Portal do Cliente na tela de início e veja a geração da sua usina todo dia, direto no celular.",
    ctaLabel: null,
    filtro: { somenteSemApp: true, acessoPortal: "ATIVO" },
    porQue:
      "Cliente com portal ativo que ainda não autorizou avisos. É a campanha que constrói o canal — sem base com app, nenhuma outra campanha alcança ninguém.",
  },
  {
    id: "indique-um-amigo",
    categoria: "Relacionamento",
    nome: "Indique um amigo",
    titulo: "Indique e ganhe",
    mensagem:
      "Conhece alguém que ainda paga conta de luz cheia? Indique para a Brasil Solar — se fechar, você ganha um bônus.",
    ctaLabel: "Quero indicar",
    filtro: { somenteComApp: true },
    porQue: "Cliente com app é cliente engajado — é dele que sai indicação boa.",
  },
  {
    id: "monitoramento-pago",
    categoria: "Receita recorrente",
    nome: "Plano de monitoramento",
    titulo: "Acompanhe tudo da sua usina",
    mensagem:
      "Com o plano completo você vê geração diária, economia acumulada e recebe aviso quando algo sai do normal na sua usina.",
    ctaLabel: "Quero conhecer",
    filtro: { acessoPortal: "SEM_ACESSO" },
    porQue: "Quem ainda não paga o portal. É upgrade dentro da base que já é cliente — o custo de aquisição é zero.",
  },
];

export function buscarModelo(id: string): ModeloCampanha | undefined {
  return MODELOS_CAMPANHA.find((m) => m.id === id);
}

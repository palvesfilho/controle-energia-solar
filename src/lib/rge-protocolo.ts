/**
 * Leitura do status do protocolo de rateio na concessionária (RGE/CPFL).
 *
 * ## O vocabulário — a armadilha nº 1, e por que ela NÃO nos pega
 *
 * A CPFL usa duas palavras para coisas diferentes, e trocá-las quebra tudo:
 *
 *   - **PEDIDO**    — o número da solicitação. É a CHAVE ESTÁVEL, não muda.
 *                     Ex.: `2206638554`.
 *   - **PROTOCOLO** — número gerado A CADA CONSULTA. O mesmo pedido devolveu
 *                     três protocolos diferentes em 40 segundos no teste do Joel
 *                     (17/08/2026). Além disso, *toda navegação* no site da CPFL
 *                     gera um "protocolo de informação" — ruído puro.
 *
 * Quem guarda o protocolo como identidade nunca mais acha o registro na segunda
 * consulta. Nós escapamos por sorte de nomenclatura: o campo do rateio se chama
 * `protocolo`, mas o que o operador copia do portal e digita ali é o número do
 * PEDIDO — conferido nos 5 valores reais do banco em 02/09/2026, todos com 10
 * dígitos no padrão `22…`/`21…`. E é justamente esse número que se digita no
 * campo rotulado "Protocolo" na tela "Acompanhe seus pedidos".
 *
 * Por isso este módulo trata `RateioVersion.protocolo` como número de PEDIDO, e
 * `protocoloConsultavel()` recusa qualquer coisa fora desse formato — inclusive
 * os dois `"0"` que entraram no banco em 22/08/2026.
 *
 * ## Situação normalizada × status literal
 *
 * O que a RGE devolve é o texto de um badge. Guardamos **os dois**: o literal
 * (prova) e a nossa leitura (situação). Texto que não reconhecemos vira
 * `DESCONHECIDO` — nunca um palpite, e nunca aceite automático.
 */

export type SituacaoProtocolo =
  | "VALIDADO"
  | "EM_ANDAMENTO"
  | "REJEITADO"
  | "NAO_ENCONTRADO"
  | "DESCONHECIDO"
  | "SEM_CREDENCIAL"
  | "PROTOCOLO_INVALIDO"
  // Usina de cooperativa/permissionária: o robô só sabe falar com o portal da
  // CPFL/RGE. Sinalizado em vez de omitido — sem isto pareceria robô parado.
  | "FORA_DA_RGE"
  | "ERRO";

/**
 * O número serve para consultar na RGE?
 *
 * O pedido da CPFL é numérico e tem 10 dígitos nos casos reais; aceitamos de 8 a
 * 14 para não recusar variação legítima, e barramos o que é claramente lixo:
 * vazio, e sequências de um dígito só (`"0"`, `"000"`), que existem no banco.
 */
export function protocoloConsultavel(protocolo: string | null | undefined): boolean {
  const digitos = (protocolo ?? "").replace(/\D/g, "");
  if (digitos.length < 8 || digitos.length > 14) return false;
  // "0", "0000000000", "1111111111" — preenchimento para escapar da validação
  // de campo obrigatório, não protocolo.
  if (/^(\d)\1*$/.test(digitos)) return false;
  return true;
}

/**
 * O valor é claramente NÃO-protocolo? (sem dígito nenhum, ou um dígito só
 * repetido: "0", "000"). É a trava de CADASTRO — estreita de propósito, para
 * barrar o preenchimento de fuga sem recusar um número legítimo fora do formato
 * que conhecemos. O julgamento de formato completo é `protocoloConsultavel`, que
 * só sinaliza na tela.
 */
export function protocoloDegenerado(protocolo: string | null | undefined): boolean {
  const digitos = (protocolo ?? "").replace(/\D/g, "");
  if (!digitos) return true;
  return /^(\d)\1*$/.test(digitos);
}

/** Só dígitos — é assim que o robô digita no campo da CPFL. */
export function normalizarProtocolo(protocolo: string): string {
  return protocolo.replace(/\D/g, "");
}

/**
 * Texto do badge da RGE → situação.
 *
 * O mapeamento sai do próprio AngularJS da CPFL, que expõe `StatusFiltro` com
 * os valores `Finalizada | EmAberto | Atraso | Rejeitada | Cancelada` (lido do
 * `ng-class` da linha do tempo pelo robô do Joel). Os sinônimos abaixo cobrem as
 * grafias que aparecem no badge do cartão, que nem sempre é o mesmo texto.
 */
const MAPA: Array<{ situacao: SituacaoProtocolo; termos: string[] }> = [
  // 🔴 REJEITADO VEM PRIMEIRO, e o casamento é por PALAVRA INTEIRA.
  //
  // A guarda `verifica-rge-protocolo.ts` pegou isto na primeira execução:
  // "Indeferido" contém "deferido", e com busca por substring na ordem antiga
  // um pedido REJEITADO pela RGE era lido como VALIDADO — ou seja, trocaria
  // sozinho o rateio vigente da usina. As negações da língua são prefixos
  // ("in-", "não "), então nem a ordem nem o `\b` sozinhos bastam: são os dois.
  {
    situacao: "REJEITADO",
    termos: ["rejeitada", "rejeitado", "cancelada", "cancelado", "indeferida",
             "indeferido", "improcedente", "nao atendida", "nao atendido",
             "nao executada", "nao executado"],
  },
  {
    situacao: "VALIDADO",
    termos: ["finalizada", "finalizado", "concluida", "concluido", "atendida",
             "atendido", "executada", "executado", "deferida", "deferido"],
  },
  {
    situacao: "EM_ANDAMENTO",
    termos: ["em aberto", "emaberto", "em andamento", "em analise",
             "em execucao", "aguardando", "pendente", "atraso", "em atraso",
             "programada", "programado", "agendada", "agendado"],
  },
];

function semAcento(v: string): string {
  return v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/**
 * Devolve a situação para um status literal. `DESCONHECIDO` quando o texto não
 * casa com nada — que é diferente de "em andamento" e NÃO aceita rateio.
 */
export function situacaoDoStatusRge(statusRge: string | null | undefined): SituacaoProtocolo {
  const texto = semAcento(statusRge ?? "");
  if (!texto) return "DESCONHECIDO";
  for (const { situacao, termos } of MAPA) {
    if (termos.some((t) => contemPalavra(texto, t))) return situacao;
  }
  return "DESCONHECIDO";
}

/** `termo` aparece como palavra inteira em `texto` (os dois já sem acento). */
function contemPalavra(texto: string, termo: string): boolean {
  const escapado = termo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escapado}([^a-z0-9]|$)`).test(texto);
}

/**
 * 🔴 O ACEITE AUTOMÁTICO ESTÁ DESLIGADO desde 12/09/2026 — e o motivo é medido.
 *
 * O desenho de 02/09 era: `VALIDADO` promove o rateio a VIGENTE sozinho. Em
 * 12/09 isso se mostrou cedo demais. **O badge da RGE muda semanas antes de a
 * mudança valer na fatura**:
 *
 *   - BECKER E BRUM, pedido 2196979342: a RGE marcou "concluído" em 22/08/2026.
 *   - A NAPO PIZZARIA, que o rateio novo REMOVE, seguiu compensando 1.409 kWh
 *     na fatura de 08/2026 — o Paulo conferiu fatura por fatura.
 *   - Aceitar ali teria posto o Gestor à frente da concessionária: crédito
 *     distribuído aqui por percentuais que a RGE ainda não aplicava lá.
 *
 * Enquanto o interruptor está desligado, `VALIDADO` não decide nada — vira
 * AVISO na tela de rateios, e o aceite é um clique do operador, que confere a
 * fatura antes. A leitura, o registro e o histórico seguem automáticos: o que
 * saiu foi só o poder de escrever no rateio vigente.
 *
 * 🔓 **Para religar** (decisão do Paulo em 12/09: "quando a RGE estabilizar a
 * emissão das faturas de energia poderemos avançar para ser automático"):
 * trocar esta constante para `true`. Sinal de que dá para religar: as faturas
 * chegando no mês, e um pedido concluído aparecendo aplicado na fatura seguinte
 * — hoje as três UCs da BECKER param em 06/2026.
 */
export const ACEITE_AUTOMATICO_RGE_LIGADO = false;

/**
 * A situação PODERIA aceitar sozinha, se o interruptor estivesse ligado?
 *
 * É uma WHITELIST de propósito: `DESCONHECIDO`, `NAO_ENCONTRADO` e `ERRO` não
 * podem, nem por engano, virar "a concessionária aprovou". Um status mal lido
 * que trocasse o rateio vigente de uma usina é o tipo de erro que só aparece na
 * fatura do cliente, um mês depois.
 *
 * Separada de `aceiteAutomaticoPermitido` para que a guarda de build continue
 * provando a whitelist mesmo com o interruptor desligado — senão, no dia em que
 * alguém religar, ninguém mais estaria testando QUEM pode.
 */
export function situacaoAceitavelPelaRge(situacao: SituacaoProtocolo): boolean {
  return situacao === "VALIDADO";
}

/**
 * O robô pode promover este rateio a VIGENTE sozinho? Hoje: nunca — ver
 * `ACEITE_AUTOMATICO_RGE_LIGADO`.
 */
export function aceiteAutomaticoPermitido(situacao: SituacaoProtocolo): boolean {
  return ACEITE_AUTOMATICO_RGE_LIGADO && situacaoAceitavelPelaRge(situacao);
}

/**
 * O rateio precisa de uma CONFERÊNCIA sua? A RGE disse que concluiu, o rateio
 * ainda espera aceite, e o robô não vai aceitar por você.
 *
 * É este o estado que a tela precisa gritar: sem o aviso, um pedido aprovado
 * pela concessionária ficaria parado em "pendente" para sempre, e a única
 * diferença visível seria um selo verde no meio de outros quatro cinzas.
 */
export function precisaConferenciaManual(
  situacao: SituacaoProtocolo | null | undefined,
  statusDoRateio: string,
): boolean {
  if (ACEITE_AUTOMATICO_RGE_LIGADO) return false;
  return situacao === "VALIDADO" && statusDoRateio === "PENDENTE_ACEITE";
}

/** Marca de autoria do aceite feito pelo robô (RateioVersion.aceitoPor). */
export const ACEITE_ROBO_RGE = "ROBO_RGE";

export const SITUACAO_LABEL: Record<SituacaoProtocolo, string> = {
  VALIDADO: "Validado pela RGE",
  EM_ANDAMENTO: "Em análise na RGE",
  REJEITADO: "Rejeitado pela RGE",
  NAO_ENCONTRADO: "Protocolo não encontrado",
  DESCONHECIDO: "Status não reconhecido",
  SEM_CREDENCIAL: "Sem login da RGE",
  PROTOCOLO_INVALIDO: "Protocolo inválido",
  FORA_DA_RGE: "Concessionária sem consulta automática",
  ERRO: "Erro na consulta",
};

/** Cor do selo na tela. Verde só para validado; âmbar é "olhe isto". */
export const SITUACAO_TOM: Record<SituacaoProtocolo, "verde" | "ambar" | "vermelho" | "cinza"> = {
  VALIDADO: "verde",
  EM_ANDAMENTO: "cinza",
  REJEITADO: "vermelho",
  NAO_ENCONTRADO: "ambar",
  DESCONHECIDO: "ambar",
  SEM_CREDENCIAL: "ambar",
  PROTOCOLO_INVALIDO: "ambar",
  FORA_DA_RGE: "cinza",
  ERRO: "ambar",
};

/**
 * Meses (mm/aaaa) em que o pedido pode aparecer na tela da RGE.
 *
 * 🔴 O filtro da CPFL é pelo MÊS EM QUE O PEDIDO FOI ABERTO, não "pedidos em
 * aberto naquele mês" — provado pelo robô em 17/08/2026: um pedido de 11/08
 * ainda em andamento NÃO aparece na busca de setembro. Olhar só o mês corrente
 * perde todo pedido antigo que continua tramitando.
 *
 * Como sabemos a data de criação do rateio, mandamos a janela certa: o mês da
 * criação, o anterior (o operador pode registrar com atraso) e os seguintes até
 * hoje, limitados a `maximo` meses para não fazer o robô varrer o ano inteiro.
 */
export function periodosDaBusca(criadoEm: Date, hoje = new Date(), maximo = 6): string[] {
  const mm = (d: Date) =>
    `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

  const inicio = new Date(criadoEm.getFullYear(), criadoEm.getMonth() - 1, 1);
  const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

  const meses: string[] = [];
  const cursor = new Date(inicio);
  while (cursor <= fim && meses.length < maximo) {
    meses.push(mm(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  // Rateio criado no futuro (agendado) não gera janela nenhuma: devolve ao menos
  // o mês da criação, para o robô não receber lista vazia e não buscar nada.
  return meses.length ? meses : [mm(criadoEm)];
}

/**
 * OS TEXTOS DA COBRANÇA, editáveis pelo operador.
 *
 * Até 06/09/2026 toda a redação da cobrança vivia escrita à mão em
 * `cobranca-mensagens.ts`: mudar uma vírgula no aviso de atraso exigia um
 * deploy. Pior, o lembrete tinha DOIS tons ("ANTES" e "ATRASO") para uma régua
 * de três dias de atraso — 1, 5 e 10 mandavam exatamente a mesma frase, o que
 * torna o terceiro aviso ruído.
 *
 * Agora a redação é dado, não código. O que continua no código é a MOBÍLIA do
 * email — timbre, valor, vencimento, botão de pagar, rodapé — porque isso é
 * layout, e ninguém deveria precisar escrever HTML para mudar uma frase.
 *
 * ## Os quatro estágios
 *
 * A régua de dias mora em `getCadenciaCobranca` (Personalizações → Cadência de
 * cobranças). Aqui mora o que se DIZ em cada momento dela:
 *
 *   FATURA        a fatura do mês saiu
 *   ANTES         o vencimento se aproxima — tom de favor
 *   ATRASO        venceu há pouco — factual, sem acusar
 *   ATRASO_FIRME  passou de `atrasoFirmeDias` — aí sim o peso das consequências
 *
 * 🔑 **`ATRASO_FIRME` é o motivo de este módulo existir.** Sem ele não há como
 * escalar o tom, e "carinhoso" e "firme" viram a mesma mensagem repetida.
 *
 * ## Por que o render pode FALHAR
 *
 * Um texto editável é uma entrada de usuário que vai direto para o cliente. Se
 * alguém digitar `{{nomeDoCliente}}` em vez de `{{cliente}}`, a alternativa
 * silenciosa é o cliente receber um email com `{{nomeDoCliente}}` escrito no
 * meio da frase. Por isso `renderTexto` **rejeita variável desconhecida**, a
 * tela valida antes de salvar, e quem envia cai no texto PADRÃO quando o
 * personalizado não resolve — ver `textosDeCobranca()`.
 */
import {
  getTextSetting,
  setTextSetting,
  getNumberSetting,
  setNumberSetting,
  APP_SETTING_KEYS,
  APP_SETTING_DEFAULTS,
} from "@/lib/app-settings";

export const ESTAGIOS = ["FATURA", "ANTES", "ATRASO", "ATRASO_FIRME"] as const;
export type EstagioCobranca = (typeof ESTAGIOS)[number];

export const ESTAGIO_LABEL: Record<EstagioCobranca, string> = {
  FATURA: "Fatura emitida",
  ANTES: "Antes do vencimento",
  ATRASO: "Atraso recente",
  ATRASO_FIRME: "Atraso prolongado",
};

export const ESTAGIO_QUANDO: Record<EstagioCobranca, string> = {
  FATURA: "Vai junto com a fatura do mês, com o demonstrativo em PDF anexo.",
  ANTES: "Nos dias que a cadência marcar antes do vencimento (ou no próprio dia).",
  ATRASO: "Nos dias de atraso da cadência, até o limite do atraso prolongado.",
  ATRASO_FIRME: "A partir do dia de atraso configurado abaixo, no lugar do texto anterior.",
};

/** Um estágio tem assunto (só o email usa) e um corpo por canal. */
export interface TextoEstagio {
  assunto: string;
  corpoEmail: string;
  corpoWhatsapp: string;
}

export type TextosCobranca = Record<EstagioCobranca, TextoEstagio>;

// ─────────────────────────────────────────────────────────── As variáveis

/**
 * O que o operador pode escrever entre `{{ }}`.
 *
 * ⚠️ **Esta lista é o contrato.** Ela aparece na tela como ajuda, alimenta a
 * validação do que se salva e alimenta o render. Variável nova entra aqui e em
 * `valoresDasVariaveis` — nos dois, senão a tela oferece algo que o envio não
 * sabe preencher.
 */
export const VARIAVEIS = [
  { chave: "saudacao", ajuda: 'Olá / Olá, Fulano — já resolve o caso da empresa, que não recebe nome' },
  { chave: "cliente", ajuda: "Nome do cliente como está no cadastro" },
  { chave: "primeiroNome", ajuda: "Só o primeiro nome; vazio quando o cliente é empresa" },
  { chave: "uc", ajuda: "Código da unidade consumidora, pontuado" },
  { chave: "mes", ajuda: "set/26" },
  { chave: "mesExtenso", ajuda: "setembro de 2026" },
  { chave: "valor", ajuda: "R$ 487,32" },
  { chave: "vencimento", ajuda: "20/09/2026" },
  { chave: "link", ajuda: "Link da fatura para pagar por PIX ou boleto" },
  { chave: "diasAtraso", ajuda: "Dias vencidos; 0 nos estágios que não são de atraso" },
  { chave: "multa", ajuda: "Multa por atraso, como está configurada (ex.: 2%)" },
  { chave: "juros", ajuda: "Juros ao mês, como estão configurados (ex.: 1% ao mês)" },
  { chave: "empresa", ajuda: "Nome da empresa que cobra" },
  { chave: "suporte", ajuda: "Email de contato" },
] as const;

export type NomeVariavel = (typeof VARIAVEIS)[number]["chave"];

const NOMES_VALIDOS: ReadonlySet<string> = new Set(VARIAVEIS.map((v) => v.chave));

/** `{{ nome }}` — o espaço interno é tolerado; quem digita não deve ser punido por ele. */
const PADRAO_VARIAVEL = /\{\{\s*([a-zA-Z]+)\s*\}\}/g;

/**
 * As variáveis desconhecidas de um texto. Vazio = o texto pode ir ao cliente.
 *
 * Usada tanto pela tela (antes de salvar) quanto pelo envio (antes de mandar).
 * O mesmo julgamento nos dois lados: um texto salvo antes de a regra existir
 * não pode escapar por ter entrado pela porta antiga.
 */
export function variaveisDesconhecidas(texto: string): string[] {
  const achadas = [...texto.matchAll(PADRAO_VARIAVEL)].map((m) => m[1]);
  return [...new Set(achadas.filter((n) => !NOMES_VALIDOS.has(n)))];
}

/**
 * Troca `{{var}}` pelos valores. Lança quando há variável que não existe.
 *
 * 🪤 **`?? ""` seria o buraco.** Uma variável declarada em `VARIAVEIS` mas que
 * ninguém preenche cairia no vazio e sumiria da frase — a tela ofereceria
 * `{{mesExtenso}}`, o operador escreveria "vencimento de {{mesExtenso}}" e o
 * cliente leria "vencimento de ". Por isso a ausência da CHAVE é erro, e só
 * string vazia de verdade (o primeiro nome de uma empresa, um link que não
 * existe) passa em silêncio.
 */
export function renderTexto(texto: string, valores: Record<NomeVariavel, string>): string {
  const ruins = variaveisDesconhecidas(texto);
  if (ruins.length > 0) {
    throw new Error(`variável desconhecida no texto: ${ruins.map((r) => `{{${r}}}`).join(", ")}`);
  }
  return texto.replace(PADRAO_VARIAVEL, (_, nome: string) => {
    if (!(nome in valores)) {
      throw new Error(`variável {{${nome}}} está declarada mas ninguém a preenche`);
    }
    return valores[nome as NomeVariavel];
  });
}

// ─────────────────────────────────────────────────────────────── Os padrões

/**
 * O texto de fábrica — **exatamente o que o sistema mandava antes desta tela
 * existir**, transposto para variáveis.
 *
 * 🔑 Isso não é detalhe de migração: enquanto ninguém editar, o cliente recebe
 * a mesma mensagem de sempre. Uma tela nova que muda o texto de todo mundo no
 * dia em que sobe é uma mudança que ninguém pediu.
 *
 * A exceção é `ATRASO_FIRME`, que não tinha equivalente — nasce a partir do
 * texto de atraso, com as consequências ditas em voz baixa e sem ameaça vazia:
 * ele fala do que o sistema de fato faz (encargos), não do que ainda não faz.
 *
 * 🪧 Um detalhe MUDOU de propósito: o assunto perdeu o sufixo "— {{empresa}}".
 * Ele agora é também o TÍTULO dentro do email, e "Sua fatura set/26 —
 * Associação de Energia Brasil Solar" é uma manchete ruim. No assunto o nome
 * já aparece no remetente, então o sufixo era repetição.
 */
export const TEXTOS_PADRAO: TextosCobranca = {
  FATURA: {
    assunto: "Sua fatura de {{mes}} chegou",
    corpoEmail: [
      "{{saudacao}}, esta é a sua fatura mensal da {{empresa}}, referente à unidade consumidora {{uc}}.",
      "",
      "O demonstrativo completo, com o detalhamento da economia e os códigos de pagamento, está em anexo neste email.",
    ].join("\n"),
    corpoWhatsapp: [
      "{{saudacao}}! Sua fatura de energia solar de {{mes}} já está disponível.",
      "",
      "*Unidade:* {{uc}}",
      "*Valor:* {{valor}}",
      "*Vencimento:* {{vencimento}}",
      "",
      "Pague por PIX ou boleto e veja o demonstrativo completo neste link:",
      "{{link}}",
      "",
      "O demonstrativo também foi enviado em PDF para o seu email.",
    ].join("\n"),
  },
  ANTES: {
    assunto: "Sua fatura de {{mes}} vence em {{vencimento}}",
    corpoEmail:
      "{{saudacao}}, passando para lembrar: a fatura da unidade {{uc}} vence em {{vencimento}}.",
    corpoWhatsapp: [
      "{{saudacao}}! Passando para lembrar que a sua fatura de energia solar de {{mes}} vence em {{vencimento}}.",
      "",
      "*Unidade:* {{uc}}",
      "*Valor:* {{valor}}",
      "",
      "Pague por PIX ou boleto e veja o demonstrativo neste link:",
      "{{link}}",
    ].join("\n"),
  },
  ATRASO: {
    assunto: "Fatura de {{mes}} em aberto",
    corpoEmail: [
      "{{saudacao}}, a fatura da unidade {{uc}} venceu em {{vencimento}} e consta em aberto.",
      "",
      "Se o pagamento foi feito nos últimos dias, pode desconsiderar este aviso — a confirmação bancária leva algum tempo para chegar até nós.",
    ].join("\n"),
    corpoWhatsapp: [
      "{{saudacao}}! A sua fatura de energia solar de {{mes}} venceu em {{vencimento}} e consta em aberto.",
      "",
      "*Unidade:* {{uc}}",
      "*Valor:* {{valor}}",
      "",
      "Pague por PIX ou boleto e veja o demonstrativo neste link:",
      "{{link}}",
      "",
      "Se já pagou nos últimos dias, pode desconsiderar — a confirmação pode levar um pouco para chegar.",
    ].join("\n"),
  },
  ATRASO_FIRME: {
    assunto: "Fatura de {{mes}} vencida há {{diasAtraso}} dias",
    corpoEmail: [
      "{{saudacao}}, a fatura da unidade {{uc}} venceu em {{vencimento}} e continua em aberto há {{diasAtraso}} dias.",
      "",
      "O boleto segue válido e já contempla multa de {{multa}} e juros de {{juros}} sobre o valor original.",
      "",
      "Se houver qualquer dificuldade com este pagamento, responda este email — é melhor conversarmos do que deixar a pendência crescer.",
    ].join("\n"),
    corpoWhatsapp: [
      "{{saudacao}}, a sua fatura de energia solar de {{mes}} está em aberto há {{diasAtraso}} dias.",
      "",
      "*Unidade:* {{uc}}",
      "*Valor:* {{valor}}",
      "",
      "O boleto segue válido, já com multa de {{multa}} e juros de {{juros}}:",
      "{{link}}",
      "",
      "Se estiver com dificuldade para pagar, responda esta mensagem — a gente encontra uma saída.",
    ].join("\n"),
  },
};

// ───────────────────────────────────────────────────────── Leitura e escrita

function chave(estagio: EstagioCobranca, campo: keyof TextoEstagio): string {
  return `cobranca.texto.${estagio}.${campo}`;
}

const CAMPOS: (keyof TextoEstagio)[] = ["assunto", "corpoEmail", "corpoWhatsapp"];

/**
 * Os textos em vigor: o que foi salvo, com o padrão preenchendo os buracos.
 *
 * ⚠️ **Um texto salvo com variável inválida é DESCARTADO aqui**, e o padrão
 * entra no lugar. A tela impede de salvar assim, mas a lista de variáveis pode
 * encolher num refactor futuro e transformar um texto legítimo em texto
 * quebrado — e a cobrança do cliente não é o lugar de descobrir isso.
 */
export async function textosDeCobranca(): Promise<TextosCobranca> {
  const salvos = await Promise.all(
    ESTAGIOS.flatMap((e) => CAMPOS.map(async (c) => [e, c, await getTextSetting(chave(e, c))] as const)),
  );

  const textos = JSON.parse(JSON.stringify(TEXTOS_PADRAO)) as TextosCobranca;
  for (const [estagio, campo, valor] of salvos) {
    if (valor === null || valor.trim() === "") continue;
    if (variaveisDesconhecidas(valor).length > 0) continue;
    textos[estagio][campo] = valor;
  }
  return textos;
}

/** Grava o que a tela mandou. Já chega validado pela rota. */
export async function setTextosDeCobranca(textos: TextosCobranca): Promise<void> {
  await Promise.all(
    ESTAGIOS.flatMap((e) => CAMPOS.map((c) => setTextSetting(chave(e, c), textos[e][c]))),
  );
}

// ───────────────────────────────────────────────────────────────── Encargos

/**
 * Multa e juros do boleto, e a partir de quantos dias o tom endurece.
 *
 * 🪤 **Zero não é "cobrar zero", é "não mandar".** A conta do Asaas tem
 * configuração GLOBAL de multa e juros no painel, e a documentação avisa que
 * enviar `fine`/`interest` na cobrança SOBRESCREVE essa configuração. Mandar
 * `{value: 0}` desligaria em silêncio o que estiver configurado lá. Por isso o
 * zero aqui significa "não toque no assunto" — ver `encargosParaAsaas`.
 */
export interface EncargosCobranca {
  /** Multa por atraso, em % do valor. 0 = não enviar. */
  multaPercentual: number;
  /** Juros de mora, em % ao mês. 0 = não enviar. */
  jurosMensalPercentual: number;
  /** A partir de quantos dias de atraso vale o texto ATRASO_FIRME. */
  atrasoFirmeDias: number;
}

export const ENCARGOS_PADRAO: EncargosCobranca = {
  // Nasce ZERADO de propósito: é exatamente o que o sistema faz hoje. Ligar
  // encargo é decisão de quem conhece o contrato de adesão, não default de
  // software — e um boleto que nasce com multa que o contrato não prevê é um
  // problema pior do que um boleto sem multa.
  multaPercentual: 0,
  jurosMensalPercentual: 0,
  atrasoFirmeDias: 15,
};

export async function getEncargosCobranca(): Promise<EncargosCobranca> {
  const [multa, juros, firme] = await Promise.all([
    getNumberSetting(
      APP_SETTING_KEYS.cobrancaMultaPercentual,
      APP_SETTING_DEFAULTS[APP_SETTING_KEYS.cobrancaMultaPercentual],
    ),
    getNumberSetting(
      APP_SETTING_KEYS.cobrancaJurosMensalPercentual,
      APP_SETTING_DEFAULTS[APP_SETTING_KEYS.cobrancaJurosMensalPercentual],
    ),
    getNumberSetting(
      APP_SETTING_KEYS.cobrancaAtrasoFirmeDias,
      APP_SETTING_DEFAULTS[APP_SETTING_KEYS.cobrancaAtrasoFirmeDias],
    ),
  ]);
  return {
    multaPercentual: limitar(multa, 0, 100),
    jurosMensalPercentual: limitar(juros, 0, 100),
    atrasoFirmeDias: Math.max(1, Math.round(firme || ENCARGOS_PADRAO.atrasoFirmeDias)),
  };
}

export async function setEncargosCobranca(e: EncargosCobranca): Promise<void> {
  await Promise.all([
    setNumberSetting(APP_SETTING_KEYS.cobrancaMultaPercentual, limitar(e.multaPercentual, 0, 100)),
    setNumberSetting(
      APP_SETTING_KEYS.cobrancaJurosMensalPercentual,
      limitar(e.jurosMensalPercentual, 0, 100),
    ),
    setNumberSetting(APP_SETTING_KEYS.cobrancaAtrasoFirmeDias, Math.max(1, Math.round(e.atrasoFirmeDias))),
  ]);
}

/**
 * Os encargos no formato que o `POST /v3/payments` do Asaas espera.
 *
 * 🪤 **Devolve `{}` quando os dois são zero, e isso é deliberado.** A doc do
 * Asaas diz: *"se a conta possui configurações globais de multa e juros e elas
 * devem ser mantidas, não envie `interest` e `fine`"* — mandar zero SOBRESCREVE
 * o que estiver configurado no painel. Um sistema que "só manda o que sabe"
 * apagaria em silêncio uma regra que alguém configurou por fora.
 *
 * `fine.type: "PERCENTAGE"` porque multa em reais fixos não faz sentido numa
 * carteira em que a fatura vai de R$ 5 a R$ 4 mil. `interest` não tem `type`:
 * a API já o entende como percentual MENSAL.
 */
export function encargosParaAsaas(e: EncargosCobranca): {
  fine?: { value: number; type: "PERCENTAGE" };
  interest?: { value: number };
} {
  const payload: { fine?: { value: number; type: "PERCENTAGE" }; interest?: { value: number } } = {};
  if (e.multaPercentual > 0) payload.fine = { value: e.multaPercentual, type: "PERCENTAGE" };
  if (e.jurosMensalPercentual > 0) payload.interest = { value: e.jurosMensalPercentual };
  return payload;
}

function limitar(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}

/** "2%" / "—" quando não há multa configurada. Serve à tela e às variáveis. */
export function percentualBR(v: number): string {
  if (!v) return "—";
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

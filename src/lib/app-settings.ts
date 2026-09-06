/**
 * Helper genérico pra ler/escrever parâmetros editáveis (model `AppSetting`).
 *
 * Uso típico: parâmetros que admin edita em /admin/personalizacoes/* e que
 * são consumidos por libs ou jobs do server. Cada parâmetro tem uma key
 * estável (ex.: "relatorio.reajusteTarifaAnual") e fallback hard-coded.
 */
import { prisma } from "@/lib/prisma";

export const APP_SETTING_KEYS = {
  reajusteTarifaAnual: "relatorio.reajusteTarifaAnual",
  depreciacaoModuloAnual: "relatorio.depreciacaoModuloAnual",
  // Valores de tabela do acesso pago ao portal do cliente Brasil Solar (R$).
  // MENSAL/ANUAL usam o valor de tabela; PERSONALIZADO exige valor >= tabela.
  acessoValorMensalTabela: "acesso.valorMensalTabela",
  acessoValorAnualTabela: "acesso.valorAnualTabela",
  // Trava de frequência das campanhas do módulo Mensagens. Ver
  // `getFrequenciaMensagens` mais abaixo.
  mensagensMaxPorPeriodo: "mensagens.maxPorPeriodo",
  mensagensPeriodoDias: "mensagens.periodoDias",
  mensagensIntervaloMinimoDias: "mensagens.intervaloMinimoDias",
  // Cadência de lembretes de cobrança. Ver `getCadenciaCobranca` mais abaixo.
  cobrancaLembretesAtivos: "cobranca.lembretesAtivos",
  cobrancaLembreteAntesDias: "cobranca.lembreteAntesDias",
  cobrancaLembreteAtrasoDias: "cobranca.lembreteAtrasoDias",
  cobrancaLembreteCanais: "cobranca.lembreteCanais",
} as const;

export const APP_SETTING_DEFAULTS = {
  [APP_SETTING_KEYS.reajusteTarifaAnual]: 0.07,
  [APP_SETTING_KEYS.depreciacaoModuloAnual]: 0.005,
  [APP_SETTING_KEYS.acessoValorMensalTabela]: 0,
  [APP_SETTING_KEYS.acessoValorAnualTabela]: 0,
  // Defaults conservadores: no máximo 2 campanhas por mês para o mesmo
  // cliente, e nunca duas na mesma semana. Quem quiser mais agressivo sobe o
  // número de propósito; quem não configurou nada fica protegido.
  [APP_SETTING_KEYS.mensagensMaxPorPeriodo]: 2,
  [APP_SETTING_KEYS.mensagensPeriodoDias]: 30,
  [APP_SETTING_KEYS.mensagensIntervaloMinimoDias]: 7,
  // ⚠️ Nasce DESLIGADO de propósito. Cadência toca o celular e a caixa de
  // entrada de todo cliente com fatura em aberto, de uma vez. Ligar é decisão,
  // não default.
  [APP_SETTING_KEYS.cobrancaLembretesAtivos]: 0,
} as const;

/**
 * Lê uma chave numérica do AppSetting. Retorna o default hard-coded se a
 * key não existe ou o valor não é parseável como número.
 */
export async function getNumberSetting(key: string, defaultValue: number): Promise<number> {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  if (!row) return defaultValue;
  const n = Number(row.value);
  return Number.isFinite(n) ? n : defaultValue;
}

export async function setNumberSetting(key: string, value: number): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key },
    update: { value: String(value) },
    create: { key, value: String(value) },
  });
}

/**
 * Conjunto de parâmetros usados no cálculo de payback do relatório Brasil
 * Solar. Default vem de `APP_SETTING_DEFAULTS` se nada cadastrado.
 */
export async function getRelatorioParametros(): Promise<{
  reajusteTarifaAnual: number;
  depreciacaoModuloAnual: number;
}> {
  const [reajuste, depreciacao] = await Promise.all([
    getNumberSetting(
      APP_SETTING_KEYS.reajusteTarifaAnual,
      APP_SETTING_DEFAULTS[APP_SETTING_KEYS.reajusteTarifaAnual],
    ),
    getNumberSetting(
      APP_SETTING_KEYS.depreciacaoModuloAnual,
      APP_SETTING_DEFAULTS[APP_SETTING_KEYS.depreciacaoModuloAnual],
    ),
  ]);
  return { reajusteTarifaAnual: reajuste, depreciacaoModuloAnual: depreciacao };
}

/**
 * Valores de tabela do acesso pago ao portal (mensal e anual, em R$). Default 0
 * — o admin define em /admin/personalizacoes/acesso-portal. Usados pra
 * pré-preencher MENSAL/ANUAL e como piso do valor no modo PERSONALIZADO.
 */
export async function getAcessoValoresTabela(): Promise<{
  mensal: number;
  anual: number;
}> {
  const [mensal, anual] = await Promise.all([
    getNumberSetting(
      APP_SETTING_KEYS.acessoValorMensalTabela,
      APP_SETTING_DEFAULTS[APP_SETTING_KEYS.acessoValorMensalTabela],
    ),
    getNumberSetting(
      APP_SETTING_KEYS.acessoValorAnualTabela,
      APP_SETTING_DEFAULTS[APP_SETTING_KEYS.acessoValorAnualTabela],
    ),
  ]);
  return { mensal, anual };
}

/**
 * Trava de frequência das campanhas (módulo Mensagens).
 *
 * Três números que respondem "com que insistência podemos falar com a mesma
 * pessoa": no máximo `maxPorPeriodo` mensagens a cada `periodoDias`, e nunca
 * duas separadas por menos de `intervaloMinimoDias`.
 *
 * Os dois limites não são redundantes: só o teto mensal permitiria mandar as 2
 * do mês na mesma tarde, e só o intervalo mínimo permitiria mandar 4 por mês
 * espaçadas de 7 em 7 dias. Juntos descrevem o ritmo, não só o volume.
 *
 * `maxPorPeriodo = 0` desliga a trava — é a saída explícita para quem quiser
 * assumir o risco, e não um efeito colateral de campo em branco.
 */
export async function getFrequenciaMensagens(): Promise<{
  maxPorPeriodo: number;
  periodoDias: number;
  intervaloMinimoDias: number;
}> {
  const [max, periodo, intervalo] = await Promise.all([
    getNumberSetting(
      APP_SETTING_KEYS.mensagensMaxPorPeriodo,
      APP_SETTING_DEFAULTS[APP_SETTING_KEYS.mensagensMaxPorPeriodo],
    ),
    getNumberSetting(
      APP_SETTING_KEYS.mensagensPeriodoDias,
      APP_SETTING_DEFAULTS[APP_SETTING_KEYS.mensagensPeriodoDias],
    ),
    getNumberSetting(
      APP_SETTING_KEYS.mensagensIntervaloMinimoDias,
      APP_SETTING_DEFAULTS[APP_SETTING_KEYS.mensagensIntervaloMinimoDias],
    ),
  ]);
  return { maxPorPeriodo: max, periodoDias: periodo, intervaloMinimoDias: intervalo };
}

// ── Cadência de lembretes de cobrança ───────────────────────────────────────

/**
 * A régua de lembretes: quando falar com quem tem fatura em aberto.
 *
 * Guardada como texto CSV (`"3"`, `"1,5,10"`) e não como número solto porque a
 * régua é uma LISTA — "3 dias antes" e "no 1º, 5º e 10º dia de atraso". Um
 * campo por dia engessaria em três avisos para sempre.
 *
 * 🔑 **Os dias são a chave de idempotência** (`CobrancaLembrete.diaReferencia`).
 * Mudar a régua no meio do mês não reenvia o que já saiu: um dia que já tem
 * linha gravada continua tendo. O efeito é só sobre os dias novos.
 *
 * ⚠️ `ativos = 0` (o padrão) não é "sem lembrete configurado", é "não mande
 * nada". O agendador respeita e nem monta a lista.
 */
export interface CadenciaCobranca {
  ativos: boolean;
  /** Dias ANTES do vencimento. Ex.: [3] → avisa três dias antes. */
  antesDias: number[];
  /** Dias DEPOIS do vencimento. Ex.: [1, 5, 10]. */
  atrasoDias: number[];
  canais: { email: boolean; whatsapp: boolean };
}

export const CADENCIA_PADRAO: CadenciaCobranca = {
  ativos: false,
  antesDias: [3],
  atrasoDias: [1, 5, 10],
  canais: { email: true, whatsapp: true },
};

/**
 * Lista de dias a partir do texto salvo. Descarta o que não for inteiro
 * positivo, ordena e tira repetido — dois "5" na régua mandariam o mesmo
 * lembrete duas vezes se o `@@unique` não estivesse lá para impedir.
 */
function parseDias(
  bruto: string | null | undefined,
  fallback: number[],
  { aceitaZero = false }: { aceitaZero?: boolean } = {},
): number[] {
  if (bruto === null || bruto === undefined) return fallback;
  const minimo = aceitaZero ? 0 : 1;
  const dias = bruto
    .split(",")
    .map((p) => Number(p.trim()))
    .filter((n) => Number.isInteger(n) && n >= minimo && n <= 365);
  return [...new Set(dias)].sort((a, b) => a - b);
}

async function getTextSetting(key: string): Promise<string | null> {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  return row?.value ?? null;
}

export async function getCadenciaCobranca(): Promise<CadenciaCobranca> {
  const [ativos, antes, atraso, canais] = await Promise.all([
    getNumberSetting(
      APP_SETTING_KEYS.cobrancaLembretesAtivos,
      APP_SETTING_DEFAULTS[APP_SETTING_KEYS.cobrancaLembretesAtivos],
    ),
    getTextSetting(APP_SETTING_KEYS.cobrancaLembreteAntesDias),
    getTextSetting(APP_SETTING_KEYS.cobrancaLembreteAtrasoDias),
    getTextSetting(APP_SETTING_KEYS.cobrancaLembreteCanais),
  ]);

  // Canais em CSV ("EMAIL,WHATSAPP"). Ausente = os dois, que é o default.
  const lista = (canais ?? "EMAIL,WHATSAPP").toUpperCase();
  return {
    ativos: ativos === 1,
    // `0` vale em "antes" e significa NO DIA do vencimento — o lembrete mais
    // pedido de todos, e que ficaria inalcançável se só aceitássemos n > 0.
    antesDias: parseDias(antes, CADENCIA_PADRAO.antesDias, { aceitaZero: true }),
    atrasoDias: parseDias(atraso, CADENCIA_PADRAO.atrasoDias),
    canais: {
      email: lista.includes("EMAIL"),
      whatsapp: lista.includes("WHATSAPP"),
    },
  };
}

export async function setCadenciaCobranca(c: CadenciaCobranca): Promise<void> {
  const canais = [c.canais.email ? "EMAIL" : null, c.canais.whatsapp ? "WHATSAPP" : null]
    .filter(Boolean)
    .join(",");
  await Promise.all([
    setNumberSetting(APP_SETTING_KEYS.cobrancaLembretesAtivos, c.ativos ? 1 : 0),
    setTextSetting(APP_SETTING_KEYS.cobrancaLembreteAntesDias, c.antesDias.join(",")),
    setTextSetting(APP_SETTING_KEYS.cobrancaLembreteAtrasoDias, c.atrasoDias.join(",")),
    setTextSetting(APP_SETTING_KEYS.cobrancaLembreteCanais, canais),
  ]);
}

async function setTextSetting(key: string, value: string): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

/** A régua em português, para a tela e para o log dizerem a mesma coisa. */
/**
 * "1, 5 e 10" — vírgula entre os primeiros e "e" antes do último. O sufixo vai
 * em TODOS os itens, inclusive o último: deixar o último para o chamador
 * produzia "no 1ºº dia" quando a lista tinha um item só.
 */
function listar(ns: number[], sufixo = ""): string {
  const comSufixo = ns.map((n) => `${n}${sufixo}`);
  if (comSufixo.length === 1) return comSufixo[0];
  return `${comSufixo.slice(0, -1).join(", ")} e ${comSufixo[comSufixo.length - 1]}`;
}

export function descreverCadencia(c: CadenciaCobranca): string {
  if (!c.ativos) return "Lembretes desligados.";
  const partes: string[] = [];

  // O plural segue o NÚMERO, não a quantidade de entradas: com [3] a frase é
  // "3 dias antes", não "3 dia antes".
  const antesSemZero = c.antesDias.filter((d) => d > 0);
  if (antesSemZero.length > 0) {
    const ultimo = antesSemZero[antesSemZero.length - 1];
    partes.push(
      `${listar(antesSemZero)} ${ultimo === 1 ? "dia" : "dias"} antes do vencimento`,
    );
  }
  if (c.antesDias.includes(0)) partes.push("no próprio dia do vencimento");
  if (c.atrasoDias.length > 0) {
    partes.push(
      `no ${listar(c.atrasoDias, "º")} dia de atraso`,
    );
  }
  if (partes.length === 0) return "Ligado, mas sem nenhum dia configurado — nada será enviado.";
  const canais = [c.canais.email ? "email" : null, c.canais.whatsapp ? "WhatsApp" : null]
    .filter(Boolean)
    .join(" e ");
  return `Avisa ${partes.join(" e ")}, por ${canais || "nenhum canal (nada será enviado)"}.`;
}

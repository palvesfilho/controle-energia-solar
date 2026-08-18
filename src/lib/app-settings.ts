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

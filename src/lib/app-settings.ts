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
} as const;

export const APP_SETTING_DEFAULTS = {
  [APP_SETTING_KEYS.reajusteTarifaAnual]: 0.07,
  [APP_SETTING_KEYS.depreciacaoModuloAnual]: 0.005,
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

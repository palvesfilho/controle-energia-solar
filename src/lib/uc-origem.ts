/**
 * Origem da ConsumerUnit — separa os dois módulos do sistema.
 *
 *  PADRAO                     → Associação de Energia (fluxo do investidor).
 *                               É o único que pertence à Gestão de Créditos.
 *  BRASIL_SOLAR_TITULAR       → UC do proprietário cadastrado no módulo
 *                               Brasil Solar (criada junto com o proprietário).
 *  BRASIL_SOLAR_BENEFICIARIA  → UC que recebe créditos de um proprietário BS
 *                               (autoconsumo remoto, sem versionamento).
 *
 * As duas de Brasil Solar existem só para baixar fatura e alimentar o relatório
 * do cliente BS — NÃO entram nas telas da Associação (Gestão de Créditos,
 * Rateios, Balanço Mensal). Quem precisa delas usa as telas do módulo BS.
 */
export const ORIGENS_BRASIL_SOLAR = [
  "BRASIL_SOLAR_TITULAR",
  "BRASIL_SOLAR_BENEFICIARIA",
] as const;

/**
 * Fragmento de `where` que exclui as UCs do módulo Brasil Solar.
 * Use em toda query que alimenta tela da Associação de Energia.
 *
 *   where: { active: true, ...SEM_UC_BRASIL_SOLAR }
 *
 * Sem `as const`: o Prisma não aceita array readonly em `notIn`.
 */
export const SEM_UC_BRASIL_SOLAR: { origem: { notIn: string[] } } = {
  origem: { notIn: [...ORIGENS_BRASIL_SOLAR] },
};

/** true quando a origem pertence ao módulo Brasil Solar. */
export function isOrigemBrasilSolar(origem: string | null | undefined): boolean {
  return !!origem && (ORIGENS_BRASIL_SOLAR as readonly string[]).includes(origem);
}

/**
 * Papéis de acesso do sistema (RBAC).
 *
 * O nome do arquivo é herança: aqui moravam também as augmentations de
 * `next-auth` (`declare module "next-auth"`), removidas em 08/08/2026 junto com
 * o desligamento do login por senha. A autenticação é do Clerk, e o shape da
 * sessão vive em `CompatSession` (`src/lib/auth-compat.ts`).
 *
 * `UserRole` é importado por 9 arquivos daqui — por isso o caminho
 * `@/types/next-auth` foi mantido em vez de renomeado.
 */

export type UserRole =
  | "ADMIN"
  | "GESTOR"
  | "FINANCEIRO"
  | "POS_VENDA"
  | "GESTOR_OBRA"
  | "INVESTOR"
  | "CONSUMER"
  // Cliente da Rede Brasil Solar (proprietário de usina) com acesso pago ao
  // portal do cliente. Isolado: só enxerga /portal-cliente, nunca o admin.
  | "CLIENTE_BS";

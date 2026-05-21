import { UserRole } from "@/types/next-auth";

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Administrador",
  GESTOR: "Gestor",
  FINANCEIRO: "Financeiro",
  POS_VENDA: "Pós-Venda",
  GESTOR_OBRA: "Gestor de Obras",
  INVESTOR: "Investidor",
  CONSUMER: "Consumidor",
};

// Sections (granularidade de acesso). Toda checagem nova de permissão
// deve usar canAccessSection() com uma destas chaves.
export type AdminSection =
  | "dashboard"
  | "agenda"
  | "investidores"
  | "clientes"
  | "gestaoCreditos"
  | "faturasEnergia"
  | "faturamento"
  | "brasilSolar"
  | "obra"
  | "usuarios"
  | "personalizacoesHub"
  | "persObras"
  | "persEquipes"
  | "persCodigosErroView"
  | "persCodigosErroEdit"
  | "persDistribuidoraEmails"
  | "persAlertasUsinas"
  | "persRelatorioParametros";

const FULL_ADMIN_TRIO: UserRole[] = ["ADMIN", "GESTOR", "FINANCEIRO"];

export const SECTION_ROLES: Record<AdminSection, UserRole[]> = {
  dashboard: FULL_ADMIN_TRIO,
  agenda: FULL_ADMIN_TRIO,
  investidores: FULL_ADMIN_TRIO,
  clientes: FULL_ADMIN_TRIO,
  gestaoCreditos: FULL_ADMIN_TRIO,
  faturasEnergia: FULL_ADMIN_TRIO,
  faturamento: FULL_ADMIN_TRIO,
  brasilSolar: [...FULL_ADMIN_TRIO, "POS_VENDA"],
  obra: [...FULL_ADMIN_TRIO, "POS_VENDA", "GESTOR_OBRA"],
  usuarios: ["ADMIN"],
  // Hub das personalizações: qualquer role com acesso a ao menos um card
  personalizacoesHub: [...FULL_ADMIN_TRIO, "POS_VENDA", "GESTOR_OBRA"],
  persObras: [...FULL_ADMIN_TRIO, "POS_VENDA", "GESTOR_OBRA"],
  persEquipes: [...FULL_ADMIN_TRIO, "POS_VENDA", "GESTOR_OBRA"],
  persCodigosErroView: [...FULL_ADMIN_TRIO, "POS_VENDA", "GESTOR_OBRA"],
  persCodigosErroEdit: FULL_ADMIN_TRIO,
  persDistribuidoraEmails: FULL_ADMIN_TRIO,
  persAlertasUsinas: FULL_ADMIN_TRIO,
  persRelatorioParametros: FULL_ADMIN_TRIO,
};

export function canAccessSection(
  role: string | undefined | null,
  section: AdminSection,
): boolean {
  if (!role) return false;
  return SECTION_ROLES[section].includes(role as UserRole);
}

// Roles com acesso ao trio "tradicional" do admin. Mantida com semântica antiga
// (ADMIN/GESTOR/FINANCEIRO) pra não soltar acidentalmente os roles novos em
// rotas legadas que ainda usam isAdminRole(). Para liberar acesso de POS_VENDA
// ou GESTOR_OBRA a uma rota específica, troque a checagem por canAccessSection().
export const ADMIN_ROLES: UserRole[] = [...FULL_ADMIN_TRIO];

// Roles que podem entrar em qualquer subrota /admin/* — uso restrito ao
// middleware pra liberar a entrada; cada path checa sua própria section.
export const ADMIN_PANEL_ROLES: UserRole[] = [
  ...FULL_ADMIN_TRIO,
  "POS_VENDA",
  "GESTOR_OBRA",
];

// Roles que podem gerenciar usuários
export const USER_MANAGEMENT_ROLES: UserRole[] = ["ADMIN"];

// Roles que podem confirmar pagamentos (subir comprovante)
export const FINANCE_ROLES: UserRole[] = ["ADMIN", "FINANCEIRO"];

export function isAdminRole(role: string): boolean {
  return ADMIN_ROLES.includes(role as UserRole);
}

export function canEnterAdminPanel(role: string): boolean {
  return ADMIN_PANEL_ROLES.includes(role as UserRole);
}

export function canManageUsers(role: string): boolean {
  return USER_MANAGEMENT_ROLES.includes(role as UserRole);
}

export function isFinanceRole(role: string): boolean {
  return FINANCE_ROLES.includes(role as UserRole);
}

// Apenas ADMIN: edicoes que sobrevivem ao encerramento do mes
// (subir/remover comprovante apos fechado, reabrir mes, reverter publicacao
// de relatorio). GESTOR e FINANCEIRO ficam travados.
export function isFullAdmin(role: string): boolean {
  return role === "ADMIN";
}

// ADMIN ou GESTOR podem editar/sobrescrever um pagamento de fatura já registrado
// (data, banco, comprovante). FINANCEIRO consegue registrar a primeira vez, mas
// não consegue alterar registro já existente — preserva auditoria.
export function canEditPaidBill(role: string | undefined | null): boolean {
  return role === "ADMIN" || role === "GESTOR";
}

export function getHomeRoute(role: string): string {
  switch (role) {
    case "ADMIN":
    case "GESTOR":
    case "FINANCEIRO":
      return "/admin";
    case "POS_VENDA":
      return "/admin/brasil-solar";
    case "GESTOR_OBRA":
      return "/admin/obra/gestao-obra";
    case "INVESTOR":
      return "/painel";
    case "CONSUMER":
      return "/painel";
    default:
      return "/login";
  }
}

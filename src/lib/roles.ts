import { UserRole } from "@/types/next-auth";

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Administrador",
  GESTOR: "Gestor",
  FINANCEIRO: "Financeiro",
  INVESTOR: "Investidor",
  CONSUMER: "Consumidor",
};

// Roles que podem acessar o painel admin
export const ADMIN_ROLES: UserRole[] = ["ADMIN", "GESTOR", "FINANCEIRO"];

// Roles que podem gerenciar usuários
export const USER_MANAGEMENT_ROLES: UserRole[] = ["ADMIN"];

// Roles que podem confirmar pagamentos (subir comprovante)
export const FINANCE_ROLES: UserRole[] = ["ADMIN", "FINANCEIRO"];

export function isAdminRole(role: string): boolean {
  return ADMIN_ROLES.includes(role as UserRole);
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

export function getHomeRoute(role: string): string {
  switch (role) {
    case "ADMIN":
    case "GESTOR":
    case "FINANCEIRO":
      return "/admin";
    case "INVESTOR":
      return "/painel";
    case "CONSUMER":
      return "/painel";
    default:
      return "/login";
  }
}

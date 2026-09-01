import { UserRole } from "@/types/next-auth";

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Administrador",
  GESTOR: "Gestor",
  FINANCEIRO: "Financeiro",
  POS_VENDA: "Pós-Venda",
  GESTOR_OBRA: "Gestor de Obras",
  INVESTOR: "Investidor",
  CONSUMER: "Consumidor",
  CLIENTE_BS: "Cliente Brasil Solar",
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
  | "crmIntegracao"
  | "mensagens"
  | "usuarios"
  | "personalizacoesHub"
  | "persObras"
  | "persEquipes"
  | "persCodigosErroView"
  | "persCodigosErroEdit"
  | "persDistribuidoraEmails"
  | "persAlertasUsinas"
  | "persRelatorioParametros"
  | "persAcessoPortal"
  | "persFrequenciaMensagens";

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
  // Fila de vendas ganhas vindas do CRM: quem cadastra UC/usina e ajusta o
  // balanço de créditos é o pós-venda. Gestor de obras fica de fora — o que
  // é dele já chega na aprovação de obras.
  crmIntegracao: [...FULL_ADMIN_TRIO, "POS_VENDA"],
  // Campanhas de mensagem para o cliente. Quem escreve e dispara é o pós-venda
  // — é quem conhece a base e quem vai atender o interessado que responder.
  // Gestor de obras fica de fora: a campanha é comercial, não operacional.
  mensagens: [...FULL_ADMIN_TRIO, "POS_VENDA"],
  // Emissão de acesso (31/08/2026): FINANCEIRO e POS_VENDA entram porque são
  // eles que atendem quem precisa de login. A escalada de privilégio é barrada
  // um nível abaixo, em `rolesAtribuiveisPor()` — eles não atribuem ADMIN,
  // GESTOR nem FINANCEIRO, e não editam quem já tem um desses papéis.
  usuarios: ["ADMIN", "FINANCEIRO", "POS_VENDA"],
  // Hub das personalizações: qualquer role com acesso a ao menos um card
  personalizacoesHub: [...FULL_ADMIN_TRIO, "POS_VENDA", "GESTOR_OBRA"],
  persObras: [...FULL_ADMIN_TRIO, "POS_VENDA", "GESTOR_OBRA"],
  persEquipes: [...FULL_ADMIN_TRIO, "POS_VENDA", "GESTOR_OBRA"],
  persCodigosErroView: [...FULL_ADMIN_TRIO, "POS_VENDA", "GESTOR_OBRA"],
  persCodigosErroEdit: FULL_ADMIN_TRIO,
  persDistribuidoraEmails: FULL_ADMIN_TRIO,
  persAlertasUsinas: FULL_ADMIN_TRIO,
  persRelatorioParametros: FULL_ADMIN_TRIO,
  persAcessoPortal: FULL_ADMIN_TRIO,
  // De propósito SEM `POS_VENDA`, que tem acesso a `mensagens`: quem é limitado
  // pela trava de frequência não deveria ser quem a afrouxa. A guarda existe
  // para proteger a base de quem está com pressa de vender — inclusive de quem
  // tem toda a razão de estar com pressa.
  persFrequenciaMensagens: FULL_ADMIN_TRIO,
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

// Roles que um ADMIN pode atribuir ao criar/editar usuário pela tela.
// Fonte única — as rotas /api/users e /api/users/[id] validam por aqui.
// CLIENTE_BS fica de fora de propósito: nasce pelo fluxo de acesso do portal
// Brasil Solar, não pelo cadastro manual.
export const ASSIGNABLE_ROLES: UserRole[] = [
  "ADMIN",
  "GESTOR",
  "FINANCEIRO",
  "POS_VENDA",
  "GESTOR_OBRA",
  "INVESTOR",
  "CONSUMER",
];

// ─────────────────────────────────────────────────────────────────────────────
// EMISSÃO DE ACESSO
//
// Estas funções são PURAS de propósito: `/admin/usuarios/novo` é um componente
// cliente e precisa delas pra montar a lista de perfis. Se morassem em
// `acesso-emissao.ts` — que importa Prisma — o import arrastaria o cliente
// Prisma pro bundle do browser. A regra que toca o banco
// (`verificarPreAutorizacao`) fica lá, e só o servidor a usa.
// ─────────────────────────────────────────────────────────────────────────────

/** Quem pode emitir acesso pela tela. */
export const EMISSAO_ROLES: UserRole[] = ["ADMIN", "FINANCEIRO", "POS_VENDA"];

/**
 * Roles que dão acesso ao painel administrativo. Só ADMIN atribui — senão
 * FINANCEIRO/POS_VENDA poderiam se promover criando um ADMIN novo, o que
 * transformaria a abertura do cadastro numa escalada de privilégio.
 */
const ROLES_PRIVILEGIADOS: UserRole[] = ["ADMIN", "GESTOR", "FINANCEIRO"];

export function podeEmitirAcesso(role: string): boolean {
  return EMISSAO_ROLES.includes(role as UserRole);
}

/** Subconjunto de ASSIGNABLE_ROLES que este operador pode atribuir. */
export function rolesAtribuiveisPor(role: string): UserRole[] {
  if (!podeEmitirAcesso(role)) return [];
  if (role === "ADMIN") return [...ASSIGNABLE_ROLES];
  return ASSIGNABLE_ROLES.filter((r) => !ROLES_PRIVILEGIADOS.includes(r));
}

/**
 * Um operador pode mexer num usuário já existente?
 *
 * ADMIN mexe em todos. FINANCEIRO/POS_VENDA não tocam em conta privilegiada —
 * sem esta guarda, abrir a tela de usuários pra eles daria, de brinde, o poder
 * de desativar um ADMIN ou rebaixá-lo.
 */
export function podeGerenciarUsuario(operadorRole: string, alvoRole: string): boolean {
  if (!podeEmitirAcesso(operadorRole)) return false;
  if (operadorRole === "ADMIN") return true;
  return !ROLES_PRIVILEGIADOS.includes(alvoRole as UserRole);
}

// Roles que podem gerenciar usuários
export const USER_MANAGEMENT_ROLES: UserRole[] = ["ADMIN", "FINANCEIRO", "POS_VENDA"];

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
    case "CLIENTE_BS":
      return "/portal-cliente";
    default:
      return "/login";
  }
}

/**
 * Convite de cadastro (login/senha) do cliente Brasil Solar via Clerk.
 *
 * O Clerk envia o e-mail de convite e hospeda a tela de sign-up. O
 * publicMetadata definido aqui (role + proprietarioId) é aplicado ao usuário
 * quando ele aceita — e o webhook do Clerk (user.created) usa o proprietarioId
 * para vincular `BrasilSolarProprietario.clerkUserId`.
 *
 * ⚠️ Enviar convite = ENVIAR E-MAIL. Este helper só deve ser chamado a partir de
 * uma ação explícita do admin, nunca automaticamente.
 */
import { clerkClient } from "@clerk/nextjs/server";
import { getHomeRoute } from "@/lib/roles";
import type { UserRole } from "@/types/next-auth";

function baseUrl(): string {
  return (
    process.env.APP_BASE_URL ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

export interface EnviarConviteInput {
  email: string;
  proprietarioId: string;
}

export interface EnviarConviteResult {
  invitationId: string;
  email: string;
}

/**
 * Cria um convite Clerk para o cliente e dispara o e-mail de cadastro.
 * Idempotente do lado do Clerk via ignoreExisting (não duplica convite ativo).
 */
export async function enviarConviteCadastroCliente(
  input: EnviarConviteInput,
): Promise<EnviarConviteResult> {
  const client = await clerkClient();
  const invitation = await client.invitations.createInvitation({
    emailAddress: input.email,
    publicMetadata: {
      role: "CLIENTE_BS",
      proprietarioId: input.proprietarioId,
    },
    redirectUrl: `${baseUrl()}/portal-cliente`,
    ignoreExisting: true,
  });
  return { invitationId: invitation.id, email: input.email };
}

export interface EnviarConviteUsuarioInput {
  email: string;
  role: UserRole;
}

/**
 * Convite de acesso para usuário do sistema (funcionário, investidor,
 * consumidor) emitido em /admin/usuarios.
 *
 * Existe porque o cadastro pela tela grava só a linha local: quem autentica é o
 * Clerk, e sem uma identidade lá a pessoa não entra. Até 31/08/2026 o buraco era
 * tapado pelo auto-cadastro no Account Portal — a pessoa se registrava sozinha e
 * `ensureLocalUser` adotava a linha pelo e-mail. Fechada essa porta, o convite
 * passa a ser o único caminho, e o `role` no publicMetadata é o que prova pra
 * `verificarPreAutorizacao()` que o acesso foi EMITIDO.
 *
 * ⚠️ Enviar convite = ENVIAR E-MAIL. Só a partir de ação explícita do operador.
 */
export async function enviarConviteAcessoUsuario(
  input: EnviarConviteUsuarioInput,
): Promise<EnviarConviteResult> {
  const client = await clerkClient();
  const invitation = await client.invitations.createInvitation({
    emailAddress: input.email,
    publicMetadata: { role: input.role },
    redirectUrl: `${baseUrl()}${getHomeRoute(input.role)}`,
    ignoreExisting: true,
  });
  return { invitationId: invitation.id, email: input.email };
}

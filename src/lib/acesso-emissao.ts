/**
 * Regra única de EMISSÃO DE ACESSO.
 *
 * Decisão de 31/08/2026: ninguém entra por auto-cadastro. Todo login novo é
 * emitido por um operador (ADMIN, FINANCEIRO ou PÓS-VENDA). O gatilho foi uma
 * conta criada sozinha no Account Portal do Clerk
 * (https://ethical-monitor-22.accounts.dev/sign-up, sign_up.mode = "public"),
 * que o webhook materializou como INVESTOR ativo sem nenhum vínculo.
 *
 * ⚠️ Fechar o sign-up no painel do Clerk NÃO basta e, sozinho, não é confiável:
 * é configuração fora do repositório, some numa troca de instância e não deixa
 * rastro em code review. Por isso a trava real mora AQUI — mesmo que o portal
 * do Clerk volte a aceitar cadastro público, a conta nasce `active: false` e
 * `auth-compat.ts` recusa a sessão. São defesas independentes de propósito.
 *
 * Os três caminhos legítimos abaixo têm um traço em comum: em todos, um
 * operador já registrou aquela pessoa ANTES de ela aparecer no Clerk.
 */
import { prisma } from "@/lib/prisma";
import { ASSIGNABLE_ROLES } from "@/lib/roles";
import type { UserRole } from "@/types/next-auth";

export interface PreAutorizacao {
  autorizado: boolean;
  /** Aparece no log quando um cadastro é recusado — é o que explica o "por quê". */
  motivo: string;
  /** Role a aplicar quando autorizado; null deixa o chamador decidir. */
  role: UserRole | null;
}

const RECUSADO: PreAutorizacao = {
  autorizado: false,
  motivo: "sem convite, sem pré-cadastro e sem proprietário BS com acesso",
  role: null,
};

function roleDoMetadata(publicMetadata: unknown): UserRole | null {
  if (publicMetadata && typeof publicMetadata === "object") {
    const role = (publicMetadata as Record<string, unknown>).role;
    if (typeof role === "string" && (ASSIGNABLE_ROLES as string[]).concat("CLIENTE_BS").includes(role)) {
      return role as UserRole;
    }
  }
  return null;
}

/**
 * Uma conta Clerk só vira acesso se um operador já a tinha registrado.
 *
 * 1. Convite Clerk emitido pelo painel — o `role` viaja no publicMetadata.
 * 2. Pré-cadastro no painel: existe linha em `users` com o e-mail e `clerkId`
 *    NULL, esperando a pessoa criar a conta. O role cadastrado manda.
 * 3. Cliente Brasil Solar com acesso liberado: existe `BrasilSolarProprietario`
 *    ativo, com `acesso`, no mesmo e-mail. Vira CLIENTE_BS.
 *
 * Qualquer outra origem é auto-cadastro e não vira acesso.
 */
export async function verificarPreAutorizacao(
  email: string,
  publicMetadata: unknown,
): Promise<PreAutorizacao> {
  const roleConvite = roleDoMetadata(publicMetadata);
  if (roleConvite) {
    return { autorizado: true, motivo: "convite Clerk com role no metadata", role: roleConvite };
  }

  const preCadastro = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { role: true, clerkId: true },
  });
  if (preCadastro) {
    // Linha já vinculada a uma conta Clerk: não é pré-cadastro esperando dono,
    // é um login que já existe. Autoriza — quem resolve colisão de identidade é
    // a adoção por e-mail em auth-compat, não esta função.
    return {
      autorizado: true,
      motivo: preCadastro.clerkId ? "usuário local já vinculado" : "pré-cadastro no painel",
      role: preCadastro.role as UserRole,
    };
  }

  const proprietario = await prisma.brasilSolarProprietario.findFirst({
    where: {
      email: { equals: email, mode: "insensitive" },
      active: true,
      acesso: { isNot: null },
    },
    select: { id: true },
  });
  if (proprietario) {
    return { autorizado: true, motivo: "proprietário Brasil Solar com acesso liberado", role: "CLIENTE_BS" };
  }

  return RECUSADO;
}

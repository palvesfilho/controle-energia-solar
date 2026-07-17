/**
 * Escopo de segurança das rotas do portal do cliente Brasil Solar.
 *
 * Resolve o proprietário SEMPRE a partir do usuário logado no Clerk
 * (`clerkUserId`), NUNCA de um id vindo do cliente. Assim, mesmo que o cliente
 * manipule a URL, ele só acessa os relatórios do próprio proprietário.
 */
import { currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export interface PortalProprietario {
  id: string;
  nome: string;
  codigoUc: string | null;
  /** Acesso liberado (status ATIVO — cobre pago confirmado e cortesia). */
  acessoAtivo: boolean;
}

/**
 * Retorna o proprietário Brasil Solar vinculado ao usuário Clerk logado, ou
 * `null` se não houver login ou vínculo. Os relatórios em PDF são a entrega
 * paga: `acessoAtivo` indica se o download pode ser liberado.
 */
export async function resolvePortalProprietario(): Promise<PortalProprietario | null> {
  const user = await currentUser();
  if (!user) return null;

  const prop = await prisma.brasilSolarProprietario.findFirst({
    where: { clerkUserId: user.id, active: true },
    select: {
      id: true,
      nome: true,
      codigoUc: true,
      acesso: { select: { status: true } },
    },
  });
  if (!prop) return null;

  return {
    id: prop.id,
    nome: prop.nome,
    codigoUc: prop.codigoUc,
    acessoAtivo: prop.acesso?.status === "ATIVO",
  };
}

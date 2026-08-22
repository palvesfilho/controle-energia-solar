import { canAccessSection, isAdminRole } from "@/lib/roles";

/**
 * Regra única de quem faz o quê na Lista de Materiais. As rotas e a tela
 * consultam daqui — permissão espalhada é meia correção que falha calada.
 *
 * Ciclo: RASCUNHO → (Gerar Lista) → LIBERADA → (fechar retirada) → RETIRADA
 *
 * Quem monta a lista é o escritório; quem separa e entrega o material é o
 * gestor de obras. Por isso GESTOR_OBRA lê a lista mas não a edita: o que é
 * dele é a coluna de separação e o bloco de retirada.
 */

export type ListaStatus = "RASCUNHO" | "LIBERADA" | "RETIRADA";

function temAcessoObra(role: string | null | undefined): boolean {
  return canAccessSection(role, "obra");
}

/** Edita itens/quantidades/observações da lista (montagem). */
export function podeEditarLista(
  role: string | null | undefined,
  status: string
): boolean {
  if (!temAcessoObra(role)) return false;
  if (role === "GESTOR_OBRA") return false;
  return status !== "RETIRADA";
}

/** Clica em "Gerar Lista" (gera o PDF e libera para o gestor de obras). */
export function podeLiberarLista(
  role: string | null | undefined,
  status: string
): boolean {
  return podeEditarLista(role, status);
}

/** Marca separado, ajusta quantidade separada, sobe foto, assina, fecha. */
export function podeSepararLista(
  role: string | null | undefined,
  status: string
): boolean {
  if (!temAcessoObra(role)) return false;
  return status === "LIBERADA";
}

/** Reabre uma retirada já fechada — só o trio administrativo. */
export function podeReabrirLista(
  role: string | null | undefined,
  status: string
): boolean {
  if (!role || !isAdminRole(role)) return false;
  return status === "RETIRADA";
}

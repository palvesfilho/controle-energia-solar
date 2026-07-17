import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { listarRelatoriosProprietario } from "@/lib/brasil-solar-relatorio";

/**
 * GET /api/brasil-solar/proprietarios/[id]/relatorios
 *
 * Lista as UCs do proprietário Brasil Solar. Inclui a UC titular (mesmo
 * codigoUc do proprietário) + beneficiárias ativas (autoconsumo remoto
 * com rateio). Cada UC vira um relatório próprio.
 *
 * A montagem da lista fica em `listarRelatoriosProprietario` (compartilhada
 * com o portal do cliente).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const result = await listarRelatoriosProprietario(id);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // A tela admin espera { proprietario, ucs }.
  return NextResponse.json({
    proprietario: result.proprietario,
    ucs: result.ucs,
  });
}

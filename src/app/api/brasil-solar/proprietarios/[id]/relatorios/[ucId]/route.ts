import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { getProprietarioRelatorio } from "@/lib/brasil-solar-relatorio";

/**
 * GET /api/brasil-solar/proprietarios/[id]/relatorios/[ucId]
 *
 * Retorna 12 meses de cruzamento geração × fatura para a UC informada.
 * Lógica de cruzamento e cálculo de payback em src/lib/brasil-solar-relatorio.ts.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; ucId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id, ucId } = await params;
  const result = await getProprietarioRelatorio(id, ucId);

  if ("error" in result) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }
  return NextResponse.json(result);
}

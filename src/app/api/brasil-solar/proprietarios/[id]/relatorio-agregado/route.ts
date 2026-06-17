import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { getProprietarioRelatorioAgregado } from "@/lib/brasil-solar-relatorio";

/**
 * GET /api/brasil-solar/proprietarios/[id]/relatorio-agregado
 *
 * Relatório consolidado do proprietário Brasil Solar com beneficiárias
 * (autoconsumo remoto). Agrega economia, compensação e fatura RGE das N
 * beneficiárias por mês e expõe breakdown por UC no mês de referência.
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
  const result = await getProprietarioRelatorioAgregado(id);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}

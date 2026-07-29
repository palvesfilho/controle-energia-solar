import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { getAcoesComerciaisProprietario } from "@/lib/acao-comercial";

/**
 * GET /api/brasil-solar/proprietarios/[id]/acao-comercial
 *
 * Oportunidades comerciais do proprietário, derivadas do MESMO diagnóstico
 * determinístico que sai no relatório do cliente (`avaliarSituacaoUsina` /
 * `avaliarSituacaoRateio`). Nada de IA: mesma base de faturas → mesma lista.
 *
 * Percorre as faturas e o monitoramento de cada UC, então é uma rota lenta —
 * chamada sob demanda pelo botão "Ação comercial", nunca no carregamento da
 * tela.
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
  const result = await getAcoesComerciaisProprietario(id);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}

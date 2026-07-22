import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { getPortalSerieGeracao, parseAnoMes } from "@/lib/portal-cliente-data";

export const runtime = "nodejs";

/**
 * GET /api/admin/brasil-solar/portal-preview/geracao/mensal?proprietarioId=&ano=&mes=
 *
 * Espelho admin de `/api/portal-cliente/geracao/mensal` para a "Visão do
 * cliente" do pós-venda. Protegido pela section `brasilSolar`.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const sp = new URL(req.url).searchParams;
  const proprietarioId = sp.get("proprietarioId");
  if (!proprietarioId) {
    return NextResponse.json({ error: "proprietarioId obrigatório" }, { status: 400 });
  }

  const { ano, mes } = parseAnoMes(sp);
  return NextResponse.json(await getPortalSerieGeracao(proprietarioId, ano, mes));
}

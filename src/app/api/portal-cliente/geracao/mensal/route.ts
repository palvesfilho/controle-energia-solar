import { NextRequest, NextResponse } from "next/server";
import { resolvePortalProprietario } from "@/lib/portal-cliente-auth";
import { getPortalSerieGeracao, parseAnoMes } from "@/lib/portal-cliente-data";

export const runtime = "nodejs";

/**
 * GET /api/portal-cliente/geracao/mensal?ano=2026[&mes=7]
 *
 * Série do gráfico "Geração Mensal": sem `mes`, 12 barras (uma por mês do ano);
 * com `mes`, uma barra por dia do mês. Escopo pelo `clerkUserId` do logado.
 */
export async function GET(req: NextRequest) {
  const prop = await resolvePortalProprietario();
  if (!prop) {
    return NextResponse.json(
      { error: "Conta não vinculada a um proprietário" },
      { status: 404 },
    );
  }

  const { ano, mes } = parseAnoMes(new URL(req.url).searchParams);
  return NextResponse.json(await getPortalSerieGeracao(prop.id, ano, mes));
}

import { NextRequest, NextResponse } from "next/server";
import { resolvePortalProprietario } from "@/lib/portal-cliente-auth";
import { getPortalCurvaDia, hojeBrtYmd, parseYmd } from "@/lib/portal-cliente-data";

export const runtime = "nodejs";

/**
 * GET /api/portal-cliente/geracao/dia?data=YYYY-MM-DD
 *
 * Curva intradiária (kW × hora) do dia escolhido pelo cliente no portal, mais
 * o estado de comunicação (online/offline) das usinas. O proprietário é sempre
 * resolvido pelo `clerkUserId` do logado — nunca por id na URL.
 */
export async function GET(req: NextRequest) {
  const prop = await resolvePortalProprietario();
  if (!prop) {
    return NextResponse.json(
      { error: "Conta não vinculada a um proprietário" },
      { status: 404 },
    );
  }

  const data = parseYmd(new URL(req.url).searchParams.get("data")) ?? hojeBrtYmd();
  return NextResponse.json(await getPortalCurvaDia(prop.id, data));
}

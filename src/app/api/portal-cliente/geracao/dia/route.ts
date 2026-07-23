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

  const sp = new URL(req.url).searchParams;
  const data = parseYmd(sp.get("data")) ?? hojeBrtYmd();
  // `refresh=1`: coleta as amostras do dia na Sungrow antes de responder (só
  // vale para hoje/ontem). É como o cliente enxerga o dia atual mesmo quando o
  // cron de coleta ainda não passou.
  const refresh = sp.get("refresh") === "1";
  return NextResponse.json(await getPortalCurvaDia(prop.id, data, { refresh }));
}

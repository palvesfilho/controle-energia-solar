import { NextRequest, NextResponse } from "next/server";
import { getCobrancaView } from "@/lib/portal-cobranca";

// GET /api/portal/cobranca/[token]
// Rota PÚBLICA (ver proxy.ts): o pagador ainda não tem conta. A chave é o
// conviteToken (UUID). Retorna só a visão pública da cobrança.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const view = await getCobrancaView(token);
  if (!view) {
    return NextResponse.json({ error: "Cobrança não encontrada." }, { status: 404 });
  }
  return NextResponse.json(view);
}

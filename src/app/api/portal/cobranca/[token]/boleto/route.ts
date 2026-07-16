import { NextRequest, NextResponse } from "next/server";
import { getBoletoDaCobranca } from "@/lib/portal-cobranca";
import { AsaasError } from "@/lib/asaas";

// GET /api/portal/cobranca/[token]/boleto — linha digitável + PDF (rota pública).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  try {
    const boleto = await getBoletoDaCobranca(token);
    if (!boleto) {
      return NextResponse.json(
        { error: "Cobrança não encontrada ou sem boleto disponível." },
        { status: 404 },
      );
    }
    return NextResponse.json(boleto);
  } catch (e) {
    if (e instanceof AsaasError) {
      console.error("[portal/boleto] Asaas:", e.status, e.body);
      return NextResponse.json(
        { error: "Não foi possível gerar o boleto agora. Tente novamente." },
        { status: 502 },
      );
    }
    throw e;
  }
}

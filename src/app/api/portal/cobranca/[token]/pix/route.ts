import { NextRequest, NextResponse } from "next/server";
import { getPixDaCobranca } from "@/lib/portal-cobranca";
import { AsaasError } from "@/lib/asaas";

// GET /api/portal/cobranca/[token]/pix — QR + copia-e-cola do PIX (rota pública).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  try {
    const pix = await getPixDaCobranca(token);
    if (!pix) {
      return NextResponse.json(
        { error: "Cobrança não encontrada ou sem PIX disponível." },
        { status: 404 },
      );
    }
    return NextResponse.json(pix);
  } catch (e) {
    if (e instanceof AsaasError) {
      console.error("[portal/pix] Asaas:", e.status, e.body);
      return NextResponse.json(
        { error: "Não foi possível gerar o PIX agora. Tente novamente." },
        { status: 502 },
      );
    }
    throw e;
  }
}

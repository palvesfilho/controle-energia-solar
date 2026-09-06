/** GET /api/fatura/[token]/boleto — linha digitável + PDF. Rota pública (ver proxy.ts). */
import { NextRequest, NextResponse } from "next/server";
import { getBoletoDaFatura } from "@/lib/fatura-publica";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  try {
    const boleto = await getBoletoDaFatura(token);
    if (!boleto) {
      return NextResponse.json({ error: "Boleto indisponível." }, { status: 404 });
    }
    return NextResponse.json(boleto);
  } catch (err) {
    console.error("[fatura-publica] boleto falhou:", err);
    return NextResponse.json({ error: "Boleto indisponível no momento." }, { status: 503 });
  }
}

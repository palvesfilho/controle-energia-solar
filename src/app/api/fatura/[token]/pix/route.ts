/** GET /api/fatura/[token]/pix — QR + copia-e-cola. Rota pública (ver proxy.ts). */
import { NextRequest, NextResponse } from "next/server";
import { getPixDaFatura } from "@/lib/fatura-publica";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  try {
    const pix = await getPixDaFatura(token);
    if (!pix) {
      return NextResponse.json({ error: "PIX indisponível." }, { status: 404 });
    }
    return NextResponse.json(pix);
  } catch (err) {
    // O Asaas fora do ar não pode virar 500 numa tela de cliente: a página
    // mostra "indisponível agora" e o boleto continua servindo.
    console.error("[fatura-publica] pix falhou:", err);
    return NextResponse.json({ error: "PIX indisponível no momento." }, { status: 503 });
  }
}

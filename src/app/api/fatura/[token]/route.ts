/**
 * GET /api/fatura/[token] — visão pública da fatura de energia.
 *
 * Rota PÚBLICA (declarada em `proxy.ts`): o pagador não tem conta. A chave é o
 * `tokenPublico` da cobrança, e é a rota que o valida — não a sessão.
 *
 * Devolve só o que a tela de pagamento mostra. Ver `lib/fatura-publica.ts`.
 */
import { NextRequest, NextResponse } from "next/server";
import { getFaturaView } from "@/lib/fatura-publica";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const view = await getFaturaView(token);
  // 404 para qualquer motivo, de propósito: distinguir "não existe" de "não
  // pode" deixaria alguém enumerar tokens válidos pela mensagem de erro.
  if (!view) {
    return NextResponse.json({ error: "Fatura não encontrada." }, { status: 404 });
  }
  return NextResponse.json(view);
}

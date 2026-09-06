/**
 * GET /api/fatura/[token]/demonstrativo — o MESMO PDF que foi anexado ao email.
 *
 * Rota PÚBLICA (declarada em `proxy.ts`): é o link que vai na mensagem de
 * WhatsApp, onde o cliente não tem — e nunca terá — sessão.
 *
 * 🔒 **A chave do arquivo é DERIVADA do billing**, via `chaveDoDemonstrativo`.
 * Nunca lida da URL, nunca tirada de `demonstrativoUrl`. Numa rota pública,
 * montar caminho de storage com dado do cliente é abrir o bucket inteiro — e o
 * `/api/files/[...path]`, que aceita caminho, existe justamente atrás de sessão
 * de admin por causa disso.
 */
import { NextRequest, NextResponse } from "next/server";
import { readFromStorage } from "@/lib/file-storage";
import { gerarESalvarDemonstrativo } from "@/lib/demonstrativo-pdf";
import {
  chaveDoDemonstrativo,
  nomeDoDemonstrativo,
  resolverFaturaPorToken,
} from "@/lib/fatura-publica";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const ctx = await resolverFaturaPorToken(token);
  if (!ctx) {
    return NextResponse.json({ error: "Fatura não encontrada." }, { status: 404 });
  }

  const chave = chaveDoDemonstrativo(ctx);
  let arquivo = await readFromStorage(chave);

  // Cobrança emitida antes de o PDF existir (ou storage limpo): gera na hora em
  // vez de mostrar erro. Quem abriu o link quer o documento, não a explicação.
  if (!arquivo) {
    try {
      await gerarESalvarDemonstrativo(ctx.billingId);
      arquivo = await readFromStorage(chave);
    } catch (err) {
      console.error("[fatura-publica] falha ao gerar demonstrativo sob demanda:", err);
    }
  }

  if (!arquivo) {
    return NextResponse.json(
      { error: "Demonstrativo indisponível no momento." },
      { status: 503 },
    );
  }

  return new NextResponse(new Uint8Array(arquivo.data), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(arquivo.size),
      // `inline` para abrir no navegador do celular, que é de onde o cliente
      // clica no link do WhatsApp; o nome vale se ele escolher baixar.
      "Content-Disposition": `inline; filename="${nomeDoDemonstrativo(ctx)}"`,
      // Documento financeiro de UMA pessoa: não pode ficar em cache de CDN
      // nem de proxy compartilhado.
      "Cache-Control": "private, no-store",
    },
  });
}

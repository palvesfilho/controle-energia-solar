import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { buscarDocumentoAdesao, corrigirMojibake } from "@/lib/crm-supabase";
import { lerDocumentoDoCrm } from "@/lib/crm-documentos";

/**
 * Serve um anexo da adesão, lido ao vivo do bucket do CRM.
 *
 * Nada é copiado para cá — ver [[crm-documentos]]. O arquivo é entregue inline
 * para abrir no visualizador do navegador.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session || !canAccessSection(session.user.role, "crmIntegracao")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const documentoId = Number(id);
  if (!Number.isInteger(documentoId)) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  try {
    const doc = await buscarDocumentoAdesao(documentoId);
    if (!doc) {
      return NextResponse.json({ error: "Documento não existe no CRM." }, { status: 404 });
    }
    // A fatura de energia não é importada por decisão do Paulo (15/08/2026):
    // serve à conferência de comissão do vendedor e fica no CRM. Bloqueado
    // aqui também, não só na listagem, para a regra não ter duas versões.
    if (doc.categoria === "fatura_energia") {
      return NextResponse.json(
        { error: "Fatura de energia não é servida pelo Gestor — consulte no CRM." },
        { status: 403 },
      );
    }
    if (!doc.r2_key) {
      return NextResponse.json({ error: "Documento sem arquivo no CRM." }, { status: 404 });
    }

    const conteudo = await lerDocumentoDoCrm(doc.r2_key);
    if (!conteudo) {
      return NextResponse.json(
        { error: `Arquivo não encontrado no bucket do CRM: ${doc.r2_key}` },
        { status: 404 },
      );
    }

    const nome = corrigirMojibake(doc.nome_arquivo) || `documento-${documentoId}`;
    return new NextResponse(new Uint8Array(conteudo), {
      headers: {
        "Content-Type": doc.mime || "application/octet-stream",
        "Content-Length": String(conteudo.length),
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(nome)}`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/crm/documento/[id]] erro:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

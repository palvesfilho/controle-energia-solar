import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { buscarPdfAssinado } from "@/lib/crm-supabase";

/**
 * Serve o PDF do Termo de Adesão assinado.
 *
 * O PDF vive em base64 na coluna `envelopes_assinatura.pdf_termo_assinado` do
 * CRM (~330 KB cada). É buscado só quando alguém clica — trazer os 24 a cada
 * sync seriam ~8 MB para exibir uma data de assinatura.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ envelopeId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session || !canAccessSection(session.user.role, "crmIntegracao")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { envelopeId } = await params;
  // O id é UUID e vai direto num filtro do PostgREST: valida o formato para
  // não deixar entrar texto arbitrário na querystring.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(envelopeId)) {
    return NextResponse.json({ error: "envelopeId inválido" }, { status: 400 });
  }

  // O mesmo envelope guarda os dois documentos assinados.
  const procuracao = req.nextUrl.searchParams.get("tipo") === "procuracao";

  try {
    const base64 = await buscarPdfAssinado(envelopeId, procuracao ? "procuracao" : "termo");
    if (!base64) {
      return NextResponse.json(
        {
          error: procuracao
            ? "Envelope sem procuração assinada no CRM."
            : "Envelope sem termo assinado no CRM.",
        },
        { status: 404 },
      );
    }

    const pdf = Buffer.from(base64, "base64");
    const nome = procuracao ? "procuracao" : "termo-adesao";
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdf.length),
        "Content-Disposition": `inline; filename="${nome}-${envelopeId.slice(0, 8)}.pdf"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/crm/termo/[envelopeId]] erro:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

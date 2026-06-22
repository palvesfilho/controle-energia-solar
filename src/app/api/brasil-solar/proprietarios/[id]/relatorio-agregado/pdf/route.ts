import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { renderToBuffer } from "@react-pdf/renderer";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { getProprietarioRelatorioAgregado } from "@/lib/brasil-solar-relatorio";
import { SolarPaybackReportProprietarioPDF } from "@/components/billing/solar-payback-report-proprietario-pdf";

export const runtime = "nodejs";

/**
 * GET /api/brasil-solar/proprietarios/[id]/relatorio-agregado/pdf?ano=&mes=
 * Gera o PDF consolidado do proprietário (autoconsumo remoto com beneficiárias).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const anoQ = Number(searchParams.get("ano"));
  const mesQ = Number(searchParams.get("mes"));
  const result = await getProprietarioRelatorioAgregado(id);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const mesRefAlvo =
    Number.isInteger(anoQ) && Number.isInteger(mesQ) && mesQ >= 1 && mesQ <= 12
      ? result.meses.find((m) => m.ano === anoQ && m.mes === mesQ) ?? null
      : result.meses.length > 0
        ? result.meses[result.meses.length - 1]
        : null;

  const emissao = new Date().toLocaleDateString("pt-BR");
  const pdfBuffer = await renderToBuffer(
    SolarPaybackReportProprietarioPDF({
      data: result,
      emissao,
      mesRef: mesRefAlvo,
    }),
  );

  const proprietarioToken = sanitizeForFilename(result.proprietario.nome);
  const mesToken = mesRefAlvo ? String(mesRefAlvo.mes) : "X";
  const anoToken = mesRefAlvo ? String(mesRefAlvo.ano) : "X";
  const filenameUtf8 = `RELATÓRIO_${proprietarioToken}_${mesToken}_${anoToken}.pdf`;
  const filenameAscii = `RELATORIO_${proprietarioToken}_${mesToken}_${anoToken}.pdf`;

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filenameAscii}"; filename*=UTF-8''${encodeURIComponent(filenameUtf8)}`,
      "Cache-Control": "no-store",
    },
  });
}

function sanitizeForFilename(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .toUpperCase();
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { renderToBuffer } from "@react-pdf/renderer";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { getProprietarioRelatorio } from "@/lib/brasil-solar-relatorio";
import { SolarPaybackReportPDF } from "@/components/billing/solar-payback-report-pdf";

export const runtime = "nodejs";

/**
 * GET /api/brasil-solar/proprietarios/[id]/relatorios/[ucId]/pdf?ano=&mes=
 * Gera o PDF do relatório de geração × consumo × payback.
 * Query opcional `ano`/`mes` define o mês de referência destacado nos KPIs;
 * default = mês mais recente disponível.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; ucId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id, ucId } = await params;
  const { searchParams } = new URL(req.url);
  const anoQ = Number(searchParams.get("ano"));
  const mesQ = Number(searchParams.get("mes"));
  const result = await getProprietarioRelatorio(id, ucId);
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
    SolarPaybackReportPDF({ data: result, emissao, mesRef: mesRefAlvo }),
  );

  // Formato: RELATÓRIO_<UC>_<PROPRIETÁRIO>_<MÊS>_<ANO>.pdf
  // Servimos duas versões no header: ASCII (sem acento) como filename clássico,
  // e UTF-8 percent-encoded (RFC 5987) com o "RELATÓRIO" acentuado como
  // filename* — browsers modernos preferem este.
  const proprietarioToken = sanitizeForFilename(result.proprietario.nome);
  const ucToken = sanitizeForFilename(result.uc.codigoUc);
  const mesToken = mesRefAlvo ? String(mesRefAlvo.mes) : "X";
  const anoToken = mesRefAlvo ? String(mesRefAlvo.ano) : "X";
  const filenameUtf8 = `RELATÓRIO_${ucToken}_${proprietarioToken}_${mesToken}_${anoToken}.pdf`;
  const filenameAscii = `RELATORIO_${ucToken}_${proprietarioToken}_${mesToken}_${anoToken}.pdf`;

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filenameAscii}"; filename*=UTF-8''${encodeURIComponent(filenameUtf8)}`,
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Limpa um trecho pra usar como token em nome de arquivo:
 *  - tira acentos
 *  - troca espaços por "_"
 *  - remove caracteres proibidos em nomes de arquivo (\ / : * ? " < > |)
 *  - uppercase
 */
function sanitizeForFilename(s: string): string {
  // ̀-ͯ = combining diacritical marks (acentos após NFD)
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .toUpperCase();
}

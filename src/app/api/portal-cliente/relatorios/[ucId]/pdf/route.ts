import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { resolvePortalProprietario } from "@/lib/portal-cliente-auth";
import { getProprietarioRelatorio } from "@/lib/brasil-solar-relatorio";
import { SolarPaybackReportPDF } from "@/components/billing/solar-payback-report-pdf";
import { sanitizeForFilename } from "@/lib/relatorio-filename";

export const runtime = "nodejs";

/**
 * GET /api/portal-cliente/relatorios/[ucId]/pdf?ano=&mes=
 *
 * Versão client-safe do PDF do relatório de geração × consumo × payback.
 * O proprietário é resolvido pelo `clerkUserId`; o `getProprietarioRelatorio`
 * ainda valida que a UC pertence a ele (retorna 403 caso contrário), então o
 * cliente não consegue baixar o relatório de outra pessoa mudando o `ucId`.
 *
 * O download exige acesso ATIVO (entrega paga / cortesia).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ucId: string }> },
) {
  const prop = await resolvePortalProprietario();
  if (!prop) {
    return NextResponse.json(
      { error: "Conta não vinculada a um proprietário" },
      { status: 404 },
    );
  }
  if (!prop.acessoAtivo) {
    return NextResponse.json(
      { error: "Acesso pendente — relatórios indisponíveis" },
      { status: 403 },
    );
  }

  const { ucId } = await params;
  const { searchParams } = new URL(req.url);
  const anoQ = Number(searchParams.get("ano"));
  const mesQ = Number(searchParams.get("mes"));

  const result = await getProprietarioRelatorio(prop.id, ucId);
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

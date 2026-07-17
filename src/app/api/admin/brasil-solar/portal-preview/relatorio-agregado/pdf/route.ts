import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { getProprietarioRelatorioAgregado } from "@/lib/brasil-solar-relatorio";
import { SolarPaybackReportProprietarioPDF } from "@/components/billing/solar-payback-report-proprietario-pdf";
import { sanitizeForFilename } from "@/lib/relatorio-filename";

export const runtime = "nodejs";

/**
 * GET /api/admin/brasil-solar/portal-preview/relatorio-agregado/pdf?proprietarioId=&ano=&mes=
 *
 * Versão admin (pós-venda) do PDF consolidado — espelha
 * `/api/portal-cliente/relatorio-agregado/pdf` resolvendo o proprietário por id
 * na query. Só libera com acesso ATIVO (idêntico ao que o cliente veria).
 * Protegida pela section `brasilSolar`.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const proprietarioId = searchParams.get("proprietarioId");
  if (!proprietarioId) {
    return NextResponse.json({ error: "proprietarioId obrigatório" }, { status: 400 });
  }

  const prop = await prisma.brasilSolarProprietario.findUnique({
    where: { id: proprietarioId },
    select: { id: true, acesso: { select: { status: true } } },
  });
  if (!prop) {
    return NextResponse.json({ error: "Proprietário não encontrado" }, { status: 404 });
  }
  if (prop.acesso?.status !== "ATIVO") {
    return NextResponse.json(
      { error: "Acesso pendente — relatórios indisponíveis" },
      { status: 403 },
    );
  }

  const anoQ = Number(searchParams.get("ano"));
  const mesQ = Number(searchParams.get("mes"));

  const result = await getProprietarioRelatorioAgregado(prop.id);
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

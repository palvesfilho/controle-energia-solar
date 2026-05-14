import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { reports, uploadId } = body;

  if (!Array.isArray(reports) || reports.length === 0) {
    return NextResponse.json(
      { error: "Relatorios necessarios" },
      { status: 400 }
    );
  }

  const created = [];

  for (const report of reports) {
    // Find investor by name
    const investor = await prisma.investor.findFirst({
      where: {
        user: {
          name: { contains: report.investorName },
        },
      },
    });

    if (!investor) continue;

    // Find plant (use first associated plant)
    const investorPlant = await prisma.investorPlant.findFirst({
      where: { investorId: investor.id },
    });

    if (!investorPlant) continue;

    const existing = await prisma.monthlyReport.findUnique({
      where: {
        plantId_investorId_ano_mes: {
          plantId: investorPlant.plantId,
          investorId: investor.id,
          ano: report.ano,
          mes: report.mes,
        },
      },
    });

    if (existing) {
      // Update existing
      await prisma.monthlyReport.update({
        where: { id: existing.id },
        data: {
          injecaoPeriodo: report.injecaoPeriodo,
          creditosAnteriores: report.creditosAnteriores,
          creditosUtilizados: report.creditosUtilizados,
          consumoInstantaneo: report.consumoInstantaneo,
          autoConsumoUsina: report.autoConsumoUsina,
          creditosAtuais: report.creditosAtuais,
          creditosVencer: report.creditosVencer,
          creditosUtilizadosFin: report.creditosUtilizadosFin,
          valorKwhContrato: report.valorKwhContrato,
          valorBrutoGerador: report.valorBrutoGerador,
          gestaoMensalFixa: report.gestaoMensalFixa,
          taxaMinimaConc: report.taxaMinimaConc,
          inadimplencia: report.inadimplencia,
          multasOutros: report.multasOutros,
          remuneracaoPeriodo: report.remuneracaoPeriodo,
          observacoes: report.observacoes,
          uploadId,
        },
      });
      created.push(existing.id);
    } else {
      // Create new
      const newReport = await prisma.monthlyReport.create({
        data: {
          plantId: investorPlant.plantId,
          investorId: investor.id,
          ano: report.ano,
          mes: report.mes,
          status: "DRAFT",
          injecaoPeriodo: report.injecaoPeriodo,
          creditosAnteriores: report.creditosAnteriores,
          creditosUtilizados: report.creditosUtilizados,
          consumoInstantaneo: report.consumoInstantaneo,
          autoConsumoUsina: report.autoConsumoUsina,
          creditosAtuais: report.creditosAtuais,
          creditosVencer: report.creditosVencer,
          creditosUtilizadosFin: report.creditosUtilizadosFin,
          valorKwhContrato: report.valorKwhContrato,
          valorBrutoGerador: report.valorBrutoGerador,
          gestaoMensalFixa: report.gestaoMensalFixa,
          taxaMinimaConc: report.taxaMinimaConc,
          inadimplencia: report.inadimplencia,
          multasOutros: report.multasOutros,
          remuneracaoPeriodo: report.remuneracaoPeriodo,
          observacoes: report.observacoes,
          uploadId,
        },
      });
      created.push(newReport.id);
    }
  }

  // Mark upload as processed
  if (uploadId) {
    await prisma.upload.update({
      where: { id: uploadId },
      data: { processedAt: new Date() },
    });
  }

  return NextResponse.json({ created: created.length, ids: created });
}

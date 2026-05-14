import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { getProprietarioRelatorio } from "@/lib/brasil-solar-relatorio";

/**
 * GET /api/brasil-solar/proprietarios/[id]/relatorios/[ucId]/mes/[ano]/[mes]
 *
 * Retorna o relatório agregado da UC + o mês específico isolado para a view individual.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; ucId: string; ano: string; mes: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id, ucId, ano: anoStr, mes: mesStr } = await params;
  const ano = Number(anoStr);
  const mes = Number(mesStr);

  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
    return NextResponse.json({ error: "Ano inválido" }, { status: 400 });
  }
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    return NextResponse.json({ error: "Mês inválido" }, { status: 400 });
  }

  const result = await getProprietarioRelatorio(id, ucId);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const mesData = result.meses.find((m) => m.ano === ano && m.mes === mes) ?? null;

  // Busca a ConsumerBill correspondente para edição manual / reparse.
  const bill = await prisma.consumerBill.findFirst({
    where: {
      consumerUnitId: ucId,
      anoReferencia: ano,
      mesReferencia: mes,
    },
    select: {
      id: true,
      pdfUrl: true,
      consumoKwh: true,
      energiaCompensada: true,
      energiaInjetadaMedidorKwh: true,
      valorTotal: true,
      tarifaTE: true,
      tarifaTUSD: true,
      dataLeituraAnterior: true,
      dataLeituraAtual: true,
    },
  });

  return NextResponse.json({
    proprietario: result.proprietario,
    uc: result.uc,
    usinasMonitoradas: result.usinasMonitoradas,
    investimentoTotal: result.investimentoTotal,
    potenciaTotalKwp: result.potenciaTotalKwp,
    geracaoEsperadaMensalKwh: result.geracaoEsperadaMensalKwh,
    geracaoEsperadaAnualKwh: result.geracaoEsperadaAnualKwh,
    economiaMediaMensalRs: result.economiaMediaMensalRs,
    retornoTotalPct: result.retornoTotalPct,
    paybackRestanteMeses: result.paybackRestanteMeses,
    paybackQuitacaoPrevista: result.paybackQuitacaoPrevista,
    paybackQuitado: result.paybackQuitado,
    mes: mesData,
    /** Fatura no banco (pode ser null se ainda não foi cadastrada) */
    bill,
    /** Lista todos os meses (somente ano-mes) pra navegação rápida na view */
    mesesDisponiveis: result.meses.map((m) => ({ ano: m.ano, mes: m.mes })),
  });
}

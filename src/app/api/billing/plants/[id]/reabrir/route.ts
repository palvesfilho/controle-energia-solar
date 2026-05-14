import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isFullAdmin } from "@/lib/roles";
import { cancelInvestorDebit } from "@/lib/investor-debits";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

const MES_LABELS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/**
 * POST /api/billing/plants/[id]/reabrir
 *
 * Reabre um faturamento mensal de usina ja encerrado:
 *  - Limpa encerradoEm/encerradoPorUserId/semPagamentoMotivo
 *  - Reverte publicacao do(s) MonthlyReport(s) deste mes (status=DRAFT,
 *    snapshot=null, publishedAt=null) — assim o PDF volta a ser recalculado
 *    no proximo "Gerar pre-visualizacao", em vez de retornar o snapshot
 *    antigo.
 *  - Cancela debitos relacionados ao(s) relatorio(s) daquele mes.
 *
 * Apos terminar os ajustes, ADMIN deve clicar "Publicar" novamente pra
 * regerar o snapshot e clicar "Encerrar mes" pra travar de novo.
 *
 * Apenas role ADMIN.
 */
export async function POST(_req: NextRequest, ctx: RouteCtx) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isFullAdmin(session.user.role)) {
    return NextResponse.json(
      { error: "Apenas ADMIN pode reabrir um mês encerrado." },
      { status: 403 },
    );
  }

  const { id } = await ctx.params;
  const billing = await prisma.plantBilling.findUnique({
    where: { id },
    select: { id: true, plantId: true, ano: true, mes: true, encerradoEm: true },
  });
  if (!billing) {
    return NextResponse.json(
      { error: "Faturamento não encontrado" },
      { status: 404 },
    );
  }
  if (!billing.encerradoEm) {
    return NextResponse.json(
      { error: "Mês não está encerrado." },
      { status: 400 },
    );
  }

  // Reverte publicacao dos relatorios deste mes (todos investidores) +
  // cancela debitos atrelados. Sem isso, PDF continuaria mostrando snapshot
  // antigo apos a reabertura.
  const reportsParaReverter = await prisma.monthlyReport.findMany({
    where: {
      plantId: billing.plantId,
      ano: billing.ano,
      mes: billing.mes,
      status: { not: "DRAFT" },
    },
    select: { id: true, investorId: true },
  });

  const motivoPrefixo = `Saldo negativo do relatorio ${MES_LABELS[billing.mes - 1]}/${billing.ano}`;
  let debitosCancelados = 0;
  for (const r of reportsParaReverter) {
    const debitos = await prisma.investorDebit.findMany({
      where: {
        investorId: r.investorId,
        motivo: { startsWith: motivoPrefixo },
        status: { not: "CANCELADO" },
      },
      select: { id: true },
    });
    for (const d of debitos) {
      await cancelInvestorDebit(d.id, "Reabertura do mês — snapshot do relatório descartado").catch((e) => {
        console.warn(`[reabrir] cancelInvestorDebit falhou pra ${d.id}:`, e);
      });
      debitosCancelados++;
    }
    await prisma.monthlyReport.update({
      where: { id: r.id },
      data: {
        status: "DRAFT",
        snapshotJson: null,
        publishedAt: null,
        publishedByUserId: null,
      },
    });
  }
  console.log(
    `[reabrir] plant=${billing.plantId} ${billing.mes}/${billing.ano}: revertidos ${reportsParaReverter.length} relatorio(s), cancelados ${debitosCancelados} debito(s)`,
  );

  const updated = await prisma.plantBilling.update({
    where: { id },
    data: {
      encerradoEm: null,
      encerradoPorUserId: null,
      // Limpa motivo "sem pagamento" caso o encerramento tenha sido por essa via.
      // Reabertura volta o mes pro estado pre-encerramento.
      semPagamentoMotivo: null,
    },
  });
  return NextResponse.json({
    ok: true,
    billing: updated,
    relatoriosRevertidos: reportsParaReverter.length,
    debitosCancelados,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isFullAdmin } from "@/lib/roles";
import { isMesEncerrado } from "@/lib/mes-encerrado";
import { cancelInvestorDebit } from "@/lib/investor-debits";

const MES_LABELS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

/**
 * POST /api/plants/[id]/monthly-report/reverter-publicacao?ano=2026&mes=4
 *
 * Volta o MonthlyReport (plant+investidor+ano+mes) de PUBLISHED para DRAFT,
 * destravando edicoes/regeneracao. O snapshotJson eh limpo (recalc proxima
 * preview/publish).
 *
 * Se o mes estiver encerrado, exige reabertura primeiro (separacao de
 * responsabilidades: encerramento eh do faturamento da usina; publicacao
 * eh do relatorio do investidor).
 *
 * Apenas role ADMIN.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isFullAdmin(session.user.role)) {
    return NextResponse.json(
      { error: "Apenas ADMIN pode reverter a publicação." },
      { status: 403 },
    );
  }

  const { id: plantId } = await params;
  const { searchParams } = new URL(req.url);
  const ano = Number(searchParams.get("ano"));
  const mes = Number(searchParams.get("mes"));
  if (!Number.isInteger(ano) || !Number.isInteger(mes) || mes < 1 || mes > 12) {
    return NextResponse.json(
      { error: "Parâmetros ano e mes (1-12) são obrigatórios" },
      { status: 400 },
    );
  }

  if (await isMesEncerrado(plantId, ano, mes)) {
    return NextResponse.json(
      {
        error:
          "Mês encerrado. Reabra o faturamento (Reabrir mês) antes de reverter a publicação.",
      },
      { status: 409 },
    );
  }

  const report = await prisma.monthlyReport.findFirst({
    where: { plantId, ano, mes },
    select: { id: true, status: true, investorId: true },
  });
  if (!report) {
    return NextResponse.json(
      { error: "Relatório não encontrado." },
      { status: 404 },
    );
  }
  if (report.status === "DRAFT") {
    return NextResponse.json(
      { error: "Relatório já está em rascunho." },
      { status: 400 },
    );
  }

  // Cancela TODOS os debitos abertos deste relatorio (estado consistente
  // com nao-publicado: sem debito ativo). Republicacao cria do zero.
  const motivoPrefixo = `Saldo negativo do relatorio ${MES_LABELS[mes - 1]}/${ano}`;
  const debitos = await prisma.investorDebit.findMany({
    where: {
      investorId: report.investorId,
      motivo: { startsWith: motivoPrefixo },
      status: { not: "CANCELADO" },
    },
    select: { id: true, motivo: true, status: true },
  });
  console.log(
    `[reverter-publicacao] plant=${plantId} ${mes}/${ano}: cancelando ${debitos.length} debito(s)`,
    debitos,
  );
  for (const d of debitos) {
    await cancelInvestorDebit(d.id, "Reversao de publicacao do relatorio").catch((e) => {
      console.warn(
        `[reverter-publicacao] cancelInvestorDebit falhou pra ${d.id}:`,
        e,
      );
    });
  }

  const updated = await prisma.monthlyReport.update({
    where: { id: report.id },
    data: {
      status: "DRAFT",
      snapshotJson: null,
      publishedAt: null,
      publishedByUserId: null,
    },
  });
  return NextResponse.json({ ok: true, report: updated, debitosCancelados: debitos.length });
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole, isFullAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { parseFaturaPdf } from "@/lib/fatura-pdf-parser";
import { readFromStorage } from "@/lib/file-storage";
import { populateBillingFromBill } from "@/lib/billing-populate";
import { syncInvestorPayablesFromBill } from "@/lib/investor-payables";
import { isMesEncerradoDaConsumerBill } from "@/lib/mes-encerrado";

/**
 * POST /api/admin/faturas-energia/[id]/reparse
 *
 * Re-extrai os dados a partir do PDF salvo no disco e atualiza a ConsumerBill.
 * Útil quando uma fatura foi populada parcialmente (ex.: via API Infosimples
 * sem usar o parser do PDF) e algum campo crítico ficou null.
 *
 * Não sobrescreve `geracaoInversorKwh` (manual ou via API do inversor) — só
 * atualiza os campos do parser.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const bill = await prisma.consumerBill.findUnique({
    where: { id },
    select: { id: true, pdfUrl: true, consumerUnitId: true },
  });
  if (!bill) {
    return NextResponse.json({ error: "Fatura não encontrada" }, { status: 404 });
  }
  if (!bill.pdfUrl) {
    return NextResponse.json(
      { error: "Fatura sem PDF anexado — não há o que re-extrair" },
      { status: 400 },
    );
  }
  if (
    !isFullAdmin(session.user.role) &&
    (await isMesEncerradoDaConsumerBill(id))
  ) {
    return NextResponse.json(
      { error: "Mês encerrado — apenas ADMIN pode reabrir e re-extrair" },
      { status: 403 },
    );
  }

  const file = await readFromStorage(bill.pdfUrl);
  if (!file) {
    return NextResponse.json(
      { error: `PDF não encontrado no storage (${bill.pdfUrl})` },
      { status: 404 },
    );
  }
  const buf = file.data;

  let parsed;
  try {
    parsed = await parseFaturaPdf(new Uint8Array(buf));
  } catch (e) {
    return NextResponse.json(
      { error: `Falha ao parsear PDF: ${e instanceof Error ? e.message : "erro"}` },
      { status: 500 },
    );
  }

  await prisma.consumerBill.update({
    where: { id },
    data: { ...parsed.bill, syncedAt: new Date() },
  });

  await populateBillingFromBill(id).catch(() => {});
  await syncInvestorPayablesFromBill(id).catch(() => {});

  const updated = await prisma.consumerBill.findUnique({
    where: { id },
    select: {
      id: true,
      consumoKwh: true,
      energiaCompensada: true,
      energiaInjetadaMedidorKwh: true,
      leituraInjetadaAnterior: true,
      leituraInjetadaAtual: true,
      valorTotal: true,
      tarifaTE: true,
      tarifaTUSD: true,
    },
  });

  return NextResponse.json({ ok: true, bill: updated });
}

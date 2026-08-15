import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
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
    select: {
      id: true,
      pdfUrl: true,
      consumerUnitId: true,
      tarifasManuaisEm: true,
    },
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

  // `parsed.bill` traz pdfUrl:null e fonteConsulta:"UPLOAD_MANUAL" (defaults do
  // parser). NÃO sobrescrever esses no reparse — senão zera o ponteiro do PDF já
  // salvo e reescreve a fonte. Preserva ambos, atualiza só os campos extraídos.
  const { pdfUrl: _pdfUrl, fonteConsulta: _fonte, ...billData } = parsed.bill;
  void _pdfUrl; void _fonte;

  // Escolha explícita ganha de detecção — inclusive AQUI, no reparse manual.
  // Se o operador digitou TE/TUSD (porque o OCR rotacionado corrompeu a tarifa),
  // re-extrair o PDF não pode apagar o que ele digitou. Sem esta guarda a
  // promessa "o que você preencheu não é sobrescrito" valeria só no sync
  // automático e furaria no botão "Re-extrair do PDF" — meia correção.
  if (bill.tarifasManuaisEm) {
    delete (billData as Record<string, unknown>).tarifaTeComTributos;
    delete (billData as Record<string, unknown>).tarifaTusdComTributos;
  }

  await prisma.consumerBill.update({
    where: { id },
    data: { ...billData, syncedAt: new Date() },
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

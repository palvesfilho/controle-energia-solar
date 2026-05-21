import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { canEditPaidBill, isAdminRole, isFinanceRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { saveBufferToStorage } from "@/lib/file-storage";

const BANCOS_VALIDOS = ["BANRISUL", "C6_BANK", "ASAAS"] as const;
type BancoValido = (typeof BANCOS_VALIDOS)[number];

export const runtime = "nodejs";

/**
 * POST /api/admin/faturas-energia/[id]/pagar
 * Multipart form-data:
 *  - pagoEm: string (ISO date YYYY-MM-DD)
 *  - banco: BANRISUL | C6_BANK | ASAAS
 *  - comprovante: File (opcional — quando fornecido, salva em /uploads/comprovantes-fatura/)
 *
 * Marca a ConsumerBill como paga (contaPaga=true), seta pagoEm, banco e
 * comprovante.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (
    !session?.user ||
    (!isAdminRole(session.user.role) && !isFinanceRole(session.user.role))
  ) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const fd = await req.formData();
  const pagoEmStr = fd.get("pagoEm");
  const banco = fd.get("banco");
  const comprovante = fd.get("comprovante");

  if (typeof pagoEmStr !== "string" || !pagoEmStr) {
    return NextResponse.json({ error: "pagoEm é obrigatório (YYYY-MM-DD)" }, { status: 400 });
  }
  if (typeof banco !== "string" || !BANCOS_VALIDOS.includes(banco as BancoValido)) {
    return NextResponse.json(
      { error: `banco inválido — use um de: ${BANCOS_VALIDOS.join(", ")}` },
      { status: 400 },
    );
  }
  const pagoEm = new Date(`${pagoEmStr}T12:00:00.000Z`);
  if (Number.isNaN(pagoEm.getTime())) {
    return NextResponse.json({ error: "pagoEm com formato inválido" }, { status: 400 });
  }

  const bill = await prisma.consumerBill.findUnique({
    where: { id },
    select: {
      id: true,
      anoReferencia: true,
      mesReferencia: true,
      consumerUnitId: true,
      pagoEm: true,
    },
  });
  if (!bill) {
    return NextResponse.json({ error: "Fatura não encontrada" }, { status: 404 });
  }

  // Edição de registro já existente: só ADMIN ou GESTOR. FINANCEIRO consegue
  // marcar a primeira vez, mas não sobrescrever o que já está lá (preserva auditoria).
  if (bill.pagoEm && !canEditPaidBill(session.user.role)) {
    return NextResponse.json(
      { error: "Fatura já tem pagamento registrado. Apenas ADMIN ou GESTOR pode editar." },
      { status: 403 },
    );
  }

  // Salva comprovante (se enviado).
  let comprovanteUrl: string | undefined;
  let comprovanteAt: Date | undefined;
  if (comprovante instanceof File && comprovante.size > 0) {
    const arrayBuffer = await comprovante.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const ext = comprovante.name.split(".").pop()?.toLowerCase() || "pdf";
    const fileName = `${bill.anoReferencia}-${String(bill.mesReferencia).padStart(2, "0")}.${ext}`;
    const subdir = `comprovantes-fatura/${bill.id}`;
    await saveBufferToStorage(buffer, subdir, fileName);
    comprovanteUrl = `/api/files/${subdir}/${fileName}`;
    comprovanteAt = new Date();
  }

  const origemPagamento =
    session.user.name?.trim() || session.user.email?.trim() || "Sistema";

  const updated = await prisma.consumerBill.update({
    where: { id },
    data: {
      contaPaga: true,
      pagoEm,
      bancoPagamento: banco,
      origemPagamento,
      ...(comprovanteUrl ? { comprovantePagamentoUrl: comprovanteUrl } : {}),
      ...(comprovanteAt ? { comprovantePagamentoAt: comprovanteAt } : {}),
    },
    select: {
      id: true,
      contaPaga: true,
      pagoEm: true,
      bancoPagamento: true,
      origemPagamento: true,
      comprovantePagamentoUrl: true,
    },
  });

  return NextResponse.json(updated);
}

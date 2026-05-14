import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { cancelInvestorDebit } from "@/lib/investor-debits";

/**
 * DELETE /api/investors/[id]/debits/[debitId]
 * Cancela um débito: estorna todas as aplicações, devolve valorLiquido das
 * payables afetadas e marca o débito como CANCELADO. Não deleta de fato —
 * preserva histórico.
 *
 * Body (opcional): { motivo?: string }
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; debitId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id: investorId, debitId } = await params;
  const body = (await req.json().catch(() => null)) as {
    motivo?: string;
  } | null;

  const debit = await prisma.investorDebit.findUnique({
    where: { id: debitId },
    select: { id: true, investorId: true, status: true },
  });
  if (!debit || debit.investorId !== investorId) {
    return NextResponse.json({ error: "Débito não encontrado" }, { status: 404 });
  }
  if (debit.status === "CANCELADO") {
    return NextResponse.json({ error: "Débito já cancelado" }, { status: 400 });
  }

  await cancelInvestorDebit(debitId, body?.motivo?.trim() || undefined);

  return NextResponse.json({ ok: true });
}

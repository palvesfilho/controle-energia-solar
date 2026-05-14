import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { markInvestorPayableAsPaid } from "@/lib/investor-debits";

/**
 * POST /api/admin/investor-payables/[id]/mark-paid
 * Marca uma payable como PAGA. Se valorRealPago > valorLiquido, cria
 * InvestorDebit automático pela diferença.
 *
 * Body: { valorRealPago?: number, motivo?: string, pagoEm?: string(ISO) }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id: payableId } = await params;
  const body = (await req.json().catch(() => null)) as {
    valorRealPago?: number;
    motivo?: string;
    pagoEm?: string;
  } | null;

  if (
    body?.valorRealPago != null &&
    (!Number.isFinite(body.valorRealPago) || body.valorRealPago < 0)
  ) {
    return NextResponse.json(
      { error: "valorRealPago inválido (deve ser número >= 0)" },
      { status: 400 },
    );
  }

  let pagoEm: Date | undefined;
  if (body?.pagoEm) {
    const d = new Date(body.pagoEm);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json(
        { error: "pagoEm inválido" },
        { status: 400 },
      );
    }
    pagoEm = d;
  }

  try {
    const result = await markInvestorPayableAsPaid(payableId, {
      valorRealPago: body?.valorRealPago,
      motivo: body?.motivo,
      pagoEm,
      userId: session.user.id,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 400 },
    );
  }
}

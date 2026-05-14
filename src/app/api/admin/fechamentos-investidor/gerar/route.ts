import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import {
  generateSettlementDraft,
  generateSettlementsForClosing,
} from "@/lib/investor-settlements";

/**
 * POST /api/admin/fechamentos-investidor/gerar
 * Body:
 *   { ano: number, mes: number }                  → gera DRAFT pra todos os investidores com payables DISPONIVEL
 *   { ano, mes, investorId: string }              → gera DRAFT só pra um investidor
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const ano = Number(body.ano);
  const mes = Number(body.mes);
  const investorId =
    typeof body.investorId === "string" ? body.investorId : null;

  if (!ano || !mes || mes < 1 || mes > 12) {
    return NextResponse.json(
      { error: "Ano e mês de fechamento são obrigatórios (1..12)" },
      { status: 400 },
    );
  }

  try {
    if (investorId) {
      const result = await generateSettlementDraft(investorId, ano, mes);
      return NextResponse.json({ ok: true, result });
    }
    const closing = await generateSettlementsForClosing(ano, mes);
    return NextResponse.json({ ok: true, closing });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * POST /api/admin/faturamento/unidades-consumidoras/[id]/emitir-cobranca
 *
 * Pipeline completo: cria charge Asaas (notificações off) + gera PDF
 * novo + salva no R2 + envia email Resend com PDF anexado.
 *
 * Pré-condição: ConsumerUnitBilling.demonstrativoValidadoEm != null.
 * Falha de email não cancela a cobrança — só sinaliza em emailErro.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { emitirCobrancaComDemonstrativo } from "@/lib/emit-cobranca";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({} as Record<string, unknown>));

  const dataVencimentoStr =
    typeof body.dataVencimento === "string" ? body.dataVencimento : null;
  const dataVencimento = dataVencimentoStr ? new Date(dataVencimentoStr) : undefined;
  const billingType =
    typeof body.billingType === "string" ? (body.billingType as "BOLETO" | "PIX" | "UNDEFINED") : "UNDEFINED";

  const result = await emitirCobrancaComDemonstrativo(id, {
    billingType,
    dataVencimento,
  });

  if (!result.ok) {
    const status = result.skipped ? 409 : 400;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}

/**
 * POST /api/admin/faturamento/unidades-consumidoras/[id]/validar-demonstrativo
 * DELETE — invalida (reseta validação)
 *
 * Quem pode: FULL_ADMIN_TRIO (ADMIN, GESTOR, FINANCEIRO).
 * Efeito: marca/limpa `demonstrativoValidadoEm` + `demonstrativoValidadoPor`.
 * O botão "Realizar Cobrança" só fica habilitado quando validado.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function POST(_req: NextRequest, ctx: RouteCtx) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const billing = await prisma.consumerUnitBilling.findUnique({
    where: { id },
    select: { id: true, asaasChargeId: true },
  });
  if (!billing) {
    return NextResponse.json({ error: "Cobrança não encontrada" }, { status: 404 });
  }
  if (billing.asaasChargeId) {
    return NextResponse.json(
      { error: "Cobrança já foi emitida — não é possível validar/invalidar" },
      { status: 400 },
    );
  }
  const updated = await prisma.consumerUnitBilling.update({
    where: { id },
    data: {
      demonstrativoValidadoEm: new Date(),
      demonstrativoValidadoPor:
        (session.user as { id?: string; name?: string }).id ??
        session.user.name ??
        "—",
    },
    select: {
      demonstrativoValidadoEm: true,
      demonstrativoValidadoPor: true,
    },
  });
  return NextResponse.json({ ok: true, ...updated });
}

export async function DELETE(_req: NextRequest, ctx: RouteCtx) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  await prisma.consumerUnitBilling.update({
    where: { id },
    data: {
      demonstrativoValidadoEm: null,
      demonstrativoValidadoPor: null,
    },
  });
  return NextResponse.json({ ok: true });
}

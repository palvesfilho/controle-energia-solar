import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { recomputeSettlementTotals } from "@/lib/investor-settlements";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  const settlement = await prisma.investorSettlement.findUnique({
    where: { id },
    include: {
      investor: {
        select: {
          id: true,
          chavePix: true,
          user: { select: { name: true, email: true } },
        },
      },
      payables: {
        select: {
          id: true,
          status: true,
          anoReferencia: true,
          mesReferencia: true,
          sharePercent: true,
          valorKwhContrato: true,
          kwhCompensadoBase: true,
          kwhCompensadoAjuste: true,
          kwhCreditoLegadoAbatido: true,
          valorBruto: true,
          valorAjuste: true,
          valorLiquido: true,
          motivoAjuste: true,
          plant: { select: { id: true, name: true, numeroUsina: true } },
          consumerUnit: { select: { id: true, codigoUc: true, nome: true } },
        },
        orderBy: [
          { plant: { name: "asc" } },
          { anoReferencia: "asc" },
          { mesReferencia: "asc" },
          { consumerUnit: { codigoUc: "asc" } },
        ],
      },
    },
  });

  if (!settlement) {
    return NextResponse.json({ error: "Fechamento não encontrado" }, { status: 404 });
  }

  return NextResponse.json(settlement);
}

/**
 * PATCH — ajusta gestaoFixaAplicada / outrosAjustes / outrosNotas / observacoes.
 * Recalcula valorAPagar automaticamente.
 */
export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const current = await prisma.investorSettlement.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!current) {
    return NextResponse.json({ error: "Fechamento não encontrado" }, { status: 404 });
  }
  if (current.status === "PUBLISHED") {
    return NextResponse.json(
      { error: "Fechamento já publicado — não é possível editar" },
      { status: 409 },
    );
  }

  const data: Record<string, unknown> = {};
  if (body.gestaoFixaAplicada !== undefined) {
    const v = Number(body.gestaoFixaAplicada);
    if (!Number.isFinite(v) || v < 0) {
      return NextResponse.json({ error: "gestaoFixaAplicada inválida" }, { status: 400 });
    }
    data.gestaoFixaAplicada = v;
  }
  if (body.outrosAjustes !== undefined) {
    const v = Number(body.outrosAjustes);
    if (!Number.isFinite(v)) {
      return NextResponse.json({ error: "outrosAjustes inválido" }, { status: 400 });
    }
    data.outrosAjustes = v;
  }
  if (body.outrosNotas !== undefined) {
    data.outrosNotas =
      typeof body.outrosNotas === "string" ? body.outrosNotas.trim() || null : null;
  }
  if (body.observacoes !== undefined) {
    data.observacoes =
      typeof body.observacoes === "string" ? body.observacoes.trim() || null : null;
  }

  if (Object.keys(data).length > 0) {
    await prisma.investorSettlement.update({ where: { id }, data });
  }

  await recomputeSettlementTotals(id);

  const fresh = await prisma.investorSettlement.findUnique({ where: { id } });
  return NextResponse.json(fresh);
}

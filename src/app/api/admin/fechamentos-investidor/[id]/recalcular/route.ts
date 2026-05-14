import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { recomputeSettlementTotals } from "@/lib/investor-settlements";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function POST(_req: NextRequest, ctx: RouteCtx) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  await recomputeSettlementTotals(id);
  const fresh = await prisma.investorSettlement.findUnique({ where: { id } });
  if (!fresh) {
    return NextResponse.json({ error: "Fechamento não encontrado" }, { status: 404 });
  }
  return NextResponse.json(fresh);
}

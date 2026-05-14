import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { cancelSettlement } from "@/lib/investor-settlements";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

/**
 * POST — cancela um DRAFT (status → CANCELED), desvincula os payables
 * (voltam a DISPONIVEL sem settlement, podem entrar em outro fechamento).
 */
export async function POST(_req: NextRequest, ctx: RouteCtx) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  try {
    await cancelSettlement(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

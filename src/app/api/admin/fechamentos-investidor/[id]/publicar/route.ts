import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { publishSettlement } from "@/lib/investor-settlements";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

/**
 * POST — publica o fechamento: status DRAFT → PUBLISHED, payables → PAGO.
 * Body opcional: { pagoEm: ISO-string, pagoComprovante: URL string }
 */
export async function POST(req: NextRequest, ctx: RouteCtx) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  let pagoEm: Date | undefined;
  if (body.pagoEm) {
    const d = new Date(body.pagoEm);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: "pagoEm inválido (use ISO)" }, { status: 400 });
    }
    pagoEm = d;
  }
  const pagoComprovante =
    typeof body.pagoComprovante === "string" && body.pagoComprovante.trim()
      ? body.pagoComprovante.trim()
      : null;

  try {
    const result = await publishSettlement(id, { pagoEm, pagoComprovante });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

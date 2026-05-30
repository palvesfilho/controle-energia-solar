import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { listarSnapshots } from "@/lib/analise-snapshot";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !canAccessSection(session.user.role, "gestaoCreditos")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  try {
    const items = await listarSnapshots({ escopoTipo: "FULL", escopoId: null });
    return NextResponse.json({ items });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /snapshots]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

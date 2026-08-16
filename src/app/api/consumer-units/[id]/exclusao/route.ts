import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { avaliarExclusaoUc } from "@/lib/consumer-unit-exclusao";

// Preview do impacto da exclusão da UC — mesmo contrato do preview da usina
// (GET /api/plants/[id]/exclusao), porque a tela de confirmação é a mesma.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const impacto = await avaliarExclusaoUc(id);
  if (!impacto) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    ...impacto,
    podeExcluir: impacto.bloqueios.length === 0,
  });
}

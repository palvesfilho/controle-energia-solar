import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { avaliarExclusaoUsina } from "@/lib/plant-exclusao";

// Preview do impacto da exclusão — alimenta o diálogo de confirmação antes de
// qualquer DELETE. Só lê contadores.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const impacto = await avaliarExclusaoUsina(id);
  if (!impacto) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    ...impacto,
    podeExcluir: impacto.bloqueios.length === 0,
  });
}

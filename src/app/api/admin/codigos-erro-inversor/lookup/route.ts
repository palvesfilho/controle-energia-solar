import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

// GET /api/admin/codigos-erro-inversor/lookup?fabricante=FRONIUS&codigo=103
// Devolve o código + ações pra a página de erros mostrar a sugestão.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const fabricante = req.nextUrl.searchParams.get("fabricante")?.trim().toUpperCase();
  const codigo = req.nextUrl.searchParams.get("codigo")?.trim();

  if (!fabricante || !codigo) {
    return NextResponse.json({ codigo: null });
  }

  const found = await prisma.inverterErrorCode.findUnique({
    where: { fabricante_codigo: { fabricante, codigo } },
    include: { acoes: { orderBy: { ordem: "asc" } } },
  });

  return NextResponse.json({ codigo: found });
}

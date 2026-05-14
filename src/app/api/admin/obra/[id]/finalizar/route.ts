import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const obra = await prisma.obra.findUnique({ where: { id } });
  if (!obra) {
    return NextResponse.json({ error: "Obra não encontrada" }, { status: 404 });
  }

  const updated = await prisma.obra.update({
    where: { id },
    data: {
      status: "CONCLUIDA",
      progresso: 100,
      dataFimReal: obra.dataFimReal ?? new Date(),
    },
  });

  return NextResponse.json({ success: true, obra: updated });
}

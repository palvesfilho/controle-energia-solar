import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { canAccessSection } from "@/lib/roles";
import { recalcularCronograma } from "@/lib/cronograma/recalcular";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !canAccessSection(session.user.role, "obra")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dep = await prisma.tarefaDependencia.findUnique({
    where: { id },
    select: { tarefa: { select: { obraId: true } } },
  });
  if (!dep) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.tarefaDependencia.delete({ where: { id } });
    await recalcularCronograma(tx, dep.tarefa.obraId);
  });

  return NextResponse.json({ success: true });
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";
import { criariaCiclo, recalcularCronograma } from "@/lib/cronograma/recalcular";

const TIPOS_VALIDOS = ["FS", "SS", "FF", "SF"] as const;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tarefaId } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  if (!body.dependeDeId) {
    return NextResponse.json({ error: "dependeDeId é obrigatório" }, { status: 400 });
  }
  const tipo = (body.tipo ?? "FS") as string;
  if (!TIPOS_VALIDOS.includes(tipo as (typeof TIPOS_VALIDOS)[number])) {
    return NextResponse.json({ error: "Tipo de dependência inválido" }, { status: 400 });
  }

  const [tarefa, pred] = await Promise.all([
    prisma.obraTarefa.findUnique({ where: { id: tarefaId }, select: { obraId: true } }),
    prisma.obraTarefa.findUnique({
      where: { id: body.dependeDeId },
      select: { obraId: true },
    }),
  ]);

  if (!tarefa || !pred) {
    return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });
  }
  if (tarefa.obraId !== pred.obraId) {
    return NextResponse.json(
      { error: "Dependência deve ser entre tarefas da mesma obra" },
      { status: 400 }
    );
  }

  if (await criariaCiclo(prisma, tarefaId, body.dependeDeId)) {
    return NextResponse.json(
      { error: "Essa dependência criaria um ciclo" },
      { status: 400 }
    );
  }

  const dep = await prisma.$transaction(async (tx) => {
    const criada = await tx.tarefaDependencia.create({
      data: {
        tarefaId,
        dependeDeId: body.dependeDeId,
        tipo,
        lagDias: body.lagDias !== undefined ? Number(body.lagDias) : 0,
      },
    });
    await recalcularCronograma(tx, tarefa.obraId);
    return criada;
  });

  return NextResponse.json(dep, { status: 201 });
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";
import { recalcularCronograma } from "@/lib/cronograma/recalcular";

function diffDias(inicio: Date, fim: Date): number {
  const ms = fim.getTime() - inicio.getTime();
  return Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)));
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tarefa = await prisma.obraTarefa.findUnique({
    where: { id },
    include: {
      dependencias: { include: { dependeDe: { select: { id: true, nome: true } } } },
      dependentes: { include: { tarefa: { select: { id: true, nome: true } } } },
    },
  });

  if (!tarefa) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(tarefa);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  const atual = await prisma.obraTarefa.findUnique({ where: { id } });
  if (!atual) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const novaInicio = body.dataInicioPlan ? new Date(body.dataInicioPlan) : atual.dataInicioPlan;
  const novaFim = body.dataFimPlan ? new Date(body.dataFimPlan) : atual.dataFimPlan;

  if (novaFim < novaInicio) {
    return NextResponse.json(
      { error: "Data fim não pode ser anterior à data início" },
      { status: 400 }
    );
  }

  const novaDuracao =
    body.duracaoDias !== undefined
      ? Number(body.duracaoDias)
      : body.dataInicioPlan !== undefined || body.dataFimPlan !== undefined
      ? diffDias(novaInicio, novaFim)
      : atual.duracaoDias;

  const disparouRecalc =
    body.dataInicioPlan !== undefined ||
    body.dataFimPlan !== undefined ||
    body.duracaoDias !== undefined;

  await prisma.$transaction(async (tx) => {
    await tx.obraTarefa.update({
      where: { id },
      data: {
        ...(body.nome !== undefined && { nome: body.nome }),
        ...(body.descricao !== undefined && { descricao: body.descricao || null }),
        ...(body.ordem !== undefined && { ordem: Number(body.ordem) }),
        ...(body.dataInicioPlan !== undefined && { dataInicioPlan: novaInicio }),
        ...(body.dataFimPlan !== undefined && { dataFimPlan: novaFim }),
        ...(disparouRecalc && { duracaoDias: novaDuracao }),
        ...(body.dataInicioReal !== undefined && {
          dataInicioReal: body.dataInicioReal ? new Date(body.dataInicioReal) : null,
        }),
        ...(body.dataFimReal !== undefined && {
          dataFimReal: body.dataFimReal ? new Date(body.dataFimReal) : null,
        }),
        ...(body.progresso !== undefined && { progresso: Number(body.progresso) }),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.responsavel !== undefined && { responsavel: body.responsavel || null }),
        ...(body.cor !== undefined && { cor: body.cor || null }),
      },
    });

    if (disparouRecalc) {
      await recalcularCronograma(tx, atual.obraId);
    }
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.obraTarefa.delete({ where: { id } });

  return NextResponse.json({ success: true });
}

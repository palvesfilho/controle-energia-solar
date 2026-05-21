import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { canAccessSection } from "@/lib/roles";

function diffDias(inicio: Date, fim: Date): number {
  const ms = fim.getTime() - inicio.getTime();
  return Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)));
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: obraId } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !canAccessSection(session.user.role, "obra")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  if (!body.nome) {
    return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
  }
  if (!body.dataInicioPlan || !body.dataFimPlan) {
    return NextResponse.json(
      { error: "Data de início e fim planejadas são obrigatórias" },
      { status: 400 }
    );
  }

  const dataInicioPlan = new Date(body.dataInicioPlan);
  const dataFimPlan = new Date(body.dataFimPlan);

  if (dataFimPlan < dataInicioPlan) {
    return NextResponse.json(
      { error: "Data fim não pode ser anterior à data início" },
      { status: 400 }
    );
  }

  const duracaoDias = body.duracaoDias
    ? Number(body.duracaoDias)
    : diffDias(dataInicioPlan, dataFimPlan);

  const ultimaOrdem = await prisma.obraTarefa.findFirst({
    where: { obraId },
    orderBy: { ordem: "desc" },
    select: { ordem: true },
  });

  const tarefa = await prisma.obraTarefa.create({
    data: {
      obraId,
      nome: body.nome,
      descricao: body.descricao || null,
      ordem: body.ordem !== undefined ? Number(body.ordem) : (ultimaOrdem?.ordem ?? -1) + 1,
      dataInicioPlan,
      dataFimPlan,
      duracaoDias,
      progresso: body.progresso !== undefined ? Number(body.progresso) : 0,
      status: body.status || "NAO_INICIADA",
      responsavel: body.responsavel || null,
      cor: body.cor || null,
    },
  });

  return NextResponse.json(tarefa, { status: 201 });
}

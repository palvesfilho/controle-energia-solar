import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { canAccessSection } from "@/lib/roles";
import { parseDateOnly } from "@/lib/obra-calendario";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !canAccessSection(session.user.role, "obra")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const obra = await prisma.obra.findUnique({
    where: { id },
    include: {
      tarefas: {
        orderBy: [{ ordem: "asc" }, { dataInicioPlan: "asc" }],
        include: {
          dependencias: {
            include: {
              dependeDe: { select: { id: true, nome: true } },
            },
          },
        },
      },
    },
  });

  if (!obra) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(obra);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !canAccessSection(session.user.role, "obra")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  await prisma.obra.update({
    where: { id },
    data: {
      ...(body.nome !== undefined && { nome: body.nome }),
      ...(body.descricao !== undefined && { descricao: body.descricao || null }),
      ...(body.responsavel !== undefined && { responsavel: body.responsavel || null }),
      ...(body.cliente !== undefined && { cliente: body.cliente || null }),
      ...(body.local !== undefined && { local: body.local || null }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.dataInicioPrevista !== undefined && {
        dataInicioPrevista: parseDateOnly(body.dataInicioPrevista),
      }),
      ...(body.dataFimPrevista !== undefined && {
        dataFimPrevista: parseDateOnly(body.dataFimPrevista),
      }),
      ...(body.dataInicioReal !== undefined && {
        dataInicioReal: parseDateOnly(body.dataInicioReal),
      }),
      ...(body.dataFimReal !== undefined && {
        dataFimReal: parseDateOnly(body.dataFimReal),
      }),
      ...(body.progresso !== undefined && { progresso: Number(body.progresso) }),
      ...(body.plantId !== undefined && { plantId: body.plantId || null }),
      ...(body.brasilSolarClientId !== undefined && { brasilSolarClientId: body.brasilSolarClientId || null }),
      ...(body.observacoes !== undefined && { observacoes: body.observacoes || null }),
      ...(body.active !== undefined && { active: body.active }),
    },
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !canAccessSection(session.user.role, "obra")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.obra.update({
    where: { id },
    data: { active: false },
  });

  return NextResponse.json({ success: true });
}

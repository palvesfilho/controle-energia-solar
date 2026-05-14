import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

// PATCH /api/brasil-solar/[id]/monitoring-plans/[planId] - edita plano (ex.: ajustar data fim)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; planId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id, planId } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body inválido" }, { status: 400 });

  const data: {
    dataInicio?: Date;
    dataFim?: Date;
    valorMensal?: number | null;
    observacoes?: string | null;
  } = {};

  if (body.dataInicio) {
    const d = new Date(body.dataInicio);
    if (Number.isNaN(d.getTime()))
      return NextResponse.json({ error: "dataInicio inválida" }, { status: 400 });
    data.dataInicio = d;
  }
  if (body.dataFim) {
    const d = new Date(body.dataFim);
    if (Number.isNaN(d.getTime()))
      return NextResponse.json({ error: "dataFim inválida" }, { status: 400 });
    data.dataFim = d;
  }
  if ("valorMensal" in body) data.valorMensal = body.valorMensal;
  if ("observacoes" in body) data.observacoes = body.observacoes;

  const plan = await prisma.brasilSolarMonitoringPlan.findFirst({
    where: { id: planId, clientId: id },
    select: { id: true },
  });
  if (!plan) {
    return NextResponse.json({ error: "Plano não encontrado" }, { status: 404 });
  }

  const updated = await prisma.brasilSolarMonitoringPlan.update({
    where: { id: planId },
    data,
  });

  return NextResponse.json(updated);
}

// DELETE /api/brasil-solar/[id]/monitoring-plans/[planId]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; planId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id, planId } = await params;
  const plan = await prisma.brasilSolarMonitoringPlan.findFirst({
    where: { id: planId, clientId: id },
    select: { id: true },
  });
  if (!plan) {
    return NextResponse.json({ error: "Plano não encontrado" }, { status: 404 });
  }

  await prisma.brasilSolarMonitoringPlan.delete({ where: { id: planId } });
  return NextResponse.json({ ok: true });
}

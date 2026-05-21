import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

// GET /api/brasil-solar/[id]/monitoring-plans - lista planos da usina
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const plans = await prisma.brasilSolarMonitoringPlan.findMany({
    where: { clientId: id },
    orderBy: { dataInicio: "desc" },
  });
  return NextResponse.json(plans);
}

// POST /api/brasil-solar/[id]/monitoring-plans - cria novo plano
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body inválido" }, { status: 400 });

  const { dataInicio, dataFim, valorMensal, observacoes } = body as {
    dataInicio?: string;
    dataFim?: string;
    valorMensal?: number | null;
    observacoes?: string | null;
  };

  if (!dataInicio || !dataFim) {
    return NextResponse.json(
      { error: "dataInicio e dataFim são obrigatórios" },
      { status: 400 },
    );
  }

  const inicio = new Date(dataInicio);
  const fim = new Date(dataFim);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) {
    return NextResponse.json({ error: "Datas inválidas" }, { status: 400 });
  }
  if (fim <= inicio) {
    return NextResponse.json(
      { error: "dataFim deve ser posterior a dataInicio" },
      { status: 400 },
    );
  }

  const client = await prisma.brasilSolarClient.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!client) {
    return NextResponse.json({ error: "Usina não encontrada" }, { status: 404 });
  }

  const plan = await prisma.brasilSolarMonitoringPlan.create({
    data: {
      clientId: id,
      dataInicio: inicio,
      dataFim: fim,
      valorMensal: valorMensal ?? null,
      observacoes: observacoes ?? null,
    },
  });

  return NextResponse.json(plan, { status: 201 });
}

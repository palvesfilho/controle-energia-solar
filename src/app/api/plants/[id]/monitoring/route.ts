import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/plants/[id]/monitoring — lista BrasilSolarClients vinculados a esta
 * Plant (usinas monitoradas que injetam na fatura da concessionária).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const clients = await prisma.brasilSolarClient.findMany({
    where: { plantId: id, active: true },
    orderBy: { nome: "asc" },
    select: {
      id: true,
      nome: true,
      cpfCnpj: true,
      codigoUc: true,
      cidade: true,
      uf: true,
      plataformaMonitoramento: true,
      monitoramentoPlantId: true,
      statusMonitoramento: true,
      ultimaLeitura: true,
      ultimaGeracao: true,
      geracaoMesAtual: true,
      geracaoMediaEsperada: true,
      performanceRatio: true,
      potenciaInstalada: true,
      proprietario: { select: { id: true, nome: true } },
    },
  });

  return NextResponse.json({ clients });
}

/**
 * POST /api/plants/[id]/monitoring — vincula um BrasilSolarClient à Plant.
 * Body: { brasilSolarClientId: string }
 *
 * Se o client já estiver vinculado a outra Plant, a requisição FALHA (409).
 * Para mover de uma Plant pra outra, desvincular primeiro.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const clientId = typeof body?.brasilSolarClientId === "string" ? body.brasilSolarClientId : null;
  if (!clientId) {
    return NextResponse.json({ error: "brasilSolarClientId obrigatório" }, { status: 400 });
  }

  const plant = await prisma.plant.findUnique({ where: { id }, select: { id: true } });
  if (!plant) {
    return NextResponse.json({ error: "Plant não encontrada" }, { status: 404 });
  }

  const client = await prisma.brasilSolarClient.findUnique({
    where: { id: clientId },
    select: { id: true, plantId: true, monitoramentoPlantId: true, nome: true },
  });
  if (!client) {
    return NextResponse.json({ error: "BrasilSolarClient não encontrado" }, { status: 404 });
  }
  if (!client.monitoramentoPlantId) {
    return NextResponse.json(
      { error: "Este cliente não tem monitoramento configurado (monitoramentoPlantId vazio)" },
      { status: 400 },
    );
  }
  if (client.plantId && client.plantId !== id) {
    return NextResponse.json(
      { error: "Este cliente já está vinculado a outra Plant. Desvincule primeiro." },
      { status: 409 },
    );
  }

  const updated = await prisma.brasilSolarClient.update({
    where: { id: clientId },
    data: { plantId: id },
    select: { id: true, nome: true, plantId: true },
  });

  return NextResponse.json({ client: updated });
}

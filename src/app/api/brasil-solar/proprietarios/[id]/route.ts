import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

// GET /api/brasil-solar/proprietarios/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const { id } = await params;

  const proprietario = await prisma.brasilSolarProprietario.findUnique({
    where: { id },
    include: {
      plantas: {
        where: { active: true },
        orderBy: { nome: "asc" },
        select: {
          id: true,
          nome: true,
          potenciaInstalada: true,
          plataformaMonitoramento: true,
          statusMonitoramento: true,
          geracaoMesAtual: true,
          ultimaLeitura: true,
          performanceRatio: true,
          cidade: true,
          uf: true,
          _count: {
            select: { alerts: { where: { status: "ABERTO" } } },
          },
          monitoringPlans: {
            select: { id: true, dataInicio: true, dataFim: true },
          },
        },
      },
    },
  });

  if (!proprietario) {
    return NextResponse.json({ error: "Proprietario nao encontrado" }, { status: 404 });
  }

  return NextResponse.json(proprietario);
}

// PUT /api/brasil-solar/proprietarios/[id]
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();

  const proprietario = await prisma.brasilSolarProprietario.update({
    where: { id },
    data: {
      nome: body.nome,
      cpfCnpj: body.cpfCnpj,
      email: body.email,
      telefone: body.telefone,
      endereco: body.endereco,
      cidade: body.cidade,
      uf: body.uf,
      observacoes: body.observacoes,
      latitude: body.latitude !== undefined ? toFloat(body.latitude) : undefined,
      longitude: body.longitude !== undefined ? toFloat(body.longitude) : undefined,
      codigoUc: body.codigoUc,
      concessionaria: body.concessionaria,
      potenciaInstalada: body.potenciaInstalada !== undefined ? toFloat(body.potenciaInstalada) : undefined,
      modulosMarca: body.modulosMarca,
      modulosModelo: body.modulosModelo,
      modulosQuantidade: body.modulosQuantidade !== undefined ? toInt(body.modulosQuantidade) : undefined,
      inversorMarca: body.inversorMarca,
      inversorModelo: body.inversorModelo,
      inversorQuantidade: body.inversorQuantidade !== undefined ? toInt(body.inversorQuantidade) : undefined,
      inversorPotencia: body.inversorPotencia !== undefined ? toFloat(body.inversorPotencia) : undefined,
      numeroFases: body.numeroFases,
      tipoAtendimento: body.tipoAtendimento,
    },
  });

  return NextResponse.json(proprietario);
}

function toFloat(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function toInt(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? Math.trunc(v) : parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

// DELETE /api/brasil-solar/proprietarios/[id] - Soft delete
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const { id } = await params;

  // Desvincular plantas antes de desativar
  await prisma.brasilSolarClient.updateMany({
    where: { proprietarioId: id },
    data: { proprietarioId: null },
  });

  await prisma.brasilSolarProprietario.update({
    where: { id },
    data: { active: false },
  });

  return NextResponse.json({ message: "Proprietario desativado" });
}

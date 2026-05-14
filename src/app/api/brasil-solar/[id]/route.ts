import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

// GET /api/brasil-solar/[id] - Detalhe do cliente
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const { id } = await params;

  const client = await prisma.brasilSolarClient.findUnique({
    where: { id },
    include: {
      proprietario: {
        select: { id: true, nome: true, cpfCnpj: true },
      },
      monitoringLogs: {
        orderBy: { data: "desc" },
        take: 90,
      },
      alerts: {
        orderBy: { createdAt: "desc" },
        take: 50,
      },
    },
  });

  if (!client) {
    return NextResponse.json({ error: "Cliente nao encontrado" }, { status: 404 });
  }

  return NextResponse.json(client);
}

// PUT /api/brasil-solar/[id] - Atualizar cliente
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

  const client = await prisma.brasilSolarClient.update({
    where: { id },
    data: {
      nome: body.nome,
      cpfCnpj: body.cpfCnpj,
      email: body.email,
      telefone: body.telefone,
      endereco: body.endereco,
      cidade: body.cidade,
      uf: body.uf,
      latitude: body.latitude !== undefined ? (body.latitude === "" || body.latitude === null ? null : parseFloat(body.latitude)) : undefined,
      longitude: body.longitude !== undefined ? (body.longitude === "" || body.longitude === null ? null : parseFloat(body.longitude)) : undefined,
      potenciaInstalada: body.potenciaInstalada != null ? parseFloat(body.potenciaInstalada) : undefined,
      dataInstalacao: body.dataInstalacao ? new Date(body.dataInstalacao) : undefined,
      modulosMarca: body.modulosMarca,
      modulosModelo: body.modulosModelo,
      modulosQuantidade: body.modulosQuantidade != null ? parseInt(body.modulosQuantidade) : undefined,
      inversorMarca: body.inversorMarca,
      inversorModelo: body.inversorModelo,
      inversorQuantidade: body.inversorQuantidade != null ? parseInt(body.inversorQuantidade) : undefined,
      inversorPotencia: body.inversorPotencia != null ? parseFloat(body.inversorPotencia) : undefined,
      plataformaMonitoramento: body.plataformaMonitoramento,
      monitoramentoLogin: body.monitoramentoLogin,
      monitoramentoSenha: body.monitoramentoSenha,
      monitoramentoUrl: body.monitoramentoUrl,
      monitoramentoPlantId: body.monitoramentoPlantId,
      concessionaria: body.concessionaria,
      codigoUc: body.codigoUc,
      statusContrato: body.statusContrato,
      dataContrato: body.dataContrato ? new Date(body.dataContrato) : undefined,
      consultor: body.consultor,
      garantiaAte: body.garantiaAte ? new Date(body.garantiaAte) : undefined,
      geracaoMediaEsperada: body.geracaoMediaEsperada != null ? parseFloat(body.geracaoMediaEsperada) : undefined,
      investimento: body.investimento != null ? parseFloat(body.investimento) : undefined,
      observacoesInternas: body.observacoesInternas,
      proprietarioId: body.proprietarioId !== undefined ? (body.proprietarioId || null) : undefined,
    },
  });

  return NextResponse.json(client);
}

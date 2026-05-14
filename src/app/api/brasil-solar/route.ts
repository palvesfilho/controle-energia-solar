import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

// GET /api/brasil-solar - Lista paginada de clientes Brasil Solar
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(100, Math.max(10, parseInt(searchParams.get("limit") || "50")));
  const search = searchParams.get("search") || "";
  const status = searchParams.get("status") || "";
  const plataforma = searchParams.get("plataforma") || "";
  const cidade = searchParams.get("cidade") || "";
  const uf = searchParams.get("uf") || "";
  const contrato = searchParams.get("contrato") || "";
  const proprietarioId = searchParams.get("proprietarioId") || "";
  const semProprietario = searchParams.get("semProprietario") === "true";
  const orderBy = searchParams.get("orderBy") || "nome";
  const order = searchParams.get("order") === "desc" ? "desc" : "asc";

  const where: Record<string, unknown> = { active: true };

  if (search) {
    where.OR = [
      { nome: { contains: search } },
      { cpfCnpj: { contains: search } },
      { email: { contains: search } },
      { codigoUc: { contains: search } },
      { cidade: { contains: search } },
    ];
  }

  if (status) where.statusMonitoramento = status;
  if (plataforma) where.plataformaMonitoramento = plataforma;
  if (cidade) where.cidade = cidade;
  if (uf) where.uf = uf;
  if (contrato) where.statusContrato = contrato;
  if (proprietarioId) where.proprietarioId = proprietarioId;
  if (semProprietario) where.proprietarioId = null;

  const [clients, total] = await Promise.all([
    prisma.brasilSolarClient.findMany({
      where,
      orderBy: { [orderBy]: order },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        nome: true,
        cpfCnpj: true,
        cidade: true,
        uf: true,
        potenciaInstalada: true,
        plataformaMonitoramento: true,
        statusMonitoramento: true,
        statusContrato: true,
        ultimaGeracao: true,
        ultimaLeitura: true,
        geracaoMesAtual: true,
        geracaoMediaEsperada: true,
        performanceRatio: true,
        inversorMarca: true,
        concessionaria: true,
        investimento: true,
        proprietario: {
          select: { id: true, nome: true },
        },
        _count: {
          select: {
            alerts: { where: { status: "ABERTO" } },
          },
        },
      },
    }),
    prisma.brasilSolarClient.count({ where }),
  ]);

  return NextResponse.json({
    clients,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}

// POST /api/brasil-solar - Criar novo cliente Brasil Solar
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const body = await req.json();

  const client = await prisma.brasilSolarClient.create({
    data: {
      nome: body.nome,
      cpfCnpj: body.cpfCnpj,
      email: body.email,
      telefone: body.telefone,
      endereco: body.endereco,
      cidade: body.cidade,
      uf: body.uf,
      latitude: body.latitude !== "" && body.latitude != null ? parseFloat(body.latitude) : null,
      longitude: body.longitude !== "" && body.longitude != null ? parseFloat(body.longitude) : null,
      potenciaInstalada: body.potenciaInstalada ? parseFloat(body.potenciaInstalada) : null,
      dataInstalacao: body.dataInstalacao ? new Date(body.dataInstalacao) : null,
      modulosMarca: body.modulosMarca,
      modulosModelo: body.modulosModelo,
      modulosQuantidade: body.modulosQuantidade ? parseInt(body.modulosQuantidade) : null,
      inversorMarca: body.inversorMarca,
      inversorModelo: body.inversorModelo,
      inversorQuantidade: body.inversorQuantidade ? parseInt(body.inversorQuantidade) : null,
      inversorPotencia: body.inversorPotencia ? parseFloat(body.inversorPotencia) : null,
      plataformaMonitoramento: body.plataformaMonitoramento,
      monitoramentoLogin: body.monitoramentoLogin,
      monitoramentoSenha: body.monitoramentoSenha,
      monitoramentoUrl: body.monitoramentoUrl,
      monitoramentoPlantId: body.monitoramentoPlantId,
      concessionaria: body.concessionaria,
      codigoUc: body.codigoUc,
      statusContrato: body.statusContrato || "ATIVO",
      dataContrato: body.dataContrato ? new Date(body.dataContrato) : null,
      consultor: body.consultor,
      garantiaAte: body.garantiaAte ? new Date(body.garantiaAte) : null,
      geracaoMediaEsperada: body.geracaoMediaEsperada ? parseFloat(body.geracaoMediaEsperada) : null,
      investimento: body.investimento ? parseFloat(body.investimento) : null,
      observacoesInternas: body.observacoesInternas,
      consumerId: body.consumerId,
      plantId: body.plantId,
      proprietarioId: body.proprietarioId || null,
    },
  });

  return NextResponse.json(client, { status: 201 });
}

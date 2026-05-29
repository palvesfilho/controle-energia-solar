import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const plants = await prisma.plant.findMany({
    include: {
      investors: {
        include: {
          investor: { include: { user: { select: { name: true } } } },
        },
      },
      consumerUnits: {
        select: { id: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(plants);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  if (!body.name) {
    return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
  }

  const plant = await prisma.plant.create({
    data: {
      name: body.name,
      // Campos legados (mantidos)
      location: body.location || null,
      potenciaModulos: body.potenciaModulos ? Number(body.potenciaModulos) : null,
      potenciaInversor: body.potenciaInversor ? Number(body.potenciaInversor) : null,
      geracaoMediaMensal: body.geracaoMediaMensal ? Number(body.geracaoMediaMensal) : null,
      enquadramento: body.enquadramento || null,
      unidadeConsumidora: body.unidadeConsumidora || null,
      concessionaria: body.concessionaria || null,
      formatoLeitura: body.formatoLeitura || null,
      inversorMarca: body.inversorMarca || null,
      inversorModelo: body.inversorModelo || null,
      monitoramentoPlataforma: body.monitoramentoPlataforma || null,
      monitoramentoLogin: body.monitoramentoLogin || null,
      monitoramentoSenha: body.monitoramentoSenha || null,
      monitoramentoUrl: body.monitoramentoUrl || null,
      // Novos campos
      fonte: body.fonte || null,
      numeroUsina: body.numeroUsina || null,
      potenciaInstalada: body.potenciaInstalada ? Number(body.potenciaInstalada) : null,
      grupo: body.grupo || null,
      cpfCnpj: body.cpfCnpj || null,
      distribuidora: body.distribuidora || null,
      acesso: body.acesso || null,
      statusContrato: body.statusContrato || null,
      dataAssinaturaContrato: body.dataAssinaturaContrato
        ? new Date(body.dataAssinaturaContrato)
        : null,
      loginDistribuidora: body.loginDistribuidora || null,
      senhaDistribuidora: body.senhaDistribuidora || null,
      pagadorFaturaEnergia:
        body.pagadorFaturaEnergia === "INVESTIDORES" ? "INVESTIDORES" : "GESTORA",
      usinaDeInvestidor: body.usinaDeInvestidor === true,
    },
  });

  if (body.investorId) {
    await prisma.investorPlant.create({
      data: {
        investorId: body.investorId,
        plantId: plant.id,
        sharePercent: body.sharePercent ? Number(body.sharePercent) : 100,
        valorKwhContrato: body.valorKwhContrato ? Number(body.valorKwhContrato) : null,
        gestaoFixaContrato: body.gestaoFixaContrato ? Number(body.gestaoFixaContrato) : null,
      },
    });
  }

  return NextResponse.json(plant, { status: 201 });
}

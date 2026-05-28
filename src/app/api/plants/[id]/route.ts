import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const plant = await prisma.plant.findUnique({
    where: { id },
    include: {
      investors: {
        include: {
          investor: { include: { user: { select: { id: true, name: true } } } },
        },
      },
      consumers: {
        include: {
          consumer: { select: { id: true, name: true, unidadeConsumidora: true, active: true } },
        },
      },
      consumerUnits: {
        select: { id: true, nome: true, codigoUc: true, consumoMedio: true, statusContrato: true },
      },
    },
  });

  if (!plant) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(plant);
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

  await prisma.plant.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.location !== undefined && { location: body.location || null }),
      ...(body.potenciaModulos !== undefined && {
        potenciaModulos: body.potenciaModulos ? Number(body.potenciaModulos) : null,
      }),
      ...(body.potenciaInversor !== undefined && {
        potenciaInversor: body.potenciaInversor ? Number(body.potenciaInversor) : null,
      }),
      ...(body.geracaoMediaMensal !== undefined && {
        geracaoMediaMensal: body.geracaoMediaMensal ? Number(body.geracaoMediaMensal) : null,
      }),
      ...(body.enquadramento !== undefined && { enquadramento: body.enquadramento || null }),
      ...(body.unidadeConsumidora !== undefined && { unidadeConsumidora: body.unidadeConsumidora || null }),
      ...(body.concessionaria !== undefined && { concessionaria: body.concessionaria || null }),
      ...(body.formatoLeitura !== undefined && { formatoLeitura: body.formatoLeitura || null }),
      ...(body.regraInstalacao !== undefined && { regraInstalacao: body.regraInstalacao || null }),
      ...(body.active !== undefined && { active: body.active }),
      ...(body.inversorMarca !== undefined && { inversorMarca: body.inversorMarca || null }),
      ...(body.inversorModelo !== undefined && { inversorModelo: body.inversorModelo || null }),
      ...(body.monitoramentoPlataforma !== undefined && { monitoramentoPlataforma: body.monitoramentoPlataforma || null }),
      ...(body.monitoramentoLogin !== undefined && { monitoramentoLogin: body.monitoramentoLogin || null }),
      ...(body.monitoramentoSenha !== undefined && { monitoramentoSenha: body.monitoramentoSenha || null }),
      ...(body.monitoramentoUrl !== undefined && { monitoramentoUrl: body.monitoramentoUrl || null }),
      // Novos campos
      ...(body.fonte !== undefined && { fonte: body.fonte || null }),
      ...(body.numeroUsina !== undefined && { numeroUsina: body.numeroUsina || null }),
      ...(body.potenciaInstalada !== undefined && {
        potenciaInstalada: body.potenciaInstalada ? Number(body.potenciaInstalada) : null,
      }),
      ...(body.grupo !== undefined && { grupo: body.grupo || null }),
      ...(body.cpfCnpj !== undefined && { cpfCnpj: body.cpfCnpj || null }),
      ...(body.distribuidora !== undefined && { distribuidora: body.distribuidora || null }),
      ...(body.acesso !== undefined && { acesso: body.acesso || null }),
      ...(body.statusContrato !== undefined && { statusContrato: body.statusContrato || null }),
      ...(body.dataAssinaturaContrato !== undefined && {
        dataAssinaturaContrato: body.dataAssinaturaContrato
          ? new Date(body.dataAssinaturaContrato)
          : null,
      }),
      ...(body.diaPagamentoInvestidor !== undefined && {
        diaPagamentoInvestidor: Math.min(
          28,
          Math.max(1, Number(body.diaPagamentoInvestidor) || 20)
        ),
      }),
      ...(body.loginDistribuidora !== undefined && { loginDistribuidora: body.loginDistribuidora || null }),
      ...(body.senhaDistribuidora !== undefined && { senhaDistribuidora: body.senhaDistribuidora || null }),
      ...(body.pagadorFaturaEnergia !== undefined && {
        pagadorFaturaEnergia:
          body.pagadorFaturaEnergia === "INVESTIDORES" ? "INVESTIDORES" : "GESTORA",
      }),
    },
  });

  return NextResponse.json({ success: true });
}

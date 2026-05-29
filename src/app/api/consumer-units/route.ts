import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const consumerId = searchParams.get("consumerId");
  const plantId = searchParams.get("plantId");
  const distribuidora = searchParams.get("distribuidora");
  const status = searchParams.get("status");
  const codigoUc = searchParams.get("codigoUc");

  const where: Record<string, unknown> = {};
  if (consumerId) where.consumerId = consumerId;
  if (plantId) where.plantId = plantId;
  if (distribuidora) where.distribuidora = distribuidora;
  if (status) where.statusContrato = status;
  if (codigoUc) where.codigoUc = codigoUc;

  // Esconde UCs que representam usinas sem investidor (são da área Brasil
  // Solar, não devem aparecer em Clientes). UCs com cliente físico vinculado
  // (consumerId) ou sem plant continuam visíveis. Override com ?showAll=1.
  const showAll = searchParams.get("showAll") === "1";
  if (!showAll) {
    where.OR = [
      { plantId: null },
      { consumerId: { not: null } },
      { plant: { usinaDeInvestidor: true } },
    ];
  }

  const units = await prisma.consumerUnit.findMany({
    where,
    include: {
      consumer: { select: { id: true, name: true } },
      plant: { select: { id: true, name: true } },
    },
    orderBy: { nome: "asc" },
  });

  return NextResponse.json(units);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  if (!body.nome || !body.codigoUc) {
    return NextResponse.json(
      { error: "Nome e Código da UC são obrigatórios" },
      { status: 400 }
    );
  }

  const existing = await prisma.consumerUnit.findUnique({
    where: { codigoUc: body.codigoUc },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Já existe uma UC com esse código" },
      { status: 400 }
    );
  }

  const unit = await prisma.consumerUnit.create({
    data: {
      nome: body.nome,
      codigoUc: body.codigoUc,
      consumerId: body.consumerId || null,
      plantId: body.plantId || null,
      cpfCnpj: body.cpfCnpj || null,
      distribuidora: body.distribuidora || null,
      grupo: body.grupo || null,
      subGrupo: body.subGrupo || null,
      modalidade: body.modalidade || null,
      consumoMedio: body.consumoMedio ? Number(body.consumoMedio) : null,
      cep: body.cep || null,
      logradouro: body.logradouro || null,
      complemento: body.complemento || null,
      numero: body.numero || null,
      cidade: body.cidade || null,
      consultor: body.consultor || null,
      comissao: body.comissao || null,
      metodoPagamento: body.metodoPagamento || null,
      regraRemuneracao: body.regraRemuneracao || null,
      percentCompensado: body.percentCompensado ? Number(body.percentCompensado) : null,
      percentBandeira: body.percentBandeira ? Number(body.percentBandeira) : null,
      regraVencimento: body.regraVencimento || null,
      valorVencimento: body.valorVencimento ? Number(body.valorVencimento) : null,
      statusContrato: body.statusContrato || null,
      vigenciaCompensacao: body.vigenciaCompensacao || null,
      dataInicioContrato: body.dataInicioContrato ? new Date(body.dataInicioContrato) : null,
      loginDistribuidora: body.loginDistribuidora || null,
      senhaDistribuidora: body.senhaDistribuidora || null,
      temGeracaoPropria: !!body.temGeracaoPropria,
    },
  });

  return NextResponse.json(unit, { status: 201 });
}

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

  const unit = await prisma.consumerUnit.findUnique({
    where: { id },
    include: {
      consumer: { select: { id: true, name: true } },
      plant: { select: { id: true, name: true } },
    },
  });

  if (!unit) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(unit);
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

  const existing = await prisma.consumerUnit.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Verifica código duplicado
  if (body.codigoUc && body.codigoUc !== existing.codigoUc) {
    const dup = await prisma.consumerUnit.findUnique({
      where: { codigoUc: body.codigoUc },
    });
    if (dup) {
      return NextResponse.json(
        { error: "Já existe uma UC com esse código" },
        { status: 400 }
      );
    }
  }

  await prisma.consumerUnit.update({
    where: { id },
    data: {
      ...(body.nome !== undefined && { nome: body.nome }),
      ...(body.codigoUc !== undefined && { codigoUc: body.codigoUc }),
      ...(body.consumerId !== undefined && { consumerId: body.consumerId || null }),
      ...(body.plantId !== undefined && { plantId: body.plantId || null }),
      ...(body.cpfCnpj !== undefined && { cpfCnpj: body.cpfCnpj || null }),
      ...(body.distribuidora !== undefined && { distribuidora: body.distribuidora || null }),
      ...(body.grupo !== undefined && { grupo: body.grupo || null }),
      ...(body.subGrupo !== undefined && { subGrupo: body.subGrupo || null }),
      ...(body.modalidade !== undefined && { modalidade: body.modalidade || null }),
      ...(body.consumoMedio !== undefined && {
        consumoMedio: body.consumoMedio ? Number(body.consumoMedio) : null,
      }),
      ...(body.cep !== undefined && { cep: body.cep || null }),
      ...(body.logradouro !== undefined && { logradouro: body.logradouro || null }),
      ...(body.complemento !== undefined && { complemento: body.complemento || null }),
      ...(body.numero !== undefined && { numero: body.numero || null }),
      ...(body.cidade !== undefined && { cidade: body.cidade || null }),
      ...(body.consultor !== undefined && { consultor: body.consultor || null }),
      ...(body.comissao !== undefined && { comissao: body.comissao || null }),
      ...(body.metodoPagamento !== undefined && { metodoPagamento: body.metodoPagamento || null }),
      ...(body.regraRemuneracao !== undefined && { regraRemuneracao: body.regraRemuneracao || null }),
      ...(body.percentCompensado !== undefined && {
        percentCompensado: body.percentCompensado ? Number(body.percentCompensado) : null,
      }),
      ...(body.percentBandeira !== undefined && {
        percentBandeira: body.percentBandeira ? Number(body.percentBandeira) : null,
      }),
      ...(body.regraVencimento !== undefined && { regraVencimento: body.regraVencimento || null }),
      ...(body.valorVencimento !== undefined && {
        valorVencimento: body.valorVencimento ? Number(body.valorVencimento) : null,
      }),
      ...(body.statusContrato !== undefined && { statusContrato: body.statusContrato || null }),
      ...(body.vigenciaCompensacao !== undefined && { vigenciaCompensacao: body.vigenciaCompensacao || null }),
      ...(body.dataInicioContrato !== undefined && { dataInicioContrato: body.dataInicioContrato ? new Date(body.dataInicioContrato) : null }),
      ...(body.loginDistribuidora !== undefined && { loginDistribuidora: body.loginDistribuidora || null }),
      ...(body.senhaDistribuidora !== undefined && { senhaDistribuidora: body.senhaDistribuidora || null }),
      ...(body.temGeracaoPropria !== undefined && { temGeracaoPropria: !!body.temGeracaoPropria }),
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
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.consumerUnit.delete({ where: { id } });

  return NextResponse.json({ message: "UC removida com sucesso" });
}

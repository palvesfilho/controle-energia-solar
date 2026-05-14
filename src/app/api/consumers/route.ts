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

  const consumers = await prisma.consumer.findMany({
    include: {
      plants: {
        include: {
          plant: { select: { id: true, name: true } },
        },
      },
      consumerUnits: {
        select: { id: true, codigoUc: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(consumers);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { name, plantId, cotaPercent, descontoPercent } = body;

  if (!name) {
    return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
  }

  const consumer = await prisma.consumer.create({
    data: {
      name,
      // Campos legados (mantidos)
      email: body.email || null,
      phone: body.phone || null,
      document: body.document || null,
      endereco: body.endereco || null,
      unidadeConsumidora: body.unidadeConsumidora || null,
      // Novos campos
      cpfCnpj: body.cpfCnpj || null,
      loginPortal: body.loginPortal || null,
      emailsRecebimento: body.emailsRecebimento || null,
      dataCadastro: body.dataCadastro ? new Date(body.dataCadastro) : null,
    },
  });

  if (plantId) {
    await prisma.consumerPlant.create({
      data: {
        consumerId: consumer.id,
        plantId,
        cotaPercent: cotaPercent ? Number(cotaPercent) : null,
        descontoPercent: descontoPercent ? Number(descontoPercent) : null,
      },
    });
  }

  return NextResponse.json(consumer, { status: 201 });
}

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

  const consumer = await prisma.consumer.findUnique({
    where: { id },
    include: {
      plants: {
        include: {
          plant: { select: { id: true, name: true } },
        },
      },
      consumerUnits: true,
    },
  });

  if (!consumer) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(consumer);
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

  const consumer = await prisma.consumer.findUnique({ where: { id } });
  if (!consumer) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.consumer.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.email !== undefined && { email: body.email || null }),
      ...(body.phone !== undefined && { phone: body.phone || null }),
      ...(body.document !== undefined && { document: body.document || null }),
      ...(body.endereco !== undefined && { endereco: body.endereco || null }),
      ...(body.unidadeConsumidora !== undefined && { unidadeConsumidora: body.unidadeConsumidora || null }),
      ...(body.active !== undefined && { active: body.active }),
      // Novos campos
      ...(body.cpfCnpj !== undefined && { cpfCnpj: body.cpfCnpj || null }),
      ...(body.loginPortal !== undefined && { loginPortal: body.loginPortal || null }),
      ...(body.emailsRecebimento !== undefined && { emailsRecebimento: body.emailsRecebimento || null }),
      ...(body.dataCadastro !== undefined && {
        dataCadastro: body.dataCadastro ? new Date(body.dataCadastro) : null,
      }),
    },
  });

  return NextResponse.json({ success: true });
}

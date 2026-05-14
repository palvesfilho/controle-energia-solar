import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { hashSync } from "bcryptjs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      active: true,
      createdAt: true,
      updatedAt: true,
      investor: {
        select: {
          id: true,
          phone: true,
          document: true,
        },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
  }

  return NextResponse.json(user);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const { name, email, password, role, active } = body;

  const existingUser = await prisma.user.findUnique({ where: { id } });
  if (!existingUser) {
    return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
  }

  // Não permitir desativar o próprio usuário
  if (id === session.user.id && active === false) {
    return NextResponse.json(
      { error: "Você não pode desativar sua própria conta" },
      { status: 400 }
    );
  }

  // Verificar email duplicado
  if (email && email !== existingUser.email) {
    const emailExists = await prisma.user.findUnique({ where: { email } });
    if (emailExists) {
      return NextResponse.json(
        { error: "Email já cadastrado por outro usuário" },
        { status: 400 }
      );
    }
  }

  const validRoles = ["ADMIN", "GESTOR", "FINANCEIRO", "INVESTOR", "CONSUMER"];
  if (role && !validRoles.includes(role)) {
    return NextResponse.json({ error: "Perfil inválido" }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {};
  if (name !== undefined) updateData.name = name;
  if (email !== undefined) updateData.email = email;
  if (role !== undefined) updateData.role = role;
  if (active !== undefined) updateData.active = active;
  if (password) updateData.passwordHash = hashSync(password, 10);

  const updatedUser = await prisma.user.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      active: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(updatedUser);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Não permitir deletar o próprio usuário
  if (id === session.user.id) {
    return NextResponse.json(
      { error: "Você não pode excluir sua própria conta" },
      { status: 400 }
    );
  }

  const existingUser = await prisma.user.findUnique({ where: { id } });
  if (!existingUser) {
    return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
  }

  // Soft delete - desativar ao invés de deletar
  await prisma.user.update({
    where: { id },
    data: { active: false },
  });

  return NextResponse.json({ message: "Usuário desativado com sucesso" });
}

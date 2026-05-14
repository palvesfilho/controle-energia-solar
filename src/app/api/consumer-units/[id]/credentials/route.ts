import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";
import { encrypt } from "@/lib/crypto";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const credential = await prisma.cpflCredential.findUnique({
    where: { consumerUnitId: id },
  });

  if (!credential) {
    return NextResponse.json(null);
  }

  return NextResponse.json({
    id: credential.id,
    consumerUnitId: credential.consumerUnitId,
    emailCpfl: credential.emailCpfl,
    instalacao: credential.instalacao,
    distribuidora: credential.distribuidora,
    ultimaSync: credential.ultimaSync,
    statusSync: credential.statusSync,
    erroSync: credential.erroSync,
    active: credential.active,
    hasSenha: true,
    createdAt: credential.createdAt,
    updatedAt: credential.updatedAt,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const unit = await prisma.consumerUnit.findUnique({ where: { id } });
  if (!unit) {
    return NextResponse.json({ error: "Unidade consumidora não encontrada" }, { status: 404 });
  }

  const body = await req.json();
  const { emailCpfl, senhaCpfl, instalacao, distribuidora } = body;

  if (!emailCpfl || !instalacao) {
    return NextResponse.json(
      { error: "Email e instalação são obrigatórios" },
      { status: 400 }
    );
  }

  const existing = await prisma.cpflCredential.findUnique({
    where: { consumerUnitId: id },
  });

  if (existing) {
    const data: Record<string, unknown> = {
      emailCpfl,
      instalacao,
      distribuidora: distribuidora || "RGE",
    };
    if (senhaCpfl) data.senhaCpfl = encrypt(senhaCpfl);

    const updated = await prisma.cpflCredential.update({
      where: { consumerUnitId: id },
      data,
    });

    return NextResponse.json({
      id: updated.id,
      emailCpfl: updated.emailCpfl,
      instalacao: updated.instalacao,
      distribuidora: updated.distribuidora,
      active: updated.active,
    });
  }

  if (!senhaCpfl) {
    return NextResponse.json(
      { error: "Senha é obrigatória para criar credencial" },
      { status: 400 }
    );
  }

  const credential = await prisma.cpflCredential.create({
    data: {
      consumerUnitId: id,
      emailCpfl,
      senhaCpfl: encrypt(senhaCpfl),
      instalacao,
      distribuidora: distribuidora || "RGE",
      statusSync: "PENDING",
    },
  });

  return NextResponse.json(
    {
      id: credential.id,
      emailCpfl: credential.emailCpfl,
      instalacao: credential.instalacao,
      distribuidora: credential.distribuidora,
      active: credential.active,
    },
    { status: 201 }
  );
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

  const credential = await prisma.cpflCredential.findUnique({
    where: { consumerUnitId: id },
  });

  if (!credential) {
    return NextResponse.json({ error: "Credencial não encontrada" }, { status: 404 });
  }

  await prisma.cpflCredential.delete({ where: { consumerUnitId: id } });

  return NextResponse.json({ success: true });
}

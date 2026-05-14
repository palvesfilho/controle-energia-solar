import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";
import { hashSync } from "bcryptjs";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const investors = await prisma.investor.findMany({
    include: {
      user: { select: { id: true, email: true, name: true, active: true } },
      plants: { include: { plant: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(investors);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const {
    name, email, password, phone, document,
    cpf, dataNascimento, endereco, numero, complemento, cep, bairro, cidade,
    nomeEmpresa, cnpj, enderecoEmpresa, numeroEmpresa, complementoEmpresa,
    cepEmpresa, bairroEmpresa, cidadeEmpresa, chavePix,
    additionalEmails,
  } = body;

  // additionalEmails chega como array de strings; normaliza, deduplica
  // (excluindo o email principal) e serializa pra string JSON.
  const normalizedAdditional = Array.isArray(additionalEmails)
    ? Array.from(
        new Set(
          additionalEmails
            .filter((e: unknown): e is string => typeof e === "string")
            .map((e: string) => e.trim().toLowerCase())
            .filter((e: string) => e.length > 0 && e !== String(email ?? "").trim().toLowerCase()),
        ),
      )
    : [];

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return NextResponse.json(
      { error: "Email ja cadastrado" },
      { status: 400 }
    );
  }

  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash: hashSync(password, 10),
      role: "INVESTOR",
      investor: {
        create: {
          phone: phone || null,
          document: document || null,
          cpf: cpf || null,
          dataNascimento: dataNascimento ? new Date(dataNascimento) : null,
          endereco: endereco || null,
          numero: numero || null,
          complemento: complemento || null,
          cep: cep || null,
          bairro: bairro || null,
          cidade: cidade || null,
          nomeEmpresa: nomeEmpresa || null,
          cnpj: cnpj || null,
          enderecoEmpresa: enderecoEmpresa || null,
          numeroEmpresa: numeroEmpresa || null,
          complementoEmpresa: complementoEmpresa || null,
          cepEmpresa: cepEmpresa || null,
          bairroEmpresa: bairroEmpresa || null,
          cidadeEmpresa: cidadeEmpresa || null,
          chavePix: chavePix || null,
          additionalEmails: normalizedAdditional.length > 0
            ? JSON.stringify(normalizedAdditional)
            : null,
        },
      },
    },
    include: { investor: true },
  });

  return NextResponse.json(user, { status: 201 });
}

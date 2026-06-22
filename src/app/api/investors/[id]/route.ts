import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
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

  const investor = await prisma.investor.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, email: true, name: true, active: true } },
      plants: {
        include: {
          plant: {
            include: {
              consumers: {
                include: { consumer: true },
              },
            },
          },
        },
      },
    },
  });

  if (!investor) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(investor);
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
  const {
    name, email, active, phone, document,
    cpf, dataNascimento, endereco, numero, complemento, cep, bairro, cidade,
    nomeEmpresa, cnpj, enderecoEmpresa, numeroEmpresa, complementoEmpresa,
    cepEmpresa, bairroEmpresa, cidadeEmpresa, chavePix,
    additionalEmails,
  } = body;

  // additionalEmails: undefined = não atualiza; array (mesmo vazio) = substitui.
  let normalizedAdditional: string | null | undefined = undefined;
  if (Array.isArray(additionalEmails)) {
    const list = Array.from(
      new Set(
        additionalEmails
          .filter((e: unknown): e is string => typeof e === "string")
          .map((e: string) => e.trim().toLowerCase())
          .filter((e: string) => e.length > 0 && e !== String(email ?? "").trim().toLowerCase()),
      ),
    );
    normalizedAdditional = list.length > 0 ? JSON.stringify(list) : null;
  }

  const investor = await prisma.investor.findUnique({
    where: { id },
    include: { user: true },
  });

  if (!investor) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: investor.userId },
      data: {
        ...(name !== undefined && { name }),
        ...(email !== undefined && { email }),
        ...(active !== undefined && { active }),
      },
    }),
    prisma.investor.update({
      where: { id },
      data: {
        ...(phone !== undefined && { phone }),
        ...(document !== undefined && { document }),
        ...(cpf !== undefined && { cpf }),
        ...(dataNascimento !== undefined && { dataNascimento: dataNascimento ? new Date(dataNascimento) : null }),
        ...(endereco !== undefined && { endereco }),
        ...(numero !== undefined && { numero }),
        ...(complemento !== undefined && { complemento }),
        ...(cep !== undefined && { cep }),
        ...(bairro !== undefined && { bairro }),
        ...(cidade !== undefined && { cidade }),
        ...(nomeEmpresa !== undefined && { nomeEmpresa }),
        ...(cnpj !== undefined && { cnpj }),
        ...(enderecoEmpresa !== undefined && { enderecoEmpresa }),
        ...(numeroEmpresa !== undefined && { numeroEmpresa }),
        ...(complementoEmpresa !== undefined && { complementoEmpresa }),
        ...(cepEmpresa !== undefined && { cepEmpresa }),
        ...(bairroEmpresa !== undefined && { bairroEmpresa }),
        ...(cidadeEmpresa !== undefined && { cidadeEmpresa }),
        ...(chavePix !== undefined && { chavePix }),
        ...(normalizedAdditional !== undefined && { additionalEmails: normalizedAdditional }),
      },
    }),
  ]);

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

  const investor = await prisma.investor.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          plants: true,
          payables: true,
          reports: true,
          settlements: true,
          debits: true,
        },
      },
    },
  });

  if (!investor) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const blockers: string[] = [];
  if (investor._count.plants > 0) blockers.push(`${investor._count.plants} usina(s) vinculada(s)`);
  if (investor._count.payables > 0) blockers.push(`${investor._count.payables} pagamento(s)`);
  if (investor._count.reports > 0) blockers.push(`${investor._count.reports} relatório(s)`);
  if (investor._count.settlements > 0) blockers.push(`${investor._count.settlements} fechamento(s)`);
  if (investor._count.debits > 0) blockers.push(`${investor._count.debits} débito(s)`);

  if (blockers.length > 0) {
    return NextResponse.json(
      {
        error: "Investidor possui vínculos e não pode ser excluído",
        details: blockers,
      },
      { status: 409 },
    );
  }

  // Sem vínculos: hard-delete via User (cascade apaga o Investor).
  await prisma.user.delete({ where: { id: investor.userId } });

  return NextResponse.json({ success: true });
}

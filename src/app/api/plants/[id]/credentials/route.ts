import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";
import { encrypt } from "@/lib/crypto";
import { normalizeCodigoUc } from "@/lib/uc-codigo";
import { normalizeConcessionaria } from "@/lib/concessionarias";

/**
 * A concessionária da credencial NÃO é escolhida à parte: é a mesma do cadastro
 * da usina. `Plant.concessionaria` é o campo que as telas preenchem;
 * `Plant.distribuidora` existe no schema mas nenhuma tela grava, então entra só
 * como fallback. O valor da própria credencial é o último recurso (legado).
 */
function concessionariaDaUsina(
  plantConcessionaria: string | null,
  plantDistribuidora?: string | null,
  credDistribuidora?: string | null,
): string {
  return (
    normalizeConcessionaria(plantConcessionaria) ??
    normalizeConcessionaria(plantDistribuidora) ??
    normalizeConcessionaria(credDistribuidora) ??
    "RGE/CPFL"
  );
}

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
    where: { plantId: id },
    include: {
      plant: { select: { concessionaria: true, distribuidora: true } },
    },
  });

  if (!credential) {
    return NextResponse.json(null);
  }

  return NextResponse.json({
    id: credential.id,
    plantId: credential.plantId,
    emailCpfl: credential.emailCpfl,
    instalacao: credential.instalacao,
    distribuidora: concessionariaDaUsina(
      credential.plant?.concessionaria ?? null,
      credential.plant?.distribuidora,
      credential.distribuidora,
    ),
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

  const plant = await prisma.plant.findUnique({ where: { id } });
  if (!plant) {
    return NextResponse.json({ error: "Usina não encontrada" }, { status: 404 });
  }

  const body = await req.json();
  const { emailCpfl, senhaCpfl } = body;
  // Derivada do cadastro da usina — a tela não pergunta mais.
  const distribuidora = concessionariaDaUsina(
    plant.concessionaria,
    plant.distribuidora,
  );
  // A tela exibe o código no padrão da concessionária (3.562.981.001-26); o
  // portal/Infosimples é chaveado por dígitos.
  const instalacao = normalizeCodigoUc(body.instalacao);

  if (!emailCpfl || !instalacao) {
    return NextResponse.json(
      { error: "Email e código do cliente são obrigatórios" },
      { status: 400 }
    );
  }

  const existing = await prisma.cpflCredential.findUnique({
    where: { plantId: id },
  });

  if (existing) {
    const data: Record<string, unknown> = {
      emailCpfl,
      instalacao,
      distribuidora,
    };
    if (senhaCpfl) data.senhaCpfl = encrypt(senhaCpfl);

    const updated = await prisma.cpflCredential.update({
      where: { plantId: id },
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
      plantId: id,
      emailCpfl,
      senhaCpfl: encrypt(senhaCpfl),
      instalacao,
      distribuidora,
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
    where: { plantId: id },
  });

  if (!credential) {
    return NextResponse.json({ error: "Credencial não encontrada" }, { status: 404 });
  }

  await prisma.cpflCredential.delete({ where: { plantId: id } });

  return NextResponse.json({ success: true });
}

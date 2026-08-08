import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { normalizarNomeEmpresa } from "@/lib/marca-inversor";

/**
 * Lista reutilizável de empresas que NÃO são a Brasil Solar e executaram o
 * sistema do cliente (`executadoPor = TERCEIRO`).
 *
 * Guarda só o nome, a pedido do Paulo (07/08/2026): o objetivo é ESCOLHER de uma
 * lista em vez de digitar, para a mesma empresa não virar várias grafias.
 */

// GET /api/brasil-solar/empresas-terceiras — lista pro seletor
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const empresas = await prisma.empresaTerceira.findMany({
    where: { active: true },
    orderBy: { nome: "asc" },
    select: {
      id: true,
      nome: true,
      _count: { select: { proprietarios: true } },
    },
  });

  return NextResponse.json({ empresas });
}

// POST /api/brasil-solar/empresas-terceiras — cria (ou devolve a existente)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const nome = String(body?.nome ?? "").trim();

  if (nome.length < 2) {
    return NextResponse.json(
      { error: "Informe o nome da empresa (mínimo 2 caracteres)" },
      { status: 400 },
    );
  }

  const nomeNormalizado = normalizarNomeEmpresa(nome);

  // Idempotente de propósito: se já existe com a mesma chave normalizada,
  // devolve a existente em vez de estourar P2002. O operador que digitou
  // "SOLAR SUL" onde já havia "Solar Sul" quer a mesma empresa, não um erro.
  const existente = await prisma.empresaTerceira.findUnique({
    where: { nomeNormalizado },
    select: { id: true, nome: true, active: true },
  });

  if (existente) {
    // Reativa se estava desativada — escolher uma empresa arquivada é intenção
    // de usá-la de novo.
    if (!existente.active) {
      await prisma.empresaTerceira.update({
        where: { id: existente.id },
        data: { active: true },
      });
    }
    return NextResponse.json({ empresa: existente, jaExistia: true });
  }

  const empresa = await prisma.empresaTerceira.create({
    data: { nome, nomeNormalizado },
    select: { id: true, nome: true },
  });

  return NextResponse.json({ empresa, jaExistia: false }, { status: 201 });
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { canAccessSection } from "@/lib/roles";
import { parseDateOnly } from "@/lib/obra-calendario";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !canAccessSection(session.user.role, "obra")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const aprovacaoParam = req.nextUrl.searchParams.get("aprovacao");

  const where: { active: boolean; aprovacao?: string } = { active: true };
  if (aprovacaoParam) {
    where.aprovacao = aprovacaoParam.toUpperCase();
  } else {
    // Padrão: cronograma só mostra obras já aceitas
    where.aprovacao = "ACEITA";
  }

  try {
    const obras = await prisma.obra.findMany({
      where,
      include: {
        _count: { select: { tarefas: true } },
        equipe: { select: { id: true, nome: true, cor: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(obras);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/obras] erro:", err);
    return NextResponse.json(
      { error: msg, hint: "Se mencionar 'prisma.obra' ou 'Unknown arg', rode `npx prisma generate` com o dev server parado." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !canAccessSection(session.user.role, "obra")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  if (!body.nome) {
    return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
  }

  const obra = await prisma.obra.create({
    data: {
      nome: body.nome,
      descricao: body.descricao || null,
      responsavel: body.responsavel || null,
      cliente: body.cliente || null,
      local: body.local || null,
      status: body.status || "PLANEJAMENTO",
      dataInicioPrevista: parseDateOnly(body.dataInicioPrevista),
      dataFimPrevista: parseDateOnly(body.dataFimPrevista),
      plantId: body.plantId || null,
      brasilSolarClientId: body.brasilSolarClientId || null,
      observacoes: body.observacoes || null,
    },
  });

  return NextResponse.json(obra, { status: 201 });
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { canAccessSection } from "@/lib/roles";
import { LISTA_MATERIAIS_TEMPLATE } from "@/lib/obra-lista-materiais-template";

export const runtime = "nodejs";

async function getOrCreateLista(obraId: string) {
  const existing = await prisma.obraListaMaterial.findUnique({
    where: { obraId },
    include: { itens: { orderBy: { ordem: "asc" } } },
  });
  if (existing) return existing;

  const obra = await prisma.obra.findUnique({ where: { id: obraId } });
  if (!obra) return null;

  return prisma.obraListaMaterial.create({
    data: {
      obraId,
      responsavel: obra.responsavel ?? null,
      itens: {
        create: LISTA_MATERIAIS_TEMPLATE.map((t, i) => ({
          categoria: t.categoria,
          descricao: t.descricao,
          especificacao: t.especificacao,
          quantidade: t.quantidade,
          ordem: i,
        })),
      },
    },
    include: { itens: { orderBy: { ordem: "asc" } } },
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || !canAccessSection(session.user.role, "obra")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { id } = await params;
  const lista = await getOrCreateLista(id);
  if (!lista) {
    return NextResponse.json({ error: "Obra não encontrada" }, { status: 404 });
  }
  const obra = await prisma.obra.findUnique({
    where: { id },
    select: { id: true, nome: true, cliente: true, local: true, responsavel: true },
  });
  return NextResponse.json({ lista, obra });
}

const itemSchema = z.object({
  id: z.string().optional(),
  categoria: z.string().min(1),
  descricao: z.string().min(1),
  especificacao: z.string().nullable().optional(),
  quantidade: z.string().min(1),
  ordem: z.number().int().min(0),
});

const putSchema = z.object({
  responsavel: z.string().nullable().optional(),
  numeroSerieInversor: z.string().nullable().optional(),
  observacoes: z.string().nullable().optional(),
  itens: z.array(itemSchema),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || !canAccessSection(session.user.role, "obra")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { id } = await params;

  const body = await req.json();
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const lista = await getOrCreateLista(id);
  if (!lista) {
    return NextResponse.json({ error: "Obra não encontrada" }, { status: 404 });
  }

  const { itens, responsavel, numeroSerieInversor, observacoes } = parsed.data;

  await prisma.$transaction([
    prisma.obraListaMaterial.update({
      where: { id: lista.id },
      data: {
        responsavel: responsavel ?? null,
        numeroSerieInversor: numeroSerieInversor ?? null,
        observacoes: observacoes ?? null,
      },
    }),
    prisma.obraListaMaterialItem.deleteMany({ where: { listaId: lista.id } }),
    prisma.obraListaMaterialItem.createMany({
      data: itens.map((it, i) => ({
        listaId: lista.id,
        categoria: it.categoria,
        descricao: it.descricao,
        especificacao: it.especificacao ?? null,
        quantidade: it.quantidade,
        ordem: it.ordem ?? i,
      })),
    }),
  ]);

  const updated = await prisma.obraListaMaterial.findUnique({
    where: { id: lista.id },
    include: { itens: { orderBy: { ordem: "asc" } } },
  });
  return NextResponse.json({ lista: updated });
}

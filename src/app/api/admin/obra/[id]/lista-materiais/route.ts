import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { z } from "zod";
import { authOptions } from "@/lib/auth-options";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canAccessSection } from "@/lib/roles";
import { LISTA_MATERIAIS_TEMPLATE } from "@/lib/obra-lista-materiais-template";
import {
  podeEditarLista,
  podeLiberarLista,
  podeReabrirLista,
  podeSepararLista,
} from "@/lib/obra-lista-materiais-permissoes";

export const runtime = "nodejs";

const LISTA_INCLUDE = {
  itens: { orderBy: { ordem: "asc" } },
  fotos: { orderBy: { createdAt: "asc" } },
  equipeRetirada: { select: { id: true, nome: true } },
} as const;

export async function getOrCreateLista(obraId: string) {
  const existing = await prisma.obraListaMaterial.findUnique({
    where: { obraId },
    include: LISTA_INCLUDE,
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
    include: LISTA_INCLUDE,
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

  // Seletor da empresa/equipe que veio buscar o material — só as ativas, mais
  // a que já ficou registrada nesta lista (mesmo que tenha sido desativada
  // depois, senão o campo aparece vazio numa retirada já assinada).
  const equipes = await prisma.equipeExecucao.findMany({
    where: {
      OR: [
        { active: true },
        ...(lista.equipeRetiradaId ? [{ id: lista.equipeRetiradaId }] : []),
      ],
    },
    orderBy: [{ active: "desc" }, { nome: "asc" }],
    select: { id: true, nome: true, active: true },
  });

  const role = session.user.role;
  return NextResponse.json({
    lista,
    obra,
    equipes,
    permissoes: {
      editarLista: podeEditarLista(role, lista.status),
      liberar: podeLiberarLista(role, lista.status),
      separar: podeSepararLista(role, lista.status),
      reabrir: podeReabrirLista(role, lista.status),
    },
  });
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

  if (!podeEditarLista(session.user.role, lista.status)) {
    return NextResponse.json(
      {
        error:
          lista.status === "RETIRADA"
            ? "Retirada já fechada — reabra a lista para editar."
            : "Seu perfil não edita a lista de materiais, apenas a separação.",
      },
      { status: 403 }
    );
  }

  const { itens, responsavel, numeroSerieInversor, observacoes } = parsed.data;

  // Sincroniza por id em vez de apagar-e-recriar: apagar zeraria, calado, o que
  // o gestor de obras já marcou como separado numa lista liberada.
  const existentes = new Map(lista.itens.map((it) => [it.id, it]));
  const mantidos = new Set<string>();

  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.obraListaMaterial.update({
      where: { id: lista.id },
      data: {
        responsavel: responsavel ?? null,
        numeroSerieInversor: numeroSerieInversor ?? null,
        observacoes: observacoes ?? null,
      },
    }),
  ];

  itens.forEach((it, i) => {
    const ordem = it.ordem ?? i;
    const atual = it.id ? existentes.get(it.id) : undefined;
    if (atual) {
      mantidos.add(atual.id);
      ops.push(
        prisma.obraListaMaterialItem.update({
          where: { id: atual.id },
          data: {
            categoria: it.categoria,
            descricao: it.descricao,
            especificacao: it.especificacao ?? null,
            quantidade: it.quantidade,
            ordem,
          },
        })
      );
    } else {
      ops.push(
        prisma.obraListaMaterialItem.create({
          data: {
            listaId: lista.id,
            categoria: it.categoria,
            descricao: it.descricao,
            especificacao: it.especificacao ?? null,
            quantidade: it.quantidade,
            ordem,
          },
        })
      );
    }
  });

  const removidos = lista.itens
    .filter((it) => !mantidos.has(it.id))
    .map((it) => it.id);
  if (removidos.length) {
    ops.push(
      prisma.obraListaMaterialItem.deleteMany({
        where: { id: { in: removidos } },
      })
    );
  }

  await prisma.$transaction(ops);

  const updated = await prisma.obraListaMaterial.findUnique({
    where: { id: lista.id },
    include: LISTA_INCLUDE,
  });
  return NextResponse.json({ lista: updated });
}

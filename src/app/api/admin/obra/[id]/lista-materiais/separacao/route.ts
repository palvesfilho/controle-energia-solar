import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { z } from "zod";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { canAccessSection } from "@/lib/roles";
import { podeSepararLista } from "@/lib/obra-lista-materiais-permissoes";

export const runtime = "nodejs";

// Assinatura vem como data URL PNG do canvas. Teto de ~1 MB de base64 para não
// deixar um traço gigante estourar a linha do banco.
const ASSINATURA_MAX = 1_000_000;
const assinaturaSchema = z
  .string()
  .max(ASSINATURA_MAX, "Assinatura grande demais")
  .refine((v) => v.startsWith("data:image/png;base64,"), {
    message: "Assinatura inválida",
  })
  .nullable()
  .optional();

const patchSchema = z.object({
  itens: z
    .array(
      z.object({
        id: z.string().min(1),
        separado: z.boolean(),
        quantidadeSeparada: z.string().nullable().optional(),
      })
    )
    .optional(),
  equipeRetiradaId: z.string().nullable().optional(),
  retiradoPor: z.string().nullable().optional(),
  assinaturaEntregouNome: z.string().nullable().optional(),
  assinaturaEntregouData: assinaturaSchema,
  assinaturaRetirouNome: z.string().nullable().optional(),
  assinaturaRetirouData: assinaturaSchema,
  observacoesSeparacao: z.string().nullable().optional(),
});

function limpa(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const t = v.trim();
  return t.length ? t : null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || !canAccessSection(session.user.role, "obra")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { id } = await params;

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const lista = await prisma.obraListaMaterial.findUnique({
    where: { obraId: id },
    include: { itens: { select: { id: true } } },
  });
  if (!lista) {
    return NextResponse.json({ error: "Lista não encontrada" }, { status: 404 });
  }

  if (!podeSepararLista(session.user.role, lista.status)) {
    return NextResponse.json(
      {
        error:
          lista.status === "RASCUNHO"
            ? "Lista ainda não liberada — o escritório precisa clicar em Gerar Lista."
            : "Retirada já fechada — reabra a lista para alterar.",
      },
      { status: 403 }
    );
  }

  const d = parsed.data;

  if (d.equipeRetiradaId) {
    const equipe = await prisma.equipeExecucao.findUnique({
      where: { id: d.equipeRetiradaId },
      select: { id: true },
    });
    if (!equipe) {
      return NextResponse.json(
        { error: "Equipe não encontrada" },
        { status: 400 }
      );
    }
  }

  const idsDaLista = new Set(lista.itens.map((it) => it.id));
  const itens = (d.itens ?? []).filter((it) => idsDaLista.has(it.id));

  await prisma.$transaction([
    prisma.obraListaMaterial.update({
      where: { id: lista.id },
      data: {
        equipeRetiradaId: d.equipeRetiradaId ?? null,
        retiradoPor: limpa(d.retiradoPor),
        assinaturaEntregouNome: limpa(d.assinaturaEntregouNome),
        assinaturaEntregouData: d.assinaturaEntregouData ?? null,
        assinaturaRetirouNome: limpa(d.assinaturaRetirouNome),
        assinaturaRetirouData: d.assinaturaRetirouData ?? null,
        observacoesSeparacao: limpa(d.observacoesSeparacao),
      },
    }),
    ...itens.map((it) =>
      prisma.obraListaMaterialItem.update({
        where: { id: it.id },
        data: {
          separado: it.separado,
          quantidadeSeparada: limpa(it.quantidadeSeparada),
        },
      })
    ),
  ]);

  const updated = await prisma.obraListaMaterial.findUnique({
    where: { id: lista.id },
    include: {
      itens: { orderBy: { ordem: "asc" } },
      fotos: { orderBy: { createdAt: "asc" } },
      equipeRetirada: { select: { id: true, nome: true } },
    },
  });
  return NextResponse.json({ lista: updated });
}

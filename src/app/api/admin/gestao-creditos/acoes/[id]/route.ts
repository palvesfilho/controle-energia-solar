import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { canAccessSection } from "@/lib/roles";

// PATCH /api/admin/gestao-creditos/acoes/[id]
// Body: { status?, responsavelUserId?, observacaoResolucao? }
// Status: ABERTA | FEITA | DISPENSADA
export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session || !canAccessSection(session.user.role, "gestaoCreditos")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await ctx.params;
  let body: {
    status?: string;
    responsavelUserId?: string | null;
    observacaoResolucao?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.status !== undefined) {
    if (!["ABERTA", "FEITA", "DISPENSADA"].includes(body.status)) {
      return NextResponse.json(
        { error: "status inválido (use ABERTA, FEITA ou DISPENSADA)" },
        { status: 400 },
      );
    }
    updates.status = body.status;
    if (body.status === "FEITA" || body.status === "DISPENSADA") {
      updates.resolvidaEm = new Date();
      updates.resolvidaPorUserId = session.user.id;
    } else {
      // Reabertura limpa o registro de resolução
      updates.resolvidaEm = null;
      updates.resolvidaPorUserId = null;
    }
  }

  if (body.responsavelUserId !== undefined) {
    if (body.responsavelUserId === null || body.responsavelUserId === "") {
      updates.responsavelUserId = null;
    } else {
      const existe = await prisma.user.findUnique({
        where: { id: body.responsavelUserId },
        select: { id: true },
      });
      if (!existe) {
        return NextResponse.json(
          { error: "responsavelUserId não encontrado" },
          { status: 400 },
        );
      }
      updates.responsavelUserId = body.responsavelUserId;
    }
  }

  if (body.observacaoResolucao !== undefined) {
    updates.observacaoResolucao = body.observacaoResolucao || null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "nenhum campo pra atualizar" },
      { status: 400 },
    );
  }

  try {
    const updated = await prisma.acaoRecomendada.update({
      where: { id },
      data: updates,
      include: {
        responsavel: { select: { id: true, name: true } },
        resolvidaPor: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json(updated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[PATCH /acoes/:id]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

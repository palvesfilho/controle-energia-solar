import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

/**
 * PATCH /api/plants/[id]/rateios/[versionId]
 * Edita um rateio existente (qualquer status). Substitui completamente os items
 * pelos novos. Útil pra corrigir erros de digitação sem precisar criar uma nova
 * versão e descartar a anterior.
 *
 * IMPORTANTE: payables já criados a partir desta versão NÃO são recalculados
 * automaticamente — eles preservam o snapshot do contrato no momento da criação.
 * Se a edição precisar refletir nos payables, rode `apply-cap-payables.ts --apply`
 * e (futuramente) um script de recálculo de valorBruto.
 *
 * Body: { items: [{consumerUnitId, percentual}], observacao?, vigenteAPartirDe? }
 * Validações idênticas ao POST.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id: plantId, versionId } = await params;

  const version = await prisma.rateioVersion.findUnique({
    where: { id: versionId },
    select: { id: true, plantId: true, status: true },
  });
  if (!version || version.plantId !== plantId) {
    return NextResponse.json(
      { error: "Rateio não encontrado" },
      { status: 404 },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    items?: Array<{ consumerUnitId?: string; percentual?: number }>;
    observacao?: string | null;
    vigenteAPartirDe?: string;
  } | null;

  if (!body || !Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json(
      { error: "Envie pelo menos um item com consumerUnitId e percentual" },
      { status: 400 },
    );
  }

  const items = body.items
    .map((it) => ({
      consumerUnitId: String(it.consumerUnitId ?? ""),
      percentual: Number(it.percentual),
    }))
    .filter((it) => it.consumerUnitId && Number.isFinite(it.percentual));

  if (items.length !== body.items.length) {
    return NextResponse.json(
      { error: "Cada item precisa ter consumerUnitId e percentual numérico" },
      { status: 400 },
    );
  }

  const ids = items.map((i) => i.consumerUnitId);
  if (new Set(ids).size !== ids.length) {
    return NextResponse.json(
      { error: "Há unidades consumidoras duplicadas no rateio" },
      { status: 400 },
    );
  }

  for (const it of items) {
    if (it.percentual < 0 || it.percentual > 100) {
      return NextResponse.json(
        { error: "Percentual deve estar entre 0 e 100" },
        { status: 400 },
      );
    }
  }

  const soma = items.reduce((s, it) => s + it.percentual, 0);
  if (Math.abs(soma - 100) > 0.01) {
    return NextResponse.json(
      { error: `A soma dos percentuais precisa ser 100% (atual: ${soma.toFixed(2)}%)` },
      { status: 400 },
    );
  }

  const unitsNaPlant = await prisma.consumerUnit.findMany({
    where: { plantId, active: true, id: { in: ids } },
    select: { id: true },
  });
  if (unitsNaPlant.length !== ids.length) {
    return NextResponse.json(
      {
        error:
          "Uma ou mais unidades consumidoras não pertencem a esta usina (ou estão inativas)",
      },
      { status: 400 },
    );
  }

  // Parse vigenteAPartirDe (mesmo formato do POST)
  let vigenteAPartirDe: Date | undefined;
  if (typeof body.vigenteAPartirDe === "string" && body.vigenteAPartirDe.trim()) {
    const raw = body.vigenteAPartirDe.trim();
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    const parsed = m
      ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
      : new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json(
        { error: "vigenteAPartirDe inválida. Use YYYY-MM-DD." },
        { status: 400 },
      );
    }
    vigenteAPartirDe = parsed;
  }

  // Substitui items + atualiza metadados, em transação.
  await prisma.$transaction([
    prisma.rateioItem.deleteMany({ where: { versionId } }),
    prisma.rateioItem.createMany({
      data: items.map((it) => ({
        versionId,
        consumerUnitId: it.consumerUnitId,
        percentual: it.percentual,
      })),
    }),
    prisma.rateioVersion.update({
      where: { id: versionId },
      data: {
        ...(body.observacao !== undefined && {
          observacao: body.observacao?.trim() || null,
        }),
        ...(vigenteAPartirDe !== undefined && { vigenteAPartirDe }),
      },
    }),
  ]);

  return NextResponse.json({ ok: true, status: version.status });
}

/**
 * DELETE /api/plants/[id]/rateios/[versionId]
 * Exclui uma versão de rateio permanentemente.
 *
 * Comportamento:
 *  - Qualquer InvestorPayable que referenciava essa versão tem seu
 *    rateioVersionId setado pra NULL (preserva histórico de pagamento).
 *  - Os items (RateioItem) são apagados em cascata pelo schema.
 *  - Se a versão deletada era VIGENTE, a usina fica temporariamente sem rateio
 *    vigente (aviso já deve ser dado no UI antes de chamar).
 *
 * Não restringe por status — gestor pode apagar qualquer versão.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id: plantId, versionId } = await params;

  const version = await prisma.rateioVersion.findUnique({
    where: { id: versionId },
    select: { id: true, plantId: true, status: true },
  });
  if (!version || version.plantId !== plantId) {
    return NextResponse.json(
      { error: "Rateio não encontrado" },
      { status: 404 },
    );
  }

  const payablesLinkadas = await prisma.investorPayable.count({
    where: { rateioVersionId: versionId },
  });

  await prisma.$transaction([
    // Desvincula payables (preserva o histórico de pagamento).
    prisma.investorPayable.updateMany({
      where: { rateioVersionId: versionId },
      data: { rateioVersionId: null },
    }),
    // Deleta a versão; items são removidos em cascata pelo schema.
    prisma.rateioVersion.delete({
      where: { id: versionId },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    deletedStatus: version.status,
    payablesDesvinculadas: payablesLinkadas,
  });
}

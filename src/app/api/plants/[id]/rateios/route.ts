import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/plants/[id]/rateios — cria uma nova versão de rateio para a usina
 * com status PENDENTE_ACEITE. O rateio VIGENTE atual (se houver) continua
 * válido até que o pendente seja aceito pela concessionária. Se já existe um
 * PENDENTE_ACEITE para esta usina, rejeita a criação (só pode haver um
 * pendente de cada vez).
 *
 * Body: {
 *   items: [{ consumerUnitId: string, percentual: number }],
 *   observacao?: string,
 *   vigenteAPartirDe?: string, // ISO date. Default = hoje.
 * }
 *
 * Validações:
 *  - items.length >= 1
 *  - Nenhuma UC duplicada
 *  - Toda UC pertence à Plant
 *  - Soma dos percentuais = 100 (tolerância 0,01)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id: plantId } = await params;

  const body = (await req.json().catch(() => null)) as {
    items?: Array<{ consumerUnitId?: string; percentual?: number }>;
    observacao?: string;
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
  const unique = new Set(ids);
  if (unique.size !== ids.length) {
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

  // Aceita "YYYY-MM-DD" ou ISO completo. Normaliza pra 00:00 local
  // (o que importa é a data — a hora não entra no match por mês de referência).
  let vigenteAPartirDe: Date = new Date();
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

  const plant = await prisma.plant.findUnique({
    where: { id: plantId },
    select: { id: true },
  });
  if (!plant) {
    return NextResponse.json({ error: "Usina não encontrada" }, { status: 404 });
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

  const jaPendente = await prisma.rateioVersion.findFirst({
    where: { plantId, status: "PENDENTE_ACEITE" },
    select: { id: true },
  });
  if (jaPendente) {
    return NextResponse.json(
      {
        error:
          "Já existe um rateio pendente de aceite para esta usina. Aceite ou rejeite antes de criar um novo.",
      },
      { status: 409 },
    );
  }

  const created = await prisma.rateioVersion.create({
    data: {
      plantId,
      status: "PENDENTE_ACEITE",
      observacao: body.observacao?.trim() || null,
      vigenteAPartirDe,
      criadoPorUserId: session.user.id,
      items: {
        create: items.map((it) => ({
          consumerUnitId: it.consumerUnitId,
          percentual: it.percentual,
        })),
      },
    },
    include: {
      items: {
        include: {
          consumerUnit: {
            select: {
              id: true,
              nome: true,
              codigoUc: true,
              cidade: true,
              distribuidora: true,
            },
          },
        },
      },
    },
  });

  return NextResponse.json(
    {
      id: created.id,
      status: created.status,
      observacao: created.observacao,
      vigenteAPartirDe: created.vigenteAPartirDe,
      criadoEm: created.criadoEm,
      items: created.items.map((it) => ({
        id: it.id,
        percentual: it.percentual,
        consumerUnit: it.consumerUnit,
      })),
    },
    { status: 201 },
  );
}

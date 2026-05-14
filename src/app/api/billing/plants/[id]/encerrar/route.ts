import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isFullAdmin } from "@/lib/roles";
import { cascadeUnpaidPayablesToNextMonth } from "@/lib/cascade-unpaid-payables";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/billing/plants/[id]/encerrar
 *
 * Re-encerra um faturamento mensal apos uma reabertura (quando o ADMIN
 * terminou de ajustar e quer travar de novo, sem precisar remover e
 * re-uploadar o comprovante).
 *
 * Exige que o comprovante de pagamento ja esteja anexado — sem ele, o
 * encerramento nao faz sentido (o mes nao esta pago de fato).
 *
 * Apenas role ADMIN. (FINANCE encerra automaticamente ao subir o
 * comprovante; este endpoint cobre apenas o caso de re-fechamento.)
 */
export async function POST(_req: NextRequest, ctx: RouteCtx) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isFullAdmin(session.user.role)) {
    return NextResponse.json(
      { error: "Apenas ADMIN pode re-encerrar um mês reaberto." },
      { status: 403 },
    );
  }

  const { id } = await ctx.params;
  const billing = await prisma.plantBilling.findUnique({
    where: { id },
    select: {
      id: true,
      encerradoEm: true,
      comprovantePagamentoUrl: true,
      semPagamentoMotivo: true,
    },
  });
  if (!billing) {
    return NextResponse.json(
      { error: "Faturamento não encontrado" },
      { status: 404 },
    );
  }
  if (billing.encerradoEm) {
    return NextResponse.json(
      { error: "Mês já está encerrado." },
      { status: 400 },
    );
  }
  // Aceita re-encerrar se tiver comprovante OU motivo "sem pagamento" registrado.
  if (!billing.comprovantePagamentoUrl && !billing.semPagamentoMotivo) {
    return NextResponse.json(
      {
        error:
          "Anexe o comprovante de pagamento antes de encerrar o mês — ou use 'Sem pagamento no mês'.",
      },
      { status: 400 },
    );
  }

  const updated = await prisma.plantBilling.update({
    where: { id },
    data: {
      encerradoEm: new Date(),
      encerradoPorUserId: session.user.id,
      status: "PAGO",
    },
  });

  cascadeUnpaidPayablesToNextMonth(
    updated.plantId,
    updated.ano,
    updated.mes,
  ).catch((e) => {
    console.warn(
      `[encerrar] cascade falhou para plant=${updated.plantId} ${updated.mes}/${updated.ano}:`,
      e,
    );
  });

  return NextResponse.json({ ok: true, billing: updated });
}

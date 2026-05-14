import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isFinanceRole } from "@/lib/roles";
import { cascadeUnpaidPayablesToNextMonth } from "@/lib/cascade-unpaid-payables";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/billing/plants/[id]/encerrar-sem-pagamento
 * Body: { motivo: string }
 *
 * Encerra o faturamento mensal da usina sem comprovante de pagamento — usado
 * quando o relatorio do mes nao gera valor a pagar (saldo negativo, sem
 * geracao, pausa contratual, etc). Equivalente ao upload do comprovante:
 * seta encerradoEm + status PAGO + lock para nao-ADMIN.
 *
 * Auth: FINANCEIRO ou ADMIN. Bloqueia se ja encerrado.
 */
export async function POST(req: NextRequest, ctx: RouteCtx) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isFinanceRole(session.user.role)) {
    return NextResponse.json(
      { error: "Apenas financeiro ou ADMIN pode formalizar 'sem pagamento'." },
      { status: 403 },
    );
  }

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { motivo?: string } | null;
  const motivo = (body?.motivo ?? "").trim();
  if (!motivo) {
    return NextResponse.json(
      { error: "Motivo é obrigatório." },
      { status: 400 },
    );
  }
  if (motivo.length > 500) {
    return NextResponse.json(
      { error: "Motivo muito longo (máx 500 caracteres)." },
      { status: 400 },
    );
  }

  const billing = await prisma.plantBilling.findUnique({
    where: { id },
    select: {
      id: true,
      encerradoEm: true,
      comprovantePagamentoUrl: true,
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
      { error: "Mês já encerrado." },
      { status: 400 },
    );
  }
  if (billing.comprovantePagamentoUrl) {
    return NextResponse.json(
      {
        error:
          "Já existe comprovante anexado neste mês. Use o fluxo normal (upload do comprovante).",
      },
      { status: 400 },
    );
  }

  const now = new Date();
  const updated = await prisma.plantBilling.update({
    where: { id },
    data: {
      status: "PAGO",
      encerradoEm: now,
      encerradoPorUserId: session.user.id,
      semPagamentoMotivo: motivo,
    },
  });

  cascadeUnpaidPayablesToNextMonth(
    updated.plantId,
    updated.ano,
    updated.mes,
  ).catch((e) => {
    console.warn(
      `[encerrar-sem-pagamento] cascade falhou para plant=${updated.plantId} ${updated.mes}/${updated.ano}:`,
      e,
    );
  });

  return NextResponse.json({ ok: true, billing: updated });
}

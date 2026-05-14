/**
 * POST /api/billing/consumer-unit-billings/[id]/cancelar-pagamento
 *
 * Reverte um pagamento manualmente registrado: limpa pagoEm/forma/nota e
 * volta status pra AGUARDANDO_PAGAMENTO. Reverte payables ligados via
 * transitionPayablesFromBilling (DISPONIVEL → AGUARDANDO_PAGAMENTO).
 *
 * Bloqueia se:
 *  - billing nao esta paga
 *  - mes esta encerrado e role != ADMIN
 *  - algum InvestorPayable ja foi PAGO ao investidor (irreversivel sem
 *    intervencao manual)
 *
 * NOTA: nao tenta reverter Asaas — se houver baixa no Asaas, operador
 * precisa estornar manualmente no painel do Asaas.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole, isFullAdmin } from "@/lib/roles";
import { transitionPayablesFromBilling } from "@/lib/investor-payables";
import { isMesEncerradoDoBilling } from "@/lib/mes-encerrado";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function POST(_req: NextRequest, ctx: RouteCtx) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await ctx.params;

  const billing = await prisma.consumerUnitBilling.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      pagoEm: true,
      asaasChargeId: true,
      asaasStatus: true,
      consumerUnitId: true,
      ano: true,
      mes: true,
    },
  });
  if (!billing) {
    return NextResponse.json(
      { error: "Cobrança não encontrada" },
      { status: 404 },
    );
  }
  if (!billing.pagoEm) {
    return NextResponse.json(
      { error: "Esta cobrança não está marcada como paga." },
      { status: 400 },
    );
  }

  if (
    !isFullAdmin(session.user.role) &&
    (await isMesEncerradoDoBilling(billing.id))
  ) {
    return NextResponse.json(
      {
        error:
          "Mês encerrado. Apenas ADMIN pode cancelar pagamento — peça reabertura.",
      },
      { status: 403 },
    );
  }

  // Verifica se algum payable ja foi PAGO ao investidor
  const payablesPagos = await prisma.investorPayable.findMany({
    where: {
      consumerUnitId: billing.consumerUnitId,
      anoReferencia: billing.ano,
      mesReferencia: billing.mes,
      status: "PAGO",
    },
    select: { id: true },
  });
  if (payablesPagos.length > 0) {
    return NextResponse.json(
      {
        error: `Não pode cancelar: ${payablesPagos.length} pagamento(s) ao investidor já foram efetuados. Reverta manualmente o pagamento ao investidor antes.`,
      },
      { status: 400 },
    );
  }

  await prisma.consumerUnitBilling.update({
    where: { id },
    data: {
      status: "AGUARDANDO_PAGAMENTO",
      pagoEm: null,
      formaPagamento: null,
      pagamentoNota: null,
    },
  });

  // Reverte payables (DISPONIVEL → AGUARDANDO_PAGAMENTO)
  const transition = await transitionPayablesFromBilling(id);

  const asaasWarning = billing.asaasChargeId
    ? "Cobrança tinha boleto Asaas — estorno no Asaas precisa ser feito manualmente no painel."
    : null;

  return NextResponse.json({
    ok: true,
    billingId: id,
    transition,
    asaasWarning,
  });
}

/**
 * POST /api/billing/consumer-unit-billings/[id]/pagamento-manual
 *
 * Marca uma cobrança ao cliente final como paga manualmente — para os casos em
 * que o cliente paga por fora do Asaas (PIX direto, dinheiro, transferência).
 *
 * Reusa o mesmo caminho do webhook do Asaas: ConsumerUnitBilling.status='PAGO',
 * pagoEm, e propaga os InvestorPayable correspondentes para DISPONIVEL via
 * transitionPayablesFromBilling.
 *
 * Idempotente: chamar 2× no mesmo billing apenas atualiza forma/nota; não
 * "des-paga" e não duplica transição.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole, isFullAdmin } from "@/lib/roles";
import { transitionPayablesFromBilling } from "@/lib/investor-payables";
import { AsaasError, receivePaymentInCash } from "@/lib/asaas";
import { isMesEncerradoDoBilling } from "@/lib/mes-encerrado";

const FORMAS_VALIDAS = new Set([
  "PIX_DIRETO",
  "DINHEIRO",
  "TRANSFERENCIA",
  "OUTRO",
]);

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const formaPagamento: string | undefined = body.formaPagamento;
  const pagamentoNota: string | undefined = body.pagamentoNota;
  const pagoEmRaw: string | undefined = body.pagoEm;

  if (!formaPagamento || !FORMAS_VALIDAS.has(formaPagamento)) {
    return NextResponse.json(
      {
        error:
          "formaPagamento obrigatória. Valores: PIX_DIRETO, DINHEIRO, TRANSFERENCIA, OUTRO.",
      },
      { status: 400 },
    );
  }

  const pagoEm = pagoEmRaw ? new Date(pagoEmRaw) : new Date();
  if (Number.isNaN(pagoEm.getTime())) {
    return NextResponse.json(
      { error: "pagoEm inválido (use ISO date)" },
      { status: 400 },
    );
  }

  const billing = await prisma.consumerUnitBilling.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      pagoEm: true,
      asaasChargeId: true,
      asaasStatus: true,
      valorCobranca: true,
    },
  });
  if (!billing) {
    return NextResponse.json(
      { error: "Cobrança não encontrada" },
      { status: 404 },
    );
  }

  if (
    !isFullAdmin(session.user.role) &&
    (await isMesEncerradoDoBilling(billing.id))
  ) {
    return NextResponse.json(
      {
        error:
          "Mês encerrado (comprovante de pagamento já anexado). Apenas ADMIN pode marcar pagamento — peça reabertura.",
      },
      { status: 403 },
    );
  }

  await prisma.consumerUnitBilling.update({
    where: { id },
    data: {
      status: "PAGO",
      pagoEm,
      formaPagamento,
      pagamentoNota: pagamentoNota?.trim() || null,
    },
  });

  // Dá baixa no boleto Asaas (se existe e ainda não foi marcado como recebido lá).
  // Não bloqueia: se Asaas falhar, o pagamento local já foi gravado e o operador
  // recebe o aviso no response.
  let asaasResult: {
    attempted: boolean;
    ok: boolean;
    skipped?: string;
    error?: string;
    asaasStatus?: string;
  } = { attempted: false, ok: false };

  if (billing.asaasChargeId) {
    const jaRecebidoNoAsaas =
      billing.asaasStatus === "RECEIVED" ||
      billing.asaasStatus === "RECEIVED_IN_CASH" ||
      billing.asaasStatus === "CONFIRMED";
    if (jaRecebidoNoAsaas) {
      asaasResult = {
        attempted: true,
        ok: true,
        skipped: "asaas_ja_recebido",
        asaasStatus: billing.asaasStatus ?? undefined,
      };
    } else if (!billing.valorCobranca || billing.valorCobranca <= 0) {
      asaasResult = {
        attempted: false,
        ok: false,
        skipped: "sem_valor_cobranca",
      };
    } else {
      asaasResult.attempted = true;
      try {
        const asaasPay = await receivePaymentInCash(billing.asaasChargeId, {
          paymentDate: pagoEm.toISOString().slice(0, 10),
          value: billing.valorCobranca,
          notifyCustomer: false,
        });
        await prisma.consumerUnitBilling.update({
          where: { id },
          data: {
            asaasStatus: asaasPay.status,
            asaasSyncedAt: new Date(),
          },
        });
        asaasResult = {
          attempted: true,
          ok: true,
          asaasStatus: asaasPay.status,
        };
      } catch (err) {
        const msg = err instanceof AsaasError ? err.message : String(err);
        console.warn(
          `[pagamento-manual] receiveInCash falhou no Asaas (chargeId=${billing.asaasChargeId}): ${msg}`,
        );
        asaasResult = { attempted: true, ok: false, error: msg };
      }
    }
  }

  // Propaga pra investorPayable (AGUARDANDO_PAGAMENTO → DISPONIVEL).
  const transition = await transitionPayablesFromBilling(id);

  return NextResponse.json({
    ok: true,
    billingId: id,
    asaas: asaasResult,
    transition,
  });
}

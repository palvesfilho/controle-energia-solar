import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { transitionPayablesFromBilling } from "@/lib/investor-payables";
import {
  computeParentStatusFromInstallments,
  parseInstallmentReference,
  parseInstallments,
  serializeInstallments,
} from "@/lib/billing-installments";

interface AsaasWebhookPayload {
  event: string;
  payment?: {
    id: string;
    status: string;
    externalReference?: string | null;
    paymentDate?: string | null;
    clientPaymentDate?: string | null;
    value?: number;
    netValue?: number;
  };
}

const EVENT_TO_STATUS: Record<string, { billing: string; setPagoEm: boolean }> = {
  PAYMENT_CONFIRMED: { billing: "PAGO", setPagoEm: true },
  PAYMENT_RECEIVED: { billing: "PAGO", setPagoEm: true },
  PAYMENT_RECEIVED_IN_CASH: { billing: "PAGO", setPagoEm: true },
  PAYMENT_OVERDUE: { billing: "ATRASADO", setPagoEm: false },
  PAYMENT_DELETED: { billing: "CANCELADO", setPagoEm: false },
  PAYMENT_REFUNDED: { billing: "CANCELADO", setPagoEm: false },
  PAYMENT_CHARGEBACK_REQUESTED: { billing: "CANCELADO", setPagoEm: false },
};

export async function POST(req: NextRequest) {
  const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN;
  if (expectedToken) {
    const received = req.headers.get("asaas-access-token");
    if (received !== expectedToken) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }
  }

  let payload: AsaasWebhookPayload;
  try {
    payload = (await req.json()) as AsaasWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { event, payment } = payload;
  if (!event || !payment?.id) {
    return NextResponse.json({ error: "Missing event/payment" }, { status: 400 });
  }

  // O externalReference traz "billingId" (cobrança única) ou "billingId#N" (parcela).
  const refParsed = parseInstallmentReference(payment.externalReference);

  let billing = refParsed
    ? await prisma.consumerUnitBilling.findUnique({
        where: { id: refParsed.billingId },
      })
    : null;

  // Fallback: procura por asaasChargeId (única) ou dentro do JSON installments.
  if (!billing) {
    billing = await prisma.consumerUnitBilling.findFirst({
      where: { asaasChargeId: payment.id },
    });
  }
  if (!billing) {
    // Última tentativa: scan em installments JSON (raro — só se externalReference perdido).
    const all = await prisma.consumerUnitBilling.findMany({
      where: { installments: { not: null } },
      select: { id: true, installments: true },
    });
    for (const b of all) {
      const items = parseInstallments(b.installments);
      if (items?.some((it) => it.asaasChargeId === payment.id)) {
        billing = await prisma.consumerUnitBilling.findUnique({
          where: { id: b.id },
        });
        break;
      }
    }
  }

  if (!billing) {
    console.warn(`[asaas-webhook] cobrança não encontrada para payment ${payment.id}`);
    return NextResponse.json({ ok: true, ignored: "billing not found" });
  }

  const mapping = EVENT_TO_STATUS[event];
  const installments = parseInstallments(billing.installments);

  // === Caminho parcelado: atualiza a parcela específica e recalcula o pai ===
  if (installments && installments.length > 0) {
    // Localiza a parcela: prioriza parcelaIndex do externalReference, com fallback por chargeId.
    let idx = refParsed?.parcelaIndex ?? null;
    if (idx == null || idx < 0 || idx >= installments.length) {
      idx = installments.findIndex((it) => it.asaasChargeId === payment.id);
    }
    if (idx < 0) {
      console.warn(
        `[asaas-webhook] parcela não localizada para payment ${payment.id} no billing ${billing.id}`,
      );
      return NextResponse.json({ ok: true, ignored: "installment not found" });
    }

    const updatedInstallments = [...installments];
    const target = { ...updatedInstallments[idx] };
    target.asaasStatus = payment.status;
    if (mapping?.setPagoEm) {
      const dateStr = payment.paymentDate || payment.clientPaymentDate;
      target.pagoEm = dateStr
        ? new Date(dateStr).toISOString()
        : new Date().toISOString();
    } else if (mapping?.billing === "CANCELADO") {
      target.pagoEm = null;
    }
    updatedInstallments[idx] = target;

    // Status do pai derivado das parcelas. Cancelamento individual NÃO cancela o pai
    // (operador pode ter cancelado só uma); cancelamento total exige rota DELETE.
    const parentStatus = computeParentStatusFromInstallments(updatedInstallments);
    const parentPagoEm =
      parentStatus === "PAGO"
        ? new Date(
            updatedInstallments
              .map((it) => (it.pagoEm ? new Date(it.pagoEm).getTime() : 0))
              .reduce((a, b) => Math.max(a, b), 0),
          )
        : null;

    await prisma.consumerUnitBilling.update({
      where: { id: billing.id },
      data: {
        installments: serializeInstallments(updatedInstallments),
        status: parentStatus,
        pagoEm: parentPagoEm,
        asaasSyncedAt: new Date(),
      },
    });

    await transitionPayablesFromBilling(billing.id).catch((e) =>
      console.error(
        "[asaas-webhook] transitionPayablesFromBilling falhou:",
        e,
      ),
    );

    return NextResponse.json({
      ok: true,
      event,
      billingId: billing.id,
      parcelaIndex: idx,
      parentStatus,
    });
  }

  // === Caminho cobrança única (legado/padrão) ===
  const updates: Record<string, unknown> = {
    asaasStatus: payment.status,
    asaasSyncedAt: new Date(),
  };
  if (mapping) {
    updates.status = mapping.billing;
    if (mapping.setPagoEm) {
      const dateStr = payment.paymentDate || payment.clientPaymentDate;
      updates.pagoEm = dateStr ? new Date(dateStr) : new Date();
    } else if (mapping.billing === "CANCELADO") {
      updates.pagoEm = null;
    }
  }

  await prisma.consumerUnitBilling.update({
    where: { id: billing.id },
    data: updates,
  });

  await transitionPayablesFromBilling(billing.id).catch((e) =>
    console.error("[asaas-webhook] transitionPayablesFromBilling falhou:", e),
  );

  return NextResponse.json({ ok: true, event, billingId: billing.id });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    info: "Asaas webhook endpoint. POST only.",
  });
}

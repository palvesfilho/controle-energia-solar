import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { transitionPayablesFromBilling } from "@/lib/investor-payables";
import {
  computeParentStatusFromInstallments,
  parseInstallmentReference,
  parseInstallments,
  serializeInstallments,
} from "@/lib/billing-installments";
import {
  ACESSO_REF_PREFIX,
  ativarAcessoPorCobranca,
} from "@/lib/brasil-solar-acesso";
import { enviarConviteCadastroCliente } from "@/lib/clerk-invite";

// Eventos do Asaas que significam pagamento confirmado.
const EVENTOS_PAGOS = new Set([
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED",
  "PAYMENT_RECEIVED_IN_CASH",
]);

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

  // === Acesso pago ao portal do cliente (externalReference "bs-acesso:<id>") ===
  // Roteado ANTES da lógica de faturas de UC. Só ativa em pagamento confirmado;
  // demais eventos são apenas reconhecidos (suspensão por inadimplência = Fase 4).
  if (payment.externalReference?.startsWith(ACESSO_REF_PREFIX)) {
    if (!EVENTOS_PAGOS.has(event)) {
      return NextResponse.json({ ok: true, event, ignored: "acesso: evento não-pago" });
    }
    const dateStr = payment.paymentDate || payment.clientPaymentDate;
    const ativado = await ativarAcessoPorCobranca({
      externalReference: payment.externalReference,
      chargeId: payment.id,
      paidAt: dateStr ? new Date(dateStr) : new Date(),
    });
    if (!ativado) {
      console.warn(`[asaas-webhook] acesso não encontrado para ${payment.externalReference}`);
      return NextResponse.json({ ok: true, ignored: "acesso not found" });
    }

    // Envio AUTOMÁTICO do convite de cadastro no fluxo PAGO (cartão/Pix/boleto).
    // A cortesia não passa por aqui (é ativada direto), então segue manual.
    // Idempotente: só envia uma vez (sem clerkUserId e sem conviteEnviadoEm).
    // Nunca lança — falha aqui não pode derrubar o ACK do webhook pro Asaas.
    let conviteEnviado = false;
    try {
      const prop = await prisma.brasilSolarProprietario.findUnique({
        where: { id: ativado.proprietarioId },
        select: {
          email: true,
          clerkUserId: true,
          acesso: { select: { conviteEnviadoEm: true } },
        },
      });
      if (prop?.email && !prop.clerkUserId && !prop.acesso?.conviteEnviadoEm) {
        await enviarConviteCadastroCliente({
          email: prop.email,
          proprietarioId: ativado.proprietarioId,
        });
        await prisma.brasilSolarAcesso.update({
          where: { proprietarioId: ativado.proprietarioId },
          data: { conviteEnviadoEm: new Date() },
        });
        conviteEnviado = true;
        console.log(`[asaas-webhook] convite de cadastro enviado p/ ${prop.email}`);
      }
    } catch (e) {
      console.error("[asaas-webhook] falha ao enviar convite (não bloqueia):", e);
    }

    console.log(`[asaas-webhook] acesso ${ativado.id} ATIVO (proprietário ${ativado.proprietarioId})`);
    return NextResponse.json({ ok: true, event, acessoId: ativado.id, status: "ATIVO", conviteEnviado });
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

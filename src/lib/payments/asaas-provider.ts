/**
 * Adapter Asaas — implementa PaymentProvider embrulhando o client já existente
 * (`@/lib/asaas`). NÃO reimplementa nada: só normaliza entradas/saídas pro
 * contrato único. O fluxo de emissão atual (`billing-asaas.ts`) segue valendo;
 * este adapter é a porta pra quando as telas passarem a falar com a interface.
 */
import {
  cancelPixAutomaticAuthorization,
  createPayment,
  createPixAutomaticAuthorization,
  deletePayment,
  getOrCreateCustomer as asaasGetOrCreateCustomer,
  getPixAutomaticAuthorization,
} from "@/lib/asaas";
import type {
  MandateChargeInput,
  MandateStatus,
  NormalizedStatus,
  NormalizedWebhookEvent,
  PaymentProvider,
  PixMandate,
  PixMandateInput,
  ProviderCapabilities,
  ProviderCharge,
  ProviderChargeInput,
  ProviderCustomer,
  ProviderCustomerInput,
} from "./types";

/** Mapeia o status cru do Asaas pro status interno normalizado. */
function normalizeAsaasStatus(raw: string): NormalizedStatus {
  switch (raw) {
    case "CONFIRMED":
    case "RECEIVED":
    case "RECEIVED_IN_CASH":
      return "PAGO";
    case "OVERDUE":
      return "ATRASADO";
    case "REFUNDED":
    case "REFUND_REQUESTED":
    case "CHARGEBACK_REQUESTED":
    case "CHARGEBACK_DISPUTE":
    case "DELETED":
      return "CANCELADO";
    case "PENDING":
    case "AWAITING_RISK_ANALYSIS":
    default:
      return "ENVIADO";
  }
}

/** Eventos do webhook Asaas → status interno. */
const ASAAS_EVENT_TO_STATUS: Record<string, NormalizedStatus> = {
  PAYMENT_CONFIRMED: "PAGO",
  PAYMENT_RECEIVED: "PAGO",
  PAYMENT_RECEIVED_IN_CASH: "PAGO",
  PAYMENT_OVERDUE: "ATRASADO",
  PAYMENT_DELETED: "CANCELADO",
  PAYMENT_REFUNDED: "CANCELADO",
  PAYMENT_CHARGEBACK_REQUESTED: "CANCELADO",
};

/** Status cru da autorização Pix Automático → status interno do mandato. */
function normalizeMandateStatus(raw: string): MandateStatus {
  switch (raw) {
    case "ACTIVE":
      return "ATIVO";
    case "REJECTED":
      return "REJEITADO";
    case "CANCELLED":
    case "EXPIRED":
      return "CANCELADO";
    case "PENDING":
    case "AWAITING_PAYMENT":
    default:
      return "PENDENTE";
  }
}

const CAPABILITIES: ProviderCapabilities = {
  // Asaas cobra cartão salvo (creditCardToken) de novo, com valor variável, sem CVV.
  recurringMode: "on_demand_token",
  chargeSavedCardWithoutCvv: true,
  variableAmount: true,
  supportsPixAutomatico: true,
  billingTypes: ["BOLETO", "PIX", "CREDIT_CARD"],
};

export class AsaasProvider implements PaymentProvider {
  readonly id = "asaas" as const;
  readonly capabilities = CAPABILITIES;

  async getOrCreateCustomer(
    input: ProviderCustomerInput,
  ): Promise<ProviderCustomer> {
    const c = await asaasGetOrCreateCustomer({
      name: input.name,
      cpfCnpj: input.cpfCnpj,
      email: input.email,
      phone: input.phone,
      postalCode: input.postalCode,
      address: input.address,
      addressNumber: input.addressNumber,
      complement: input.complement,
      externalReference: input.externalReference,
    });
    return { providerId: c.id };
  }

  async createCharge(input: ProviderChargeInput): Promise<ProviderCharge> {
    const payment = await createPayment({
      customer: input.customerProviderId,
      billingType: input.billingType,
      value: input.value,
      dueDate: input.dueDate,
      description: input.description,
      externalReference: input.externalReference,
      notificationDisabled: input.notificationDisabled,
      // Nota: cobrança com creditCardToken salvo será adicionada ao client
      // asaas.ts (campo creditCardToken) quando a tela de cartão entrar.
    });
    return {
      chargeId: payment.id,
      status: normalizeAsaasStatus(payment.status),
      rawStatus: payment.status,
      invoiceUrl: payment.invoiceUrl ?? null,
    };
  }

  async cancelCharge(chargeId: string): Promise<void> {
    await deletePayment(chargeId);
  }

  // === Pix Automático (mandato) ===

  async createPixMandate(input: PixMandateInput): Promise<PixMandate> {
    const auth = await createPixAutomaticAuthorization({
      customerId: input.customerProviderId,
      contractId: input.contractRef.slice(0, 35),
      frequency: input.frequency,
      startDate: input.startDate,
      finishDate: input.finishDate,
      // Valor fixo OU variável (com piso): nunca os dois.
      value: input.fixedValue,
      minLimitValue: input.fixedValue ? undefined : input.minLimitValue,
      description: input.description?.slice(0, 35),
      paymentCreationMode: "MANUAL", // nós criamos cada cobrança com o valor do mês
      retryPolicy: "ALLOW_THREE_IN_SEVEN_DAYS",
      immediateQrCode: {
        value: input.firstChargeValue,
        dueDate: input.firstChargeDueDate,
        description: input.description?.slice(0, 35),
      },
    });
    return {
      mandateId: auth.id,
      status: normalizeMandateStatus(auth.status),
      rawStatus: auth.status,
      qrCodePayload: auth.payload ?? null,
      qrCodeImage: auth.encodedImage ?? null,
      firstChargeId: auth.firstPaymentId ?? null,
    };
  }

  async getPixMandate(mandateId: string): Promise<PixMandate> {
    const auth = await getPixAutomaticAuthorization(mandateId);
    return {
      mandateId: auth.id,
      status: normalizeMandateStatus(auth.status),
      rawStatus: auth.status,
      qrCodePayload: auth.payload ?? null,
      qrCodeImage: auth.encodedImage ?? null,
      firstChargeId: auth.firstPaymentId ?? null,
    };
  }

  async cancelPixMandate(mandateId: string): Promise<void> {
    await cancelPixAutomaticAuthorization(mandateId);
  }

  async createMandateCharge(input: MandateChargeInput): Promise<ProviderCharge> {
    const payment = await createPayment({
      customer: input.customerProviderId,
      billingType: "PIX",
      value: input.value,
      dueDate: input.dueDate,
      description: input.description,
      externalReference: input.externalReference,
      notificationDisabled: true, // quem notifica somos nós (via Resend)
      pixAutomaticAuthorizationId: input.mandateId,
    });
    return {
      chargeId: payment.id,
      status: normalizeAsaasStatus(payment.status),
      rawStatus: payment.status,
      invoiceUrl: payment.invoiceUrl ?? null,
    };
  }

  async normalizeWebhook(
    payload: unknown,
  ): Promise<NormalizedWebhookEvent | null> {
    const p = payload as {
      event?: string;
      payment?: {
        id?: string;
        status?: string;
        paymentDate?: string | null;
        clientPaymentDate?: string | null;
      };
    };
    if (!p?.event || !p.payment?.id) return null;
    const status =
      ASAAS_EVENT_TO_STATUS[p.event] ??
      (p.payment.status ? normalizeAsaasStatus(p.payment.status) : null);
    if (!status) return null;
    const dateStr = p.payment.paymentDate || p.payment.clientPaymentDate;
    return {
      chargeId: p.payment.id,
      status,
      rawStatus: p.payment.status ?? p.event,
      paidAt: status === "PAGO" ? (dateStr ? new Date(dateStr) : new Date()) : null,
    };
  }
}

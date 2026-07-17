/**
 * Adapter Mercado Pago — implementa PaymentProvider.
 *
 * Diferença crucial pro Asaas: o MP NÃO cobra cartão salvo sem CVV pela API de
 * pagamentos avulsos. A recorrência de cartão sem CVV só existe via Assinatura
 * (`preapproval`), que o MP agenda e cobra sozinho → recurringMode =
 * "managed_subscription". Por isso este adapter expõe métodos extras
 * (createSubscription / updateSubscriptionAmount) além do contrato base.
 *
 * PIX e boleto avulsos funcionam sob demanda normalmente via createCharge.
 *
 * ⚠️ Requer MERCADOPAGO_ACCESS_TOKEN no .env. Teste E2E depende de credenciais
 * de sandbox + a peça de tokenização de cartão no front (SDK JS do MP).
 */
import type {
  NormalizedStatus,
  NormalizedWebhookEvent,
  PaymentProvider,
  ProviderCapabilities,
  ProviderCharge,
  ProviderChargeInput,
  ProviderCustomer,
  ProviderCustomerInput,
} from "./types";

const MP_BASE_URL = "https://api.mercadopago.com";

class MercadoPagoError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

function getAccessToken(): string {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) throw new MercadoPagoError(500, null, "MERCADOPAGO_ACCESS_TOKEN não configurado");
  return token;
}

async function mpFetch<T>(
  path: string,
  init: { method: string; body?: unknown; idempotencyKey?: string } = { method: "GET" },
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${getAccessToken()}`,
  };
  // MP exige chave de idempotência em POST de pagamento pra evitar cobrança dupla.
  if (init.idempotencyKey) headers["X-Idempotency-Key"] = init.idempotencyKey;

  const res = await fetch(`${MP_BASE_URL}${path}`, {
    method: init.method,
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const detail = body?.message || body?.error || `HTTP ${res.status}`;
    throw new MercadoPagoError(res.status, body, detail);
  }
  return body as T;
}

function sanitizeDoc(doc: string): string {
  return doc.replace(/\D/g, "");
}

/** Status cru do pagamento MP → status interno. */
function normalizeMpStatus(raw: string): NormalizedStatus {
  switch (raw) {
    case "approved":
      return "PAGO";
    case "rejected":
      // Cobrança recorrente que não capturou (cartão recusado) — precisa retentar.
      return "ATRASADO";
    case "cancelled":
    case "refunded":
    case "charged_back":
      return "CANCELADO";
    case "pending":
    case "in_process":
    case "authorized":
    default:
      return "ENVIADO";
  }
}

const CAPABILITIES: ProviderCapabilities = {
  recurringMode: "managed_subscription",
  chargeSavedCardWithoutCvv: false, // só via preapproval; payments avulsos exigem CVV
  variableAmount: false, // assinatura é de valor fixo; variável exige update do valor por ciclo
  supportsPixAutomatico: false, // não implementado neste adapter (modo MP = assinatura)
  billingTypes: ["PIX", "CREDIT_CARD"],
};

interface MpCustomer {
  id: string;
}

interface MpPayment {
  id: number | string;
  status: string;
  point_of_interaction?: { transaction_data?: { ticket_url?: string } };
}

export class MercadoPagoProvider implements PaymentProvider {
  readonly id = "mercadopago" as const;
  readonly capabilities = CAPABILITIES;

  async getOrCreateCustomer(
    input: ProviderCustomerInput,
  ): Promise<ProviderCustomer> {
    // Busca por email (MP indexa cliente por email).
    if (input.email) {
      const found = await mpFetch<{ results?: MpCustomer[] }>(
        `/v1/customers/search?email=${encodeURIComponent(input.email)}`,
      );
      if (found.results?.[0]) return { providerId: found.results[0].id };
    }
    const [firstName, ...rest] = input.name.trim().split(/\s+/);
    const created = await mpFetch<MpCustomer>("/v1/customers", {
      method: "POST",
      body: {
        email: input.email ?? undefined,
        first_name: firstName,
        last_name: rest.join(" ") || undefined,
        identification: {
          type: sanitizeDoc(input.cpfCnpj).length > 11 ? "CNPJ" : "CPF",
          number: sanitizeDoc(input.cpfCnpj),
        },
      },
    });
    return { providerId: created.id };
  }

  async createCharge(input: ProviderChargeInput): Promise<ProviderCharge> {
    if (input.billingType === "CREDIT_CARD" && !input.savedCardToken) {
      throw new MercadoPagoError(
        400,
        null,
        "Mercado Pago não cobra cartão avulso sem token/CVV — use a assinatura (createSubscription) para recorrência de cartão.",
      );
    }
    // PIX avulso (funciona sob demanda). Boleto no MP é "bolbradesco".
    const payment = await mpFetch<MpPayment>("/v1/payments", {
      method: "POST",
      idempotencyKey: input.externalReference || `${input.customerProviderId}-${input.dueDate}`,
      body: {
        transaction_amount: input.value,
        description: input.description,
        payment_method_id: input.billingType === "PIX" ? "pix" : undefined,
        external_reference: input.externalReference,
        date_of_expiration: `${input.dueDate}T23:59:59.000-03:00`,
        payer: { type: "customer", id: input.customerProviderId },
        token: input.savedCardToken,
      },
    });
    return {
      chargeId: String(payment.id),
      status: normalizeMpStatus(payment.status),
      rawStatus: payment.status,
      invoiceUrl: payment.point_of_interaction?.transaction_data?.ticket_url ?? null,
    };
  }

  async cancelCharge(chargeId: string): Promise<void> {
    // Cancela pagamento pendente. (Estorno de aprovado usa /v1/payments/{id}/refunds.)
    await mpFetch(`/v1/payments/${chargeId}`, {
      method: "PUT",
      body: { status: "cancelled" },
    });
  }

  async normalizeWebhook(
    payload: unknown,
  ): Promise<NormalizedWebhookEvent | null> {
    // MP manda { type: "payment", data: { id } } — sem status. Buscamos o pagamento.
    const p = payload as { type?: string; action?: string; data?: { id?: string } };
    const isPayment = p?.type === "payment" || p?.action?.startsWith("payment");
    if (!isPayment || !p.data?.id) return null;

    const payment = await mpFetch<MpPayment & { date_approved?: string | null }>(
      `/v1/payments/${p.data.id}`,
    );
    const status = normalizeMpStatus(payment.status);
    return {
      chargeId: String(payment.id),
      status,
      rawStatus: payment.status,
      paidAt:
        status === "PAGO"
          ? payment.date_approved
            ? new Date(payment.date_approved)
            : new Date()
          : null,
    };
  }

  // === Métodos extras do modo managed_subscription (fora do contrato base) ===

  /**
   * Cria uma assinatura (preapproval) — o MP passa a cobrar o cartão sozinho.
   * Fluxo pra recorrência de cartão sem CVV. O `cardTokenId` vem da tokenização
   * no front (SDK JS do MP).
   */
  async createSubscription(input: {
    payerEmail: string;
    cardTokenId: string;
    amount: number;
    reason: string;
    externalReference?: string;
    frequencyMonths?: number;
  }): Promise<{ subscriptionId: string; status: string }> {
    const sub = await mpFetch<{ id: string; status: string }>("/preapproval", {
      method: "POST",
      body: {
        reason: input.reason,
        external_reference: input.externalReference,
        payer_email: input.payerEmail,
        card_token_id: input.cardTokenId,
        auto_recurring: {
          frequency: input.frequencyMonths ?? 1,
          frequency_type: "months",
          transaction_amount: input.amount,
          currency_id: "BRL",
        },
        back_url: process.env.MERCADOPAGO_BACK_URL,
        status: "authorized",
      },
    });
    return { subscriptionId: sub.id, status: sub.status };
  }

  /**
   * Atualiza o valor de uma assinatura antes do próximo ciclo — é assim que se
   * cobra "valor variável" no MP (com a fragilidade de depender do agendador).
   */
  async updateSubscriptionAmount(
    subscriptionId: string,
    amount: number,
  ): Promise<void> {
    await mpFetch(`/preapproval/${subscriptionId}`, {
      method: "PUT",
      body: { auto_recurring: { transaction_amount: amount, currency_id: "BRL" } },
    });
  }
}

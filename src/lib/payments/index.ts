/**
 * Seletor de provedor de cobrança.
 *
 * Escolha GLOBAL via env `PAYMENT_PROVIDER=asaas|mercadopago` (default: asaas).
 * Mesmo espírito do STORAGE_BACKEND. No futuro, um override por cliente
 * (Consumer.preferredProvider) pode ser lido aqui sem mudar quem chama.
 */
import type { PaymentProvider, PaymentProviderId } from "./types";
import { AsaasProvider } from "./asaas-provider";
import { MercadoPagoProvider } from "./mercadopago-provider";

export * from "./types";

function resolveProviderId(override?: PaymentProviderId): PaymentProviderId {
  if (override) return override;
  const raw = (process.env.PAYMENT_PROVIDER || "asaas").toLowerCase();
  return raw === "mercadopago" ? "mercadopago" : "asaas";
}

/**
 * Retorna o provedor ativo. Passe `override` pra forçar um específico
 * (ex.: quando houver preferência por cliente ou em rota de webhook dedicada).
 */
export function getPaymentProvider(
  override?: PaymentProviderId,
): PaymentProvider {
  switch (resolveProviderId(override)) {
    case "mercadopago":
      return new MercadoPagoProvider();
    case "asaas":
    default:
      return new AsaasProvider();
  }
}

export function getActiveProviderId(): PaymentProviderId {
  return resolveProviderId();
}

const SANDBOX_URL = "https://api-sandbox.asaas.com/v3";
const PRODUCTION_URL = "https://api.asaas.com/v3";

export type AsaasBillingType = "BOLETO" | "PIX" | "CREDIT_CARD" | "UNDEFINED";

export interface AsaasCustomerInput {
  name: string;
  cpfCnpj: string;
  email?: string | null;
  phone?: string | null;
  mobilePhone?: string | null;
  postalCode?: string | null;
  address?: string | null;
  addressNumber?: string | null;
  complement?: string | null;
  externalReference?: string | null;
}

export interface AsaasCustomer {
  id: string;
  name: string;
  cpfCnpj: string;
  email?: string | null;
}

export interface AsaasPaymentInput {
  customer: string;
  billingType: AsaasBillingType;
  value: number;
  dueDate: string; // YYYY-MM-DD
  description?: string;
  externalReference?: string;
  // true desabilita os e-mails/notificações padrão do Asaas (usado quando o operador
  // optou por não notificar por email nesta cobrança).
  notificationDisabled?: boolean;
  // Vincula esta cobrança a uma autorização de Pix Automático já ativa. Quando
  // presente, a cobrança é debitada automaticamente da conta do pagador (sem
  // ação dele). Deve ser criada de 2 a 10 dias úteis antes do vencimento.
  pixAutomaticAuthorizationId?: string;
}

export interface AsaasPayment {
  id: string;
  status: string;
  invoiceUrl?: string | null;
  bankSlipUrl?: string | null;
  dueDate: string;
  value: number;
  netValue?: number;
  billingType: string;
  deleted?: boolean;  // true quando a cobrança foi apagada/cancelada pelo Asaas
}

export class AsaasError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

function getConfig() {
  const apiKey = process.env.ASAAS_API_KEY;
  if (!apiKey) throw new AsaasError(500, null, "ASAAS_API_KEY não configurado");
  const env = (process.env.ASAAS_ENV || "sandbox").toLowerCase();
  const baseUrl = env === "production" ? PRODUCTION_URL : SANDBOX_URL;
  return { apiKey, baseUrl };
}

async function asaasFetch<T>(
  path: string,
  init: RequestInit & { method: string; body?: string },
): Promise<T> {
  const { apiKey, baseUrl } = getConfig();
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      access_token: apiKey,
      "User-Agent": "GestorCreditos/1.0",
    },
    cache: "no-store",
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const detail =
      body?.errors?.[0]?.description ||
      body?.errors?.[0]?.code ||
      body?.message ||
      `HTTP ${res.status}`;
    throw new AsaasError(res.status, body, detail);
  }
  return body as T;
}

function sanitizeDoc(doc: string): string {
  return doc.replace(/\D/g, "");
}

export async function findCustomerByCpfCnpj(cpfCnpj: string): Promise<AsaasCustomer | null> {
  const doc = sanitizeDoc(cpfCnpj);
  const r = await asaasFetch<{ data: AsaasCustomer[] }>(
    `/customers?cpfCnpj=${encodeURIComponent(doc)}`,
    { method: "GET" },
  );
  return r.data?.[0] ?? null;
}

export async function createCustomer(input: AsaasCustomerInput): Promise<AsaasCustomer> {
  const payload: Record<string, unknown> = {
    name: input.name,
    cpfCnpj: sanitizeDoc(input.cpfCnpj),
  };
  if (input.email) payload.email = input.email;
  if (input.phone) payload.phone = input.phone;
  if (input.mobilePhone) payload.mobilePhone = input.mobilePhone;
  if (input.postalCode) payload.postalCode = sanitizeDoc(input.postalCode);
  if (input.address) payload.address = input.address;
  if (input.addressNumber) payload.addressNumber = input.addressNumber;
  if (input.complement) payload.complement = input.complement;
  if (input.externalReference) payload.externalReference = input.externalReference;

  return asaasFetch<AsaasCustomer>("/customers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getOrCreateCustomer(input: AsaasCustomerInput): Promise<AsaasCustomer> {
  const found = await findCustomerByCpfCnpj(input.cpfCnpj);
  if (found) return found;
  return createCustomer(input);
}

export async function createPayment(input: AsaasPaymentInput): Promise<AsaasPayment> {
  return asaasFetch<AsaasPayment>("/payments", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getPayment(id: string): Promise<AsaasPayment> {
  return asaasFetch<AsaasPayment>(`/payments/${id}`, { method: "GET" });
}

export interface AsaasDeleteResult {
  deleted: boolean;
  id: string;
}

export async function deletePayment(id: string): Promise<AsaasDeleteResult> {
  return asaasFetch<AsaasDeleteResult>(`/payments/${id}`, { method: "DELETE" });
}

export interface AsaasIdentificationField {
  identificationField?: string;
  nossoNumero?: string;
  barCode?: string;
}

export async function getIdentificationField(id: string): Promise<AsaasIdentificationField> {
  return asaasFetch<AsaasIdentificationField>(`/payments/${id}/identificationField`, { method: "GET" });
}

export interface AsaasPixQrCode {
  encodedImage?: string; // base64 PNG
  payload?: string;
  expirationDate?: string;
}

export async function getPixQrCode(id: string): Promise<AsaasPixQrCode> {
  return asaasFetch<AsaasPixQrCode>(`/payments/${id}/pixQrCode`, { method: "GET" });
}

export interface AsaasReceiveInCashInput {
  paymentDate: string; // YYYY-MM-DD
  value: number;
  notifyCustomer?: boolean;
}

/**
 * Marca uma cobrança como recebida fora da plataforma do Asaas (PIX direto,
 * dinheiro, transferência) — equivalente ao "Confirmar recebimento em dinheiro"
 * no painel. Dispara webhook PAYMENT_RECEIVED_IN_CASH.
 */
export async function receivePaymentInCash(
  id: string,
  input: AsaasReceiveInCashInput,
): Promise<AsaasPayment> {
  return asaasFetch<AsaasPayment>(`/payments/${id}/receiveInCash`, {
    method: "POST",
    body: JSON.stringify({
      paymentDate: input.paymentDate,
      value: input.value,
      notifyCustomer: input.notifyCustomer ?? false,
    }),
  });
}

// ============================================================================
// Pix Automático — débito recorrente autorizado (mandato do Banco Central).
// Fluxo: cria a autorização + QR do 1º pagamento (consentimento) → cliente paga
// o QR → autorização vira ACTIVE → cria cobranças recorrentes vinculadas
// (`pixAutomaticAuthorizationId`), de 2 a 10 dias úteis antes do vencimento.
// ============================================================================

export type AsaasPixAutomaticFrequency =
  | "WEEKLY"
  | "MONTHLY"
  | "QUARTERLY"
  | "SEMIANNUALLY"
  | "ANNUALLY";

export interface AsaasPixAutomaticAuthorizationInput {
  customerId: string;
  /** Identificador do contrato/objeto (máx. 35 chars). Ex.: id da UC/billing. */
  contractId: string;
  frequency: AsaasPixAutomaticFrequency;
  /** Início da validade da autorização (YYYY-MM-DD). */
  startDate: string;
  /** Fim da validade (YYYY-MM-DD). Omitido = indeterminado. */
  finishDate?: string;
  /** Valor fixo das cobranças. Omitir quando for valor variável. */
  value?: number;
  /** Piso mínimo (só pra autorização de valor variável). */
  minLimitValue?: number;
  description?: string;
  /** MANUAL (default): você cria cada cobrança. SUBSCRIPTION: o Asaas gera. */
  paymentCreationMode?: "MANUAL" | "SUBSCRIPTION";
  /** Política de retentativa em caso de falha. */
  retryPolicy?: "NOT_ALLOWED" | "ALLOW_THREE_IN_SEVEN_DAYS";
  /** Cobrança imediata que serve de consentimento (gera o 1º QR). */
  immediateQrCode: {
    value: number;
    dueDate: string; // YYYY-MM-DD
    description?: string;
  };
}

export interface AsaasPixAutomaticAuthorization {
  id: string;
  status: string; // PENDING | ACTIVE | REJECTED | CANCELLED ...
  /** Copia-e-cola do QR do 1º pagamento (consentimento). */
  payload?: string | null;
  /** Imagem base64 do QR, quando retornada. */
  encodedImage?: string | null;
  /** Cobrança do 1º pagamento gerada junto. */
  firstPaymentId?: string | null;
}

export async function createPixAutomaticAuthorization(
  input: AsaasPixAutomaticAuthorizationInput,
): Promise<AsaasPixAutomaticAuthorization> {
  return asaasFetch<AsaasPixAutomaticAuthorization>(
    "/pix/automatic/authorizations",
    { method: "POST", body: JSON.stringify(input) },
  );
}

export async function getPixAutomaticAuthorization(
  id: string,
): Promise<AsaasPixAutomaticAuthorization> {
  return asaasFetch<AsaasPixAutomaticAuthorization>(
    `/pix/automatic/authorizations/${id}`,
    { method: "GET" },
  );
}

export async function cancelPixAutomaticAuthorization(
  id: string,
): Promise<AsaasPixAutomaticAuthorization> {
  return asaasFetch<AsaasPixAutomaticAuthorization>(
    `/pix/automatic/authorizations/${id}`,
    { method: "DELETE" },
  );
}

// ===================== Assinaturas (cobrança recorrente) =====================
// Usadas pelo acesso MENSAL ao portal do cliente Brasil Solar. Cada ciclo o
// Asaas gera uma cobrança nova (mesmos eventos de webhook PAYMENT_*), com o
// campo `subscription` apontando pra assinatura. O externalReference definido
// aqui se propaga pras cobranças geradas.

export type AsaasSubscriptionCycle =
  | "WEEKLY"
  | "BIWEEKLY"
  | "MONTHLY"
  | "QUARTERLY"
  | "SEMIANNUALLY"
  | "YEARLY";

export interface AsaasSubscriptionInput {
  customer: string;
  billingType: AsaasBillingType;
  value: number;
  nextDueDate: string; // YYYY-MM-DD — vencimento da 1ª cobrança
  cycle: AsaasSubscriptionCycle;
  description?: string;
  externalReference?: string;
}

export interface AsaasSubscription {
  id: string;
  status: string;
  customer: string;
  value: number;
  cycle: string;
  nextDueDate?: string;
  deleted?: boolean;
}

export async function createSubscription(
  input: AsaasSubscriptionInput,
): Promise<AsaasSubscription> {
  return asaasFetch<AsaasSubscription>("/subscriptions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getSubscription(id: string): Promise<AsaasSubscription> {
  return asaasFetch<AsaasSubscription>(`/subscriptions/${id}`, { method: "GET" });
}

/**
 * Lista as cobranças geradas por uma assinatura. A primeira (mais antiga) é a
 * que carrega o `invoiceUrl` do checkout inicial que mandamos pro cliente.
 */
export async function listSubscriptionPayments(
  id: string,
): Promise<AsaasPayment[]> {
  const r = await asaasFetch<{ data: AsaasPayment[] }>(
    `/subscriptions/${id}/payments`,
    { method: "GET" },
  );
  return r.data ?? [];
}

export interface AsaasDeleteSubscriptionResult {
  deleted: boolean;
  id: string;
}

export async function deleteSubscription(
  id: string,
): Promise<AsaasDeleteSubscriptionResult> {
  return asaasFetch<AsaasDeleteSubscriptionResult>(`/subscriptions/${id}`, {
    method: "DELETE",
  });
}

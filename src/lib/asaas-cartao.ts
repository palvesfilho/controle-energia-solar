/**
 * Pagamento com cartão de crédito no Asaas — "checkout transparente".
 *
 * Fica em arquivo SEPARADO de `asaas.ts` de propósito: a captura do cartão
 * acontece na NOSSA tela e os dados são enviados direto pro Asaas via API, sem
 * passar pelo checkout hospedado. Isso mantém a marca Brasil Solar na jornada
 * toda. O escopo PCI é reduzido porque o cartão não é persistido no nosso banco
 * — só trafega desta requisição pro Asaas e é descartado.
 *
 * ⚠️ NUNCA logar/gravar `number`/`ccv`. NUNCA retornar esses campos ao cliente.
 *
 * Doc Asaas: POST /payments/{id}/payWithCreditCard (paga uma cobrança pendente
 * já criada — a mesma cobrança UNDEFINED que o convite gera).
 */
import { AsaasError } from "@/lib/asaas";

const SANDBOX_URL = "https://api-sandbox.asaas.com/v3";
const PRODUCTION_URL = "https://api.asaas.com/v3";

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

/** Dados do cartão capturados na nossa tela — nunca persistidos. */
export interface CartaoInput {
  holderName: string;
  number: string;
  expiryMonth: string; // "MM"
  expiryYear: string; // "AAAA"
  ccv: string;
}

/** Dados do titular exigidos pelo Asaas para análise antifraude do cartão. */
export interface TitularInput {
  name: string;
  email: string;
  cpfCnpj: string;
  postalCode: string;
  addressNumber: string;
  addressComplement?: string | null;
  phone: string;
  mobilePhone?: string | null;
}

export interface PagamentoCartaoResult {
  id: string;
  status: string; // CONFIRMED | RECEIVED | PENDING ...
  /** Token do cartão salvo pelo Asaas (para recorrência futura). Sem PAN. */
  creditCardToken?: string | null;
}

interface AsaasPayWithCardResponse {
  id: string;
  status: string;
  creditCard?: { creditCardToken?: string | null } | null;
}

function onlyDigits(s: string): string {
  return (s || "").replace(/\D/g, "");
}

/**
 * Paga uma cobrança PENDENTE já existente no Asaas com cartão de crédito.
 * `remoteIp` é o IP do comprador (exigido pelo Asaas na análise antifraude) —
 * extraia do header da requisição. A confirmação do acesso continua vindo pelo
 * webhook (PAYMENT_CONFIRMED), então esta função só dispara a cobrança.
 */
export async function pagarCobrancaComCartao(params: {
  chargeId: string;
  cartao: CartaoInput;
  titular: TitularInput;
  remoteIp: string;
}): Promise<PagamentoCartaoResult> {
  const { chargeId, cartao, titular, remoteIp } = params;

  const payload = {
    creditCard: {
      holderName: cartao.holderName.trim(),
      number: onlyDigits(cartao.number),
      expiryMonth: cartao.expiryMonth.trim(),
      expiryYear: cartao.expiryYear.trim(),
      ccv: cartao.ccv.trim(),
    },
    creditCardHolderInfo: {
      name: titular.name.trim(),
      email: titular.email.trim(),
      cpfCnpj: onlyDigits(titular.cpfCnpj),
      postalCode: onlyDigits(titular.postalCode),
      addressNumber: titular.addressNumber.trim(),
      addressComplement: titular.addressComplement?.trim() || null,
      phone: onlyDigits(titular.phone),
      mobilePhone: titular.mobilePhone ? onlyDigits(titular.mobilePhone) : undefined,
    },
    remoteIp,
  };

  const res = await asaasFetch<AsaasPayWithCardResponse>(
    `/payments/${chargeId}/payWithCreditCard`,
    { method: "POST", body: JSON.stringify(payload) },
  );

  return {
    id: res.id,
    status: res.status,
    creditCardToken: res.creditCard?.creditCardToken ?? null,
  };
}

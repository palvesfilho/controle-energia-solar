/**
 * O que uma página PÚBLICA de pagamento mostra sobre uma cobrança do Asaas.
 *
 * 🔑 **Por que existe separado.** Há dois fluxos que precisam exatamente disto,
 * e por caminhos diferentes:
 *
 *   - acesso ao portal Brasil Solar → `portal-cobranca.ts` (chave: conviteToken)
 *   - fatura de energia da Associação → `fatura-publica.ts` (chave: tokenPublico)
 *
 * O que muda entre eles é só COMO se chega ao `asaasChargeId`. Daí para frente —
 * PIX, boleto, situação — é a mesma conversa com o Asaas. Duplicar isso faria a
 * segunda cópia envelhecer calada: um ajuste no PIX passaria a valer para um
 * fluxo e não para o outro, e ninguém veria até um cliente reclamar.
 *
 * Aqui só entra o que depende do `chargeId`. Resolver token é problema de quem
 * chama.
 */
import { getPayment, getPixQrCode, getIdentificationField } from "@/lib/asaas";

/** Status no Asaas que ainda aceitam pagamento. */
export const STATUS_ABERTO = new Set(["PENDING", "OVERDUE", "AWAITING_RISK_ANALYSIS"]);

/** Status que indicam pagamento concluído. */
export const STATUS_PAGO = new Set([
  "CONFIRMED",
  "RECEIVED",
  "RECEIVED_IN_CASH",
  "RECEIVED_IN_CASH_UNDONE",
]);

export type SituacaoCobranca = "aberto" | "pago" | "indisponivel";

/**
 * Situação da cobrança segundo o Asaas.
 *
 * Falha de rede vira `indisponivel`, nunca `aberto`: mostrar "pague aqui" para
 * uma cobrança que talvez já esteja paga é pior do que dizer que não deu para
 * consultar agora.
 */
export async function situacaoDaCobranca(chargeId: string | null): Promise<SituacaoCobranca> {
  if (!chargeId) return "indisponivel";
  try {
    const pay = await getPayment(chargeId);
    if (STATUS_PAGO.has(pay.status)) return "pago";
    if (STATUS_ABERTO.has(pay.status)) return "aberto";
    return "indisponivel";
  } catch {
    return "indisponivel";
  }
}

export interface PixView {
  /** PNG em base64, SEM o prefixo `data:` — quem renderiza é que monta. */
  encodedImage: string | null;
  /** Copia-e-cola. */
  payload: string | null;
  expirationDate: string | null;
}

export async function viewPix(chargeId: string): Promise<PixView> {
  const qr = await getPixQrCode(chargeId);
  return {
    encodedImage: qr.encodedImage ?? null,
    payload: qr.payload ?? null,
    expirationDate: qr.expirationDate ?? null,
  };
}

export interface BoletoView {
  linhaDigitavel: string | null;
  /** PDF do boleto, hospedado pelo Asaas. */
  bankSlipUrl: string | null;
}

/**
 * As duas chamadas são independentes e cada uma pode falhar sozinha: com a linha
 * digitável o cliente paga no app do banco mesmo sem o PDF, e vice-versa. Por
 * isso o `.catch(() => null)` em cada uma em vez de derrubar as duas juntas.
 */
export async function viewBoleto(chargeId: string): Promise<BoletoView> {
  const [ident, pay] = await Promise.all([
    getIdentificationField(chargeId).catch(() => null),
    getPayment(chargeId).catch(() => null),
  ]);
  return {
    linhaDigitavel: ident?.identificationField ?? null,
    bankSlipUrl: pay?.bankSlipUrl ?? null,
  };
}

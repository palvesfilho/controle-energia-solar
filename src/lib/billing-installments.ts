/**
 * Helpers para parcelamento de cobranças no Asaas.
 *
 * Cada ConsumerUnitBilling pode ter `installments` (JSON serializado) com até
 * 10 parcelas, cada uma vira uma cobrança Asaas independente. O `externalReference`
 * de cada parcela é `${billingId}#${parcelaIndex}` para o webhook conseguir identificar.
 */

export interface BillingInstallment {
  dueDate: string; // YYYY-MM-DD
  valor: number;
  asaasChargeId: string | null;
  asaasInvoiceUrl: string | null;
  asaasStatus: string | null;
  pagoEm: string | null; // ISO
}

export const MAX_INSTALLMENTS = 10;
export const DEFAULT_INTERVAL_DAYS = 15;
export const INSTALLMENT_REF_SEPARATOR = "#";

export function parseInstallments(raw: string | null): BillingInstallment[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed as BillingInstallment[];
  } catch {
    return null;
  }
}

export function serializeInstallments(items: BillingInstallment[]): string {
  return JSON.stringify(items);
}

export function buildInstallmentReference(
  billingId: string,
  parcelaIndex: number,
): string {
  return `${billingId}${INSTALLMENT_REF_SEPARATOR}${parcelaIndex}`;
}

/**
 * Parseia o externalReference vindo do Asaas. Retorna { billingId, parcelaIndex }
 * onde parcelaIndex = null para cobrança única (sem `#N`).
 */
export function parseInstallmentReference(
  ref: string | null | undefined,
): { billingId: string; parcelaIndex: number | null } | null {
  if (!ref) return null;
  const sep = ref.indexOf(INSTALLMENT_REF_SEPARATOR);
  if (sep < 0) return { billingId: ref, parcelaIndex: null };
  const billingId = ref.slice(0, sep);
  const idx = Number(ref.slice(sep + 1));
  if (!Number.isInteger(idx) || idx < 0) return { billingId, parcelaIndex: null };
  return { billingId, parcelaIndex: idx };
}

/**
 * Distribui um valor total em N parcelas (boletos iguais), absorvendo a sobra
 * de centavos na última parcela pra fechar exato.
 */
export function splitValueEvenly(total: number, n: number): number[] {
  if (n <= 0) return [];
  const cents = Math.round(total * 100);
  const baseCents = Math.floor(cents / n);
  const remainder = cents - baseCents * n;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const c = i === n - 1 ? baseCents + remainder : baseCents;
    out.push(c / 100);
  }
  return out;
}

/**
 * Gera datas de vencimento espaçadas por `intervalDays` a partir de `firstDueDate`.
 */
export function generateDueDates(
  firstDueDate: Date,
  count: number,
  intervalDays: number,
): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(firstDueDate);
    d.setDate(d.getDate() + i * intervalDays);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/**
 * Calcula o status agregado do billing pai a partir do estado das parcelas.
 * Retorna PAGO (todas pagas), PARCIALMENTE_PAGO (1+ pagas, mas não todas),
 * ou ENVIADO_ASAAS (nenhuma paga ainda).
 */
export function computeParentStatusFromInstallments(
  items: BillingInstallment[],
): "PAGO" | "PARCIALMENTE_PAGO" | "ENVIADO_ASAAS" {
  const pagas = items.filter((it) => !!it.pagoEm).length;
  if (pagas === 0) return "ENVIADO_ASAAS";
  if (pagas === items.length) return "PAGO";
  return "PARCIALMENTE_PAGO";
}

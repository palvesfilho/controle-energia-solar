/**
 * Camada de abstração de provedores de cobrança (payment gateways).
 *
 * Objetivo: as telas e o pipeline de cobrança NUNCA falam com um gateway
 * específico (Asaas, Mercado Pago) diretamente — falam com esta interface.
 * Trocar/escolher o provedor = trocar a implementação por trás, sem mexer nas
 * telas nem no modelo interno (ConsumerUnitBilling + status internos).
 *
 * Mesmo padrão já usado no projeto pra storage (`file-storage.ts` com
 * STORAGE_BACKEND=disk|r2). Aqui o seletor é PAYMENT_PROVIDER=asaas|mercadopago.
 *
 * ⚠️ Os dois provedores NÃO são simétricos na recorrência de cartão:
 *   - Asaas         → token sob demanda: cobra qualquer valor, quando quiser, sem CVV.
 *   - Mercado Pago  → assinatura gerenciada: o MP agenda e cobra sozinho; você
 *                     seta/atualiza o valor. (A API de pagamentos avulsos do MP
 *                     exige CVV a cada cobrança — inviável pra recorrência.)
 * Por isso a interface expõe `capabilities.recurringMode`; as telas se adaptam.
 */

export type PaymentProviderId = "asaas" | "mercadopago";

/**
 * Como o provedor faz cobrança recorrente de cartão:
 *  - on_demand_token:      você dispara cada cobrança com o valor calculado (Asaas).
 *  - managed_subscription: o provedor agenda/cobra; você mantém o valor atualizado (MP).
 */
export type RecurringMode = "on_demand_token" | "managed_subscription";

export interface ProviderCapabilities {
  recurringMode: RecurringMode;
  /** Cobra cartão salvo sem pedir CVV a cada cobrança? (Asaas: sim / MP payments: não) */
  chargeSavedCardWithoutCvv: boolean;
  /** Suporta valor diferente a cada ciclo de forma limpa? */
  variableAmount: boolean;
  /**
   * Suporta Pix Automático (débito recorrente autorizado via mandato do BC)?
   * Quando true, os métodos createPixMandate/createMandateCharge existem.
   */
  supportsPixAutomatico: boolean;
  /** Meios de cobrança suportados nesta integração. */
  billingTypes: Array<"BOLETO" | "PIX" | "CREDIT_CARD">;
}

/** Status interno normalizado — o resto do sistema só enxerga isto. */
export type NormalizedStatus =
  | "PENDENTE"
  | "ENVIADO"
  | "PAGO"
  | "ATRASADO"
  | "CANCELADO";

export interface ProviderCustomerInput {
  name: string;
  cpfCnpj: string;
  email?: string | null;
  phone?: string | null;
  postalCode?: string | null;
  address?: string | null;
  addressNumber?: string | null;
  complement?: string | null;
  /** Referência externa (ex.: Consumer.id) pra reconciliar dos dois lados. */
  externalReference?: string | null;
}

export interface ProviderCustomer {
  /** ID do cliente no provedor (asaasCustomerId ou mpCustomerId). */
  providerId: string;
}

export interface ProviderChargeInput {
  customerProviderId: string;
  billingType: "BOLETO" | "PIX" | "CREDIT_CARD" | "UNDEFINED";
  value: number;
  dueDate: string; // YYYY-MM-DD
  description?: string;
  externalReference?: string;
  /** Desliga notificações padrão do provedor (quem notifica somos nós, via Resend). */
  notificationDisabled?: boolean;
  /** Token de cartão salvo (fluxo on_demand_token, ex.: Asaas creditCardToken). */
  savedCardToken?: string;
}

export interface ProviderCharge {
  chargeId: string;
  status: NormalizedStatus;
  rawStatus: string; // status cru do provedor, pra auditoria
  invoiceUrl?: string | null;
}

// === Pix Automático (mandato) — modo de recorrência sem cartão ===

export type MandateStatus = "PENDENTE" | "ATIVO" | "CANCELADO" | "REJEITADO";
export type MandateFrequency =
  | "WEEKLY"
  | "MONTHLY"
  | "QUARTERLY"
  | "SEMIANNUALLY"
  | "ANNUALLY";

export interface PixMandateInput {
  customerProviderId: string;
  /** Referência de contrato (ex.: id da UC/billing). Máx. 35 chars. */
  contractRef: string;
  frequency: MandateFrequency;
  startDate: string; // YYYY-MM-DD
  finishDate?: string;
  /** Valor fixo (omita para valor variável). */
  fixedValue?: number;
  /** Piso mínimo, só quando variável. */
  minLimitValue?: number;
  description?: string;
  /** 1ª cobrança (QR imediato) que registra o consentimento do pagador. */
  firstChargeValue: number;
  firstChargeDueDate: string; // YYYY-MM-DD
}

export interface PixMandate {
  mandateId: string;
  status: MandateStatus;
  rawStatus: string;
  /** Copia-e-cola do QR do 1º pagamento. */
  qrCodePayload?: string | null;
  /** Imagem base64 do QR. */
  qrCodeImage?: string | null;
  firstChargeId?: string | null;
}

export interface MandateChargeInput {
  customerProviderId: string;
  mandateId: string;
  value: number;
  dueDate: string; // YYYY-MM-DD — crie de 2 a 10 dias úteis antes
  description?: string;
  externalReference?: string;
}

/** Evento normalizado a partir do webhook de qualquer provedor. */
export interface NormalizedWebhookEvent {
  /** ID da cobrança no provedor (pra localizar o billing). */
  chargeId: string;
  status: NormalizedStatus;
  rawStatus: string;
  paidAt?: Date | null;
}

/**
 * Contrato único que todo provedor implementa. Métodos marcados com `?` só
 * existem no modo de recorrência correspondente — verifique `capabilities`
 * antes de chamar.
 */
export interface PaymentProvider {
  readonly id: PaymentProviderId;
  readonly capabilities: ProviderCapabilities;

  /** Cria ou recupera o cliente no provedor. */
  getOrCreateCustomer(input: ProviderCustomerInput): Promise<ProviderCustomer>;

  /**
   * Cria uma cobrança única com valor definido por você.
   * Fluxo padrão (boleto/pix) e também o fluxo on_demand_token de cartão salvo.
   */
  createCharge(input: ProviderChargeInput): Promise<ProviderCharge>;

  /** Cancela/estorna uma cobrança no provedor. */
  cancelCharge(chargeId: string): Promise<void>;

  // === Pix Automático — só existem quando capabilities.supportsPixAutomatico ===

  /**
   * Cria a autorização de Pix Automático (mandato) + o QR do 1º pagamento que
   * registra o consentimento. O mandato vira ATIVO após o cliente pagar o QR.
   */
  createPixMandate?(input: PixMandateInput): Promise<PixMandate>;

  /** Consulta o status atual de um mandato (ex.: pra saber se virou ATIVO). */
  getPixMandate?(mandateId: string): Promise<PixMandate>;

  /** Cancela um mandato de Pix Automático. */
  cancelPixMandate?(mandateId: string): Promise<void>;

  /**
   * Cria uma cobrança recorrente vinculada a um mandato ATIVO — debitada
   * automaticamente da conta do pagador, sem ação dele.
   */
  createMandateCharge?(input: MandateChargeInput): Promise<ProviderCharge>;

  /**
   * Normaliza o payload do webhook do provedor pro evento interno.
   * Retorna null quando o evento deve ser ignorado.
   *
   * É async porque alguns provedores (Mercado Pago) mandam só um ID no
   * webhook e exigem uma consulta à API pra descobrir o status real.
   */
  normalizeWebhook(
    payload: unknown,
    headers: Record<string, string | null>,
  ): Promise<NormalizedWebhookEvent | null>;
}

/**
 * Acesso pago ao portal do cliente Brasil Solar.
 *
 * Orquestra o fluxo:
 *   1. Admin envia convite → cria cliente + cobrança/assinatura no Asaas e grava
 *      um BrasilSolarAcesso (status AGUARDANDO_PAGAMENTO) com o link de checkout.
 *   2. Cliente paga (cartão/Pix/boleto) na página hospedada do Asaas.
 *   3. Webhook PAYMENT_CONFIRMED/RECEIVED → ativarAcessoPorCobranca() marca o
 *      acesso como ATIVO, calcula a vigência e gera o token de cadastro.
 *
 * O acesso é POR PROPRIETÁRIO (cobre todas as usinas dele). Modalidade:
 *   ANUAL  = cobrança única, vigência de 12 meses.
 *   MENSAL = assinatura recorrente, vigência renovada a cada pagamento.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  createPayment,
  createSubscription,
  deletePayment,
  deleteSubscription,
  getOrCreateCustomer,
  listSubscriptionPayments,
} from "@/lib/asaas";
import { getAcessoValoresTabela } from "@/lib/app-settings";

export type AcessoModalidade = "MENSAL" | "ANUAL";

/** Prefixo do externalReference que o webhook usa pra rotear pagamentos de acesso. */
export const ACESSO_REF_PREFIX = "bs-acesso:";

/** Dias de carência somados à vigência mensal (folga entre pagamentos). */
const GRACE_DIAS_MENSAL = 5;

/**
 * Monta a URL da tela de pagamento BRANDED (nosso visual) a partir do
 * conviteToken. É esse link que deve ser enviado ao cliente — em vez do
 * checkout hospedado do Asaas (`checkoutUrl`). Cai pro checkout do Asaas só se
 * APP_BASE_URL não estiver configurado.
 */
export function buildPagamentoUrl(conviteToken: string): string {
  const base = (
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_BASE_URL ||
    process.env.NEXTAUTH_URL ||
    ""
  ).replace(/\/$/, "");
  return `${base}/portal-cliente/pagar/${conviteToken}`;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}
function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function toYMD(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Cancela no Asaas as cobranças vinculadas a um acesso (assinatura e/ou cobrança
 * única). Best-effort: se o objeto já não existe ou não pode ser apagado (ex.:
 * já recebido), apenas registra e segue — o cancelamento local prossegue.
 */
async function cancelarCobrancasAsaas(acesso: {
  asaasSubscriptionId: string | null;
  asaasChargeId: string | null;
}): Promise<void> {
  if (acesso.asaasSubscriptionId) {
    try {
      await deleteSubscription(acesso.asaasSubscriptionId);
    } catch (e) {
      console.error("[acesso] falha ao cancelar assinatura no Asaas:", e);
    }
  }
  if (acesso.asaasChargeId) {
    try {
      await deletePayment(acesso.asaasChargeId);
    } catch (e) {
      console.error("[acesso] falha ao cancelar cobrança no Asaas:", e);
    }
  }
}

/** Vigência do acesso a partir de um pagamento confirmado. */
export function computeVigenteAte(modalidade: AcessoModalidade, from: Date): Date {
  return modalidade === "ANUAL"
    ? addMonths(from, 12)
    : addDays(addMonths(from, 1), GRACE_DIAS_MENSAL);
}

export interface CriarConviteInput {
  proprietarioId: string;
  modalidade: AcessoModalidade;
  valor: number;
}

export interface CriarConviteResult {
  acessoId: string;
  /** Link hospedado do Asaas (fallback). */
  checkoutUrl: string | null;
  /** Link da tela de pagamento BRANDED — é este que deve ser enviado ao cliente. */
  pagamentoUrl: string;
  conviteToken: string;
  status: string;
  modalidade: AcessoModalidade;
  valor: number;
}

/**
 * Cria (ou recria, se ainda não ativo) o acesso pago do proprietário e a
 * cobrança correspondente no Asaas. Retorna o link de checkout hospedado.
 * NÃO envia e-mail — o disparo do convite é responsabilidade da rota, atrás de
 * confirmação explícita.
 */
export async function criarConviteAcesso(
  input: CriarConviteInput,
): Promise<CriarConviteResult> {
  const { proprietarioId, modalidade, valor } = input;

  if (modalidade !== "MENSAL" && modalidade !== "ANUAL") {
    throw new Error("Modalidade inválida (use MENSAL ou ANUAL).");
  }
  if (!(valor > 0)) {
    throw new Error("Valor do plano deve ser maior que zero.");
  }

  // Piso de tabela: o valor cobrado nunca pode ser menor que o valor de tabela
  // da modalidade (definido em Personalizações). MENSAL/ANUAL usam o próprio
  // valor de tabela; PERSONALIZADO pode subir, nunca descer.
  const tabela = await getAcessoValoresTabela();
  const minValor = modalidade === "ANUAL" ? tabela.anual : tabela.mensal;
  if (minValor > 0 && valor < minValor) {
    throw new Error(
      `Valor abaixo do valor de tabela (mínimo ${
        modalidade === "ANUAL" ? "anual" : "mensal"
      }: ${minValor.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      })}).`,
    );
  }

  const prop = await prisma.brasilSolarProprietario.findUnique({
    where: { id: proprietarioId },
  });
  if (!prop) throw new Error("Proprietário não encontrado.");
  if (!prop.cpfCnpj) {
    throw new Error(
      "Proprietário sem CPF/CNPJ — obrigatório para gerar a cobrança no Asaas.",
    );
  }

  const acessoExistente = await prisma.brasilSolarAcesso.findUnique({
    where: { proprietarioId },
  });
  if (acessoExistente?.status === "ATIVO") {
    throw new Error("Este proprietário já tem acesso ativo ao portal.");
  }

  // Editar/refazer = recriar limpo: cancela a cobrança antiga no Asaas antes de
  // gerar a nova, pra não deixar cobranças órfãs na conta do cliente.
  if (acessoExistente) {
    await cancelarCobrancasAsaas(acessoExistente);
  }

  // 1. Cria/acha o cliente no Asaas.
  const customer = await getOrCreateCustomer({
    name: prop.nome,
    cpfCnpj: prop.cpfCnpj,
    email: prop.email,
    phone: prop.telefone,
    externalReference: `bs-prop:${prop.id}`,
  });

  // Token da tela de pagamento branded (e depois do link de cadastro). Gerado já
  // aqui — não só na ativação — para o link nosso funcionar ANTES do pagamento.
  // Preserva o token existente (idempotente com o webhook/cortesia).
  const conviteToken = acessoExistente?.conviteToken ?? randomUUID();

  // 2. Grava/atualiza o acesso ANTES da cobrança pra ter o id no externalReference.
  const acesso = await prisma.brasilSolarAcesso.upsert({
    where: { proprietarioId },
    create: {
      proprietarioId,
      modalidade,
      valor,
      status: "AGUARDANDO_PAGAMENTO",
      asaasCustomerId: customer.id,
      conviteToken,
    },
    update: {
      modalidade,
      valor,
      status: "AGUARDANDO_PAGAMENTO",
      asaasCustomerId: customer.id,
      asaasChargeId: null,
      asaasSubscriptionId: null,
      checkoutUrl: null,
      pagoEm: null,
      ativadoEm: null,
      vigenteAte: null,
      conviteToken,
    },
  });

  const externalReference = `${ACESSO_REF_PREFIX}${acesso.id}`;
  const dueDate = toYMD(addDays(new Date(), 3));
  const descricao = `Portal do Cliente Rede Brasil Solar — ${prop.nome} (${
    modalidade === "ANUAL" ? "plano anual" : "plano mensal"
  })`;

  let checkoutUrl: string | null = null;
  const patch: Record<string, unknown> = {};

  if (modalidade === "ANUAL") {
    // Cobrança única. billingType UNDEFINED = cliente escolhe cartão/Pix/boleto.
    const payment = await createPayment({
      customer: customer.id,
      billingType: "UNDEFINED",
      value: valor,
      dueDate,
      description: descricao,
      externalReference,
    });
    checkoutUrl = payment.invoiceUrl ?? null;
    patch.asaasChargeId = payment.id;
    patch.checkoutUrl = checkoutUrl;
  } else {
    // Assinatura mensal. Pega o invoiceUrl da 1ª cobrança gerada.
    const sub = await createSubscription({
      customer: customer.id,
      billingType: "UNDEFINED",
      value: valor,
      nextDueDate: dueDate,
      cycle: "MONTHLY",
      description: descricao,
      externalReference,
    });
    const pagamentos = await listSubscriptionPayments(sub.id);
    checkoutUrl = pagamentos[0]?.invoiceUrl ?? null;
    patch.asaasSubscriptionId = sub.id;
    patch.checkoutUrl = checkoutUrl;
  }

  const atualizado = await prisma.brasilSolarAcesso.update({
    where: { id: acesso.id },
    data: patch,
  });

  return {
    acessoId: atualizado.id,
    checkoutUrl,
    pagamentoUrl: buildPagamentoUrl(conviteToken),
    conviteToken,
    status: atualizado.status,
    modalidade,
    valor,
  };
}

export interface CriarCortesiaInput {
  proprietarioId: string;
  inicio: Date;
  fim: Date;
}

/**
 * Libera acesso de CORTESIA (gratuito) direto como ATIVO, sem passar pelo Asaas.
 * O admin escolhe a janela (início → fim); o acesso vale de vigenteDesde até
 * vigenteAte. Gera o conviteToken pra Fase 2 (envio do cadastro).
 *
 * A validação da senha do admin é responsabilidade da rota — aqui só grava.
 */
export async function criarAcessoCortesia(input: CriarCortesiaInput): Promise<{
  acessoId: string;
  status: string;
  vigenteDesde: Date;
  vigenteAte: Date;
}> {
  const { proprietarioId, inicio, fim } = input;

  if (!(inicio instanceof Date) || Number.isNaN(inicio.getTime())) {
    throw new Error("Data de início inválida.");
  }
  if (!(fim instanceof Date) || Number.isNaN(fim.getTime())) {
    throw new Error("Data de fim inválida.");
  }
  if (fim.getTime() <= inicio.getTime()) {
    throw new Error("A data de fim deve ser posterior à data de início.");
  }

  const prop = await prisma.brasilSolarProprietario.findUnique({
    where: { id: proprietarioId },
    select: { id: true },
  });
  if (!prop) throw new Error("Proprietário não encontrado.");

  const existente = await prisma.brasilSolarAcesso.findUnique({
    where: { proprietarioId },
    select: { conviteToken: true },
  });
  const conviteToken = existente?.conviteToken ?? randomUUID();
  const agora = new Date();

  const acesso = await prisma.brasilSolarAcesso.upsert({
    where: { proprietarioId },
    create: {
      proprietarioId,
      modalidade: "CORTESIA",
      valor: 0,
      status: "ATIVO",
      vigenteDesde: inicio,
      vigenteAte: fim,
      ativadoEm: agora,
      conviteToken,
    },
    update: {
      modalidade: "CORTESIA",
      valor: 0,
      status: "ATIVO",
      vigenteDesde: inicio,
      vigenteAte: fim,
      ativadoEm: agora,
      pagoEm: null,
      // Zera vínculos de cobrança — cortesia não passa pelo Asaas.
      asaasChargeId: null,
      asaasSubscriptionId: null,
      checkoutUrl: null,
      conviteToken,
    },
  });

  return {
    acessoId: acesso.id,
    status: acesso.status,
    vigenteDesde: inicio,
    vigenteAte: fim,
  };
}

/**
 * Cancela o acesso/cobrança de um proprietário: encerra a assinatura ou apaga a
 * cobrança única no Asaas (best-effort) e marca o registro como CANCELADO.
 * Funciona tanto pra cobrança AGUARDANDO_PAGAMENTO quanto pra acesso ATIVO
 * (encerra a recorrência). Cortesia é cancelada só localmente (sem Asaas).
 */
export async function cancelarAcesso(proprietarioId: string): Promise<{
  id: string;
  status: string;
}> {
  const acesso = await prisma.brasilSolarAcesso.findUnique({
    where: { proprietarioId },
  });
  if (!acesso) {
    throw new Error("Este proprietário não tem cobrança/acesso para cancelar.");
  }
  if (acesso.status === "CANCELADO") {
    return { id: acesso.id, status: acesso.status };
  }

  await cancelarCobrancasAsaas(acesso);

  const atualizado = await prisma.brasilSolarAcesso.update({
    where: { id: acesso.id },
    data: {
      status: "CANCELADO",
      checkoutUrl: null,
      vigenteDesde: null,
      vigenteAte: null,
    },
  });

  return { id: atualizado.id, status: atualizado.status };
}

/** Extrai o acessoId de um externalReference "bs-acesso:<id>" (ou null). */
export function parseAcessoRef(externalReference?: string | null): string | null {
  if (!externalReference?.startsWith(ACESSO_REF_PREFIX)) return null;
  const id = externalReference.slice(ACESSO_REF_PREFIX.length).trim();
  return id || null;
}

/**
 * Ativa o acesso a partir de um pagamento confirmado (chamado pelo webhook).
 * Idempotente: reprocessar o mesmo evento apenas estende a vigência sem duplicar.
 * Localiza o acesso por externalReference (bs-acesso:<id>) ou pelo asaasChargeId.
 * Retorna o acesso atualizado, ou null se não for um pagamento de acesso.
 */
export async function ativarAcessoPorCobranca(params: {
  externalReference?: string | null;
  chargeId?: string | null;
  paidAt?: Date | null;
}): Promise<{ id: string; conviteToken: string; proprietarioId: string } | null> {
  const { externalReference, chargeId, paidAt } = params;

  const acessoId = parseAcessoRef(externalReference);
  let acesso = acessoId
    ? await prisma.brasilSolarAcesso.findUnique({ where: { id: acessoId } })
    : null;

  if (!acesso && chargeId) {
    acesso =
      (await prisma.brasilSolarAcesso.findFirst({
        where: { asaasChargeId: chargeId },
      })) ?? null;
  }
  if (!acesso) return null;

  const quando = paidAt ?? new Date();
  const vigenteAte = computeVigenteAte(
    acesso.modalidade as AcessoModalidade,
    quando,
  );
  const conviteToken = acesso.conviteToken ?? randomUUID();

  const atualizado = await prisma.brasilSolarAcesso.update({
    where: { id: acesso.id },
    data: {
      status: "ATIVO",
      pagoEm: acesso.pagoEm ?? quando,
      ativadoEm: acesso.ativadoEm ?? new Date(),
      vigenteAte,
      conviteToken,
    },
  });

  return {
    id: atualizado.id,
    conviteToken,
    proprietarioId: atualizado.proprietarioId,
  };
}

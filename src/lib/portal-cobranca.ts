/**
 * Camada de leitura/ação da página de pagamento BRANDED do cliente Brasil Solar.
 *
 * O cliente recebe um link nosso (`/portal-cliente/pagar/<conviteToken>`) em vez
 * do checkout hospedado do Asaas. Estas funções resolvem o token, localizam a
 * cobrança pendente no Asaas e devolvem só o que a tela pública precisa mostrar —
 * PIX (QR + copia-e-cola), boleto (linha digitável + PDF) e pagamento por cartão.
 *
 * Segurança: a chave é o `conviteToken` (@unique, UUID) — a rota é pública porque
 * o pagador ainda não tem conta. Nunca exponha aqui ids internos, e-mails de
 * terceiros ou dados sensíveis além do necessário pra pagar.
 */
import { prisma } from "@/lib/prisma";
import {
  getPayment,
  getPixQrCode,
  getIdentificationField,
  listSubscriptionPayments,
} from "@/lib/asaas";
import {
  pagarCobrancaComCartao,
  type CartaoInput,
  type TitularInput,
} from "@/lib/asaas-cartao";

/** Status de cobrança no Asaas que ainda aceitam pagamento. */
const STATUS_ABERTO = new Set(["PENDING", "OVERDUE", "AWAITING_RISK_ANALYSIS"]);
/** Status que indicam pagamento concluído. */
const STATUS_PAGO = new Set([
  "CONFIRMED",
  "RECEIVED",
  "RECEIVED_IN_CASH",
  "RECEIVED_IN_CASH_UNDONE",
]);

export interface CobrancaContexto {
  acessoId: string;
  proprietarioNome: string;
  modalidade: string;
  valor: number;
  status: string; // status do BrasilSolarAcesso (AGUARDANDO_PAGAMENTO/ATIVO/...)
  /** Id da cobrança aberta no Asaas, quando existe. */
  chargeId: string | null;
}

/**
 * Resolve o token → dados do acesso + a cobrança Asaas atualmente em aberto.
 * ANUAL: usa `asaasChargeId`. MENSAL: pega a 1ª cobrança em aberto da assinatura.
 * Retorna null quando o token não existe (não vaza se é inválido vs. inexistente).
 */
export async function resolverCobrancaPorToken(
  token: string,
): Promise<CobrancaContexto | null> {
  if (!token || token.length < 8) return null;

  const acesso = await prisma.brasilSolarAcesso.findUnique({
    where: { conviteToken: token },
    select: {
      id: true,
      modalidade: true,
      valor: true,
      status: true,
      asaasChargeId: true,
      asaasSubscriptionId: true,
      proprietario: { select: { nome: true } },
    },
  });
  if (!acesso) return null;

  let chargeId: string | null = acesso.asaasChargeId ?? null;

  // MENSAL: a cobrança em aberto vive dentro da assinatura.
  if (!chargeId && acesso.asaasSubscriptionId) {
    try {
      const pagamentos = await listSubscriptionPayments(acesso.asaasSubscriptionId);
      const emAberto = pagamentos.find((p) => STATUS_ABERTO.has(p.status));
      chargeId = emAberto?.id ?? pagamentos[0]?.id ?? null;
    } catch {
      chargeId = null;
    }
  }

  return {
    acessoId: acesso.id,
    proprietarioNome: acesso.proprietario?.nome ?? "",
    modalidade: acesso.modalidade,
    valor: acesso.valor,
    status: acesso.status,
    chargeId,
  };
}

export interface CobrancaView {
  proprietarioNome: string;
  modalidade: string;
  valor: number;
  /** "aberto" = pode pagar; "pago" = já confirmado; "indisponivel" = sem cobrança. */
  situacao: "aberto" | "pago" | "indisponivel";
}

/** Monta a visão pública da cobrança (sem dados sensíveis) para a tela. */
export async function getCobrancaView(token: string): Promise<CobrancaView | null> {
  const ctx = await resolverCobrancaPorToken(token);
  if (!ctx) return null;

  // Acesso já ativo (pago) — reflete direto, sem bater no Asaas.
  if (ctx.status === "ATIVO") {
    return {
      proprietarioNome: ctx.proprietarioNome,
      modalidade: ctx.modalidade,
      valor: ctx.valor,
      situacao: "pago",
    };
  }

  let situacao: CobrancaView["situacao"] = "indisponivel";
  if (ctx.chargeId) {
    try {
      const pay = await getPayment(ctx.chargeId);
      if (STATUS_PAGO.has(pay.status)) situacao = "pago";
      else if (STATUS_ABERTO.has(pay.status)) situacao = "aberto";
    } catch {
      situacao = "indisponivel";
    }
  }

  return {
    proprietarioNome: ctx.proprietarioNome,
    modalidade: ctx.modalidade,
    valor: ctx.valor,
    situacao,
  };
}

export interface PixView {
  encodedImage: string | null; // PNG base64 (sem prefixo data:)
  payload: string | null; // copia-e-cola
  expirationDate: string | null;
}

/** PIX da cobrança em aberto: QR (imagem) + copia-e-cola. */
export async function getPixDaCobranca(token: string): Promise<PixView | null> {
  const ctx = await resolverCobrancaPorToken(token);
  if (!ctx?.chargeId) return null;
  const qr = await getPixQrCode(ctx.chargeId);
  return {
    encodedImage: qr.encodedImage ?? null,
    payload: qr.payload ?? null,
    expirationDate: qr.expirationDate ?? null,
  };
}

export interface BoletoView {
  linhaDigitavel: string | null;
  bankSlipUrl: string | null; // PDF do boleto
}

/** Boleto da cobrança em aberto: linha digitável + link do PDF. */
export async function getBoletoDaCobranca(token: string): Promise<BoletoView | null> {
  const ctx = await resolverCobrancaPorToken(token);
  if (!ctx?.chargeId) return null;
  const [ident, pay] = await Promise.all([
    getIdentificationField(ctx.chargeId).catch(() => null),
    getPayment(ctx.chargeId).catch(() => null),
  ]);
  return {
    linhaDigitavel: ident?.identificationField ?? null,
    bankSlipUrl: pay?.bankSlipUrl ?? null,
  };
}

export interface PagarCartaoView {
  ok: boolean;
  status: string;
  /** true quando o Asaas já confirmou/recebeu o pagamento. */
  confirmado: boolean;
}

/**
 * Paga a cobrança em aberto com cartão (checkout transparente). A ativação do
 * acesso continua sendo feita pelo webhook do Asaas — aqui só disparamos.
 */
export async function pagarCartaoDaCobranca(params: {
  token: string;
  cartao: CartaoInput;
  titular: TitularInput;
  remoteIp: string;
}): Promise<PagarCartaoView> {
  const ctx = await resolverCobrancaPorToken(params.token);
  if (!ctx?.chargeId) {
    throw new Error("Cobrança não encontrada ou já paga.");
  }
  const res = await pagarCobrancaComCartao({
    chargeId: ctx.chargeId,
    cartao: params.cartao,
    titular: params.titular,
    remoteIp: params.remoteIp,
  });
  return {
    ok: true,
    status: res.status,
    confirmado: STATUS_PAGO.has(res.status),
  };
}

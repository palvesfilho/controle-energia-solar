import { prisma } from "@/lib/prisma";
import {
  AsaasError,
  createPayment,
  getOrCreateCustomer,
  type AsaasBillingType,
} from "@/lib/asaas";
import { getEncargosCobranca, encargosParaAsaas } from "@/lib/cobranca-textos";
import { formatMonthYear } from "@/lib/formatters";
import {
  buildInstallmentReference,
  serializeInstallments,
  type BillingInstallment,
} from "@/lib/billing-installments";
import { fragmentPayablesForInstallments } from "@/lib/investor-payables";
import { formatCodigoUc } from "@/lib/uc-codigo";
import { isOrigemBrasilSolar } from "@/lib/uc-origem";
import {
  MENSAGEM_SEM_COMPENSACAO,
  SKIP_SEM_COMPENSACAO,
  ucJaCompensou,
} from "@/lib/uc-trava-faturamento";
import {
  SKIP_SEM_CONTATO,
  avaliarContato,
  montarContato,
} from "@/lib/uc-trava-contato";
import { notificacaoPropriaAtiva, notificarCobranca } from "@/lib/notificar-cobranca";
import { randomUUID } from "node:crypto";

export interface EmitResult {
  billingId: string;
  ok: boolean;
  asaasChargeId?: string;
  asaasInvoiceUrl?: string | null;
  asaasStatus?: string;
  error?: string;
  skipped?: string;
}

function pickCpfCnpj(
  consumer: { cpfCnpj?: string | null; document?: string | null } | null,
  uc: { cpfCnpj?: string | null },
): string | null {
  return (
    consumer?.cpfCnpj?.trim() ||
    consumer?.document?.trim() ||
    uc?.cpfCnpj?.trim() ||
    null
  );
}

function pickEmail(
  consumer: { email?: string | null; emailsRecebimento?: string | null } | null,
): string | null {
  if (consumer?.email?.trim()) return consumer.email.trim();
  const list = consumer?.emailsRecebimento
    ?.split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  return list?.[0] ?? null;
}

export interface EmitBillingOptions {
  billingType?: AsaasBillingType;
  // Se informado, sobrescreve billing.dataVencimento antes de enviar.
  dataVencimento?: Date | null;
  // Se informado, persiste a escolha do operador (canais) e passa notificationDisabled correspondente.
  notificarEmail?: boolean;
  notificarWhatsapp?: boolean;
  // Parcelamento (uso esporádico): quando informado, cria N cobranças Asaas
  // independentes em vez de uma única. Cada item define dueDate (YYYY-MM-DD)
  // e valor. Soma deve bater com billing.valorCobranca (sem validação rígida).
  installments?: { dueDate: string; valor: number }[];
  /**
   * Avisar o cliente (email + WhatsApp) depois de emitir. Padrão `true` — é o
   * que faz "Emitir cobrança" e "Cobrar em lote" notificarem sem cada rota
   * precisar lembrar. `emit-cobranca.ts` passa `false` porque notifica ele
   * mesmo, depois de gerar o PDF, para o email sair com o anexo fresco.
   */
  notificar?: boolean;
}

export async function emitBillingToAsaas(
  billingId: string,
  options: EmitBillingOptions = {},
): Promise<EmitResult> {
  const { billingType = "UNDEFINED" } = options;

  // 🔇 Quem avisa o cliente somos nós (lib/notificar-cobranca.ts). Enquanto a
  // notificação própria estiver ligada, o Asaas fica calado — senão o cliente
  // recebe DOIS emails da mesma cobrança, um nosso e um do gateway, com textos
  // e remetentes diferentes.
  const asaasDeveNotificar = !notificacaoPropriaAtiva();

  // Persistir escolhas (data + canais) antes de tentar enviar, para que fique
  // gravado mesmo se o envio ao Asaas falhar.
  const prefUpdates: Record<string, unknown> = {};
  if (options.dataVencimento !== undefined) prefUpdates.dataVencimento = options.dataVencimento;
  if (options.notificarEmail !== undefined) prefUpdates.notificarEmail = options.notificarEmail;
  if (options.notificarWhatsapp !== undefined) prefUpdates.notificarWhatsapp = options.notificarWhatsapp;
  if (Object.keys(prefUpdates).length > 0) {
    await prisma.consumerUnitBilling.update({ where: { id: billingId }, data: prefUpdates });
  }

  const billing = await prisma.consumerUnitBilling.findUnique({
    where: { id: billingId },
    include: { consumerUnit: { include: { consumer: true } } },
  });
  if (!billing) return { billingId, ok: false, error: "Cobrança não encontrada" };
  // Só bloqueia reenvio se a cobrança atual ainda está ativa no Asaas.
  // Quando o status local é CANCELADO, permitimos reemitir uma nova cobrança
  // (a antiga é sobrescrita; histórico fica no Asaas).
  // "Ativa" = tem asaasChargeId (cobrança única) OU tem installments (parcelado).
  const temCobrancaAtiva = !!billing.asaasChargeId || !!billing.installments;
  if (temCobrancaAtiva && billing.status !== "CANCELADO") {
    return {
      billingId,
      ok: false,
      skipped: "already_sent",
      asaasChargeId: billing.asaasChargeId ?? undefined,
    };
  }
  const uc = billing.consumerUnit;

  // 🔒 UC DO MÓDULO BRASIL SOLAR NÃO É COBRADA AQUI.
  // Faturamento é o mundo da ASSOCIAÇÃO. A UC BS existe para baixar fatura e
  // alimentar o relatório do cliente BS — quem cobra ela é outro fluxo.
  // Existem 264 linhas de `ConsumerUnitBilling` em UC do Brasil Solar (todas
  // com valor zero, herdadas do cálculo mensal). Hoje o lote não as pega porque
  // filtra `valorCobranca > 0` — por ACIDENTE, não por regra: no dia em que uma
  // delas ganhar valor, o lote emitiria boleto real para cliente da rede BS.
  // Ver lib/uc-origem.ts.
  if (isOrigemBrasilSolar(uc.origem)) {
    return {
      billingId,
      ok: false,
      skipped: "uc_brasil_solar",
      error:
        "Esta UC é do módulo Brasil Solar e não é faturada pela Associação de Energia.",
    };
  }

  // 🔒 TRAVA DE FATURAMENTO — UC que nunca compensou não pode ser cobrada.
  // Vem ANTES da checagem de valor de propósito: sem compensação o motivo real
  // é a implantação, e um "no_value" mandaria o operador procurar defeito no
  // cálculo. Este é o ponto único por onde passam a emissão avulsa, o lote e o
  // pipeline do demonstrativo — ver lib/uc-trava-faturamento.ts.
  if (!(await ucJaCompensou(uc.id))) {
    return {
      billingId,
      ok: false,
      skipped: SKIP_SEM_COMPENSACAO,
      error: MENSAGEM_SEM_COMPENSACAO,
    };
  }

  if (!billing.valorCobranca || billing.valorCobranca <= 0) {
    return { billingId, ok: false, skipped: "no_value" };
  }

  // 🔒 TRAVA DE CONTATO — sem email E telefone, a cobrança não sai.
  // Vem DEPOIS do `no_value` de propósito: UC sem valor a cobrar não é uma
  // pendência de cadastro, e marcá-la como tal encheria a tela de falso alarme.
  // Substitui o antigo `skipped: "no_consumer"`, que recusava sem dizer por quê.
  // Ver lib/uc-trava-contato.ts.
  const travaContato = avaliarContato(montarContato(uc.id, uc.consumer));
  if (!travaContato.liberado) {
    return {
      billingId,
      ok: false,
      skipped: SKIP_SEM_CONTATO,
      error: travaContato.motivo,
    };
  }

  const consumer = uc.consumer;
  if (!consumer) return { billingId, ok: false, skipped: "no_consumer" };

  const cpfCnpj = pickCpfCnpj(consumer, uc);
  if (!cpfCnpj) return { billingId, ok: false, skipped: "no_cpf_cnpj" };

  const dueDate = billing.dataVencimento
    ? billing.dataVencimento.toISOString().slice(0, 10)
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const description = `Energia solar - UC ${formatCodigoUc(uc.codigoUc)} - ${formatMonthYear(billing.mes, billing.ano)}`;

  // Multa e juros do boleto, como configurados em Personalizações → Textos de
  // cobrança. Vem VAZIO quando ninguém configurou, e aí o Asaas mantém o que
  // estiver no painel dele — ver `encargosParaAsaas`.
  const encargos = encargosParaAsaas(await getEncargosCobranca());

  try {
    const customer = await getOrCreateCustomer({
      name: consumer.name,
      cpfCnpj,
      email: pickEmail(consumer),
      phone: consumer.phone,
      postalCode: uc.cep,
      address: uc.logradouro,
      addressNumber: uc.numero,
      complement: uc.complemento,
      externalReference: consumer.id,
      // 🔇 Silencia o Asaas no cadastro do PAGADOR, que é onde a régua vale.
      // Ver o comentário em AsaasCustomerInput: desligar só na cobrança deixou
      // o cliente receber dois emails no teste de 06/09/2026.
      notificationDisabled: !asaasDeveNotificar,
    });

    // Caminho parcelado: cria N cobranças Asaas independentes.
    if (options.installments && options.installments.length > 1) {
      const created: BillingInstallment[] = [];
      for (let i = 0; i < options.installments.length; i++) {
        const it = options.installments[i];
        const payment = await createPayment({
          customer: customer.id,
          billingType,
          value: it.valor,
          dueDate: it.dueDate,
          description: `${description} (parcela ${i + 1}/${options.installments.length})`,
          externalReference: buildInstallmentReference(billing.id, i),
          notificationDisabled: asaasDeveNotificar ? !billing.notificarEmail : true,
          ...encargos,
        });
        created.push({
          dueDate: it.dueDate,
          valor: it.valor,
          asaasChargeId: payment.id,
          asaasInvoiceUrl: payment.invoiceUrl ?? null,
          asaasStatus: payment.status,
          pagoEm: null,
        });
      }
      await prisma.consumerUnitBilling.update({
        where: { id: billing.id },
        data: {
          // Para cobranças parceladas, asaasChargeId fica null (o "principal" é
          // virtual — cada parcela tem seu próprio chargeId no JSON installments).
          asaasChargeId: null,
          asaasInvoiceUrl: null,
          asaasStatus: "INSTALLMENTS",
          asaasSyncedAt: new Date(),
          status: "ENVIADO_ASAAS",
          installments: serializeInstallments(created),
        },
      });
      // Fragmenta InvestorPayable em N partes proporcionais (cada parcela paga
      // libera independentemente seu próprio payable).
      await fragmentPayablesForInstallments(billing.id, created.length).catch(
        (e) =>
          console.error(
            "[emitBillingToAsaas] fragmentPayablesForInstallments falhou:",
            e,
          ),
      );
      await garantirTokenPublico(billingId);
      await avisarCliente(billingId, options);
      return {
        billingId,
        ok: true,
        asaasStatus: "INSTALLMENTS",
      };
    }

    // Caminho normal: 1 cobrança única.
    const payment = await createPayment({
      customer: customer.id,
      billingType,
      value: billing.valorCobranca,
      dueDate,
      description,
      externalReference: billing.id,
      notificationDisabled: asaasDeveNotificar ? !billing.notificarEmail : true,
      ...encargos,
    });
    await prisma.consumerUnitBilling.update({
      where: { id: billing.id },
      data: {
        asaasChargeId: payment.id,
        asaasInvoiceUrl: payment.invoiceUrl ?? null,
        asaasStatus: payment.status,
        asaasSyncedAt: new Date(),
        status: "ENVIADO_ASAAS",
        installments: null,
      },
    });
    await garantirTokenPublico(billingId);
    await avisarCliente(billingId, options);
    return {
      billingId,
      ok: true,
      asaasChargeId: payment.id,
      asaasInvoiceUrl: payment.invoiceUrl,
      asaasStatus: payment.status,
    };
  } catch (err) {
    const msg = err instanceof AsaasError ? err.message : String(err);
    return { billingId, ok: false, error: msg };
  }
}

/**
 * Dispara email + WhatsApp depois de a cobrança existir no Asaas.
 *
 * ⚠️ **Engole o erro de propósito.** A cobrança JÁ foi criada no gateway e
 * gravada aqui; deixar uma falha de email estourar faria a rota devolver erro
 * para um boleto que existe, e o operador tentaria emitir de novo — criando a
 * segunda cobrança para o mesmo mês. Cada canal grava a própria falha no
 * billing (`emailErro` / `whatsappErro`) e a tela oferece "Reenviar".
 */
/**
 * Garante o token público desta cobrança — a chave de `/fatura/<token>`, que vai
 * no email e no WhatsApp.
 *
 * Gerado na emissão e nunca regerado: o link já pode estar no celular do
 * cliente, e trocar a chave quebraria um link que ele guardou. Por isso o
 * `updateMany` com `tokenPublico: null` — dois processos emitindo ao mesmo tempo
 * não sobrescrevem um token já entregue.
 */
async function garantirTokenPublico(billingId: string): Promise<void> {
  await prisma.consumerUnitBilling.updateMany({
    where: { id: billingId, tokenPublico: null },
    data: { tokenPublico: randomUUID() },
  });
}

async function avisarCliente(billingId: string, options: EmitBillingOptions) {
  if (options.notificar === false) return;
  try {
    await notificarCobranca(billingId);
  } catch (e) {
    console.error("[emitBillingToAsaas] notificarCobranca falhou:", e);
  }
}

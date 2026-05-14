import { prisma } from "@/lib/prisma";
import {
  AsaasError,
  createPayment,
  getOrCreateCustomer,
  type AsaasBillingType,
} from "@/lib/asaas";
import { formatMonthYear } from "@/lib/formatters";
import {
  buildInstallmentReference,
  serializeInstallments,
  type BillingInstallment,
} from "@/lib/billing-installments";
import { fragmentPayablesForInstallments } from "@/lib/investor-payables";

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
}

export async function emitBillingToAsaas(
  billingId: string,
  options: EmitBillingOptions = {},
): Promise<EmitResult> {
  const { billingType = "UNDEFINED" } = options;

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
  if (!billing.valorCobranca || billing.valorCobranca <= 0) {
    return { billingId, ok: false, skipped: "no_value" };
  }
  const uc = billing.consumerUnit;
  const consumer = uc.consumer;
  if (!consumer) return { billingId, ok: false, skipped: "no_consumer" };

  const cpfCnpj = pickCpfCnpj(consumer, uc);
  if (!cpfCnpj) return { billingId, ok: false, skipped: "no_cpf_cnpj" };

  const dueDate = billing.dataVencimento
    ? billing.dataVencimento.toISOString().slice(0, 10)
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const description = `Energia solar - UC ${uc.codigoUc} - ${formatMonthYear(billing.mes, billing.ano)}`;

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
          notificationDisabled: !billing.notificarEmail,
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
      notificationDisabled: !billing.notificarEmail,
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

/**
 * Pipeline de emissão de cobrança ao cliente.
 *
 * Fluxo:
 *   1. Valida pré-condição: demonstrativo precisa estar validado.
 *   2. Cria cobrança no Asaas (delegado pra `emitBillingToAsaas`).
 *   3. Gera o PDF do novo demonstrativo (com código de barras Asaas embutido).
 *   4. Salva o PDF no storage (R2/local) e grava demonstrativoUrl + timestamp.
 *   5. (Fase 4) Dispara email pro cliente via Resend.
 *
 * O envio do email é feito SÍNCRONAMENTE no fim do pipeline: se falhar, o
 * billing fica com `emailErro` preenchido pra o operador clicar "Reenviar"
 * na UI. A cobrança Asaas continua ativa mesmo com falha de email.
 */
import { prisma } from "@/lib/prisma";
import { renderToBuffer } from "@react-pdf/renderer";
import { emitBillingToAsaas, type EmitBillingOptions } from "@/lib/billing-asaas";
import { loadDemonstrativoFaturaData } from "@/lib/demonstrativo-fatura";
import { DemonstrativoFaturaPdf } from "@/components/billing/demonstrativo-fatura-pdf";
import { saveBufferToStorage } from "@/lib/file-storage";
import { sendDemonstrativoEmail } from "@/lib/demonstrativo-email";

export interface EmitirCobrancaResult {
  ok: boolean;
  billingId: string;
  asaasChargeId?: string | null;
  asaasInvoiceUrl?: string | null;
  demonstrativoUrl?: string | null;
  emailEnviado?: boolean;
  emailErro?: string | null;
  error?: string;
  skipped?: string;
}

export interface EmitirCobrancaOptions extends EmitBillingOptions {
  /** Pula a etapa de envio de email (útil em testes / smoke). */
  pularEmail?: boolean;
}

export async function emitirCobrancaComDemonstrativo(
  billingId: string,
  options: EmitirCobrancaOptions = {},
): Promise<EmitirCobrancaResult> {
  // 1) Pré-condição: demonstrativo validado
  const pre = await prisma.consumerUnitBilling.findUnique({
    where: { id: billingId },
    select: { id: true, demonstrativoValidadoEm: true, consumerUnitId: true, ano: true, mes: true },
  });
  if (!pre) return { ok: false, billingId, error: "Cobrança não encontrada" };
  if (!pre.demonstrativoValidadoEm) {
    return {
      ok: false,
      billingId,
      error: "Demonstrativo ainda não foi validado — clique em 'Validar Demonstrativo' antes de realizar a cobrança.",
    };
  }

  // 2) Emite no Asaas (reaproveita o fluxo existente que já trata installments,
  //    cliente Asaas, etc.). Pra esse fluxo novo, sempre desligamos as
  //    notificações padrão do Asaas — quem envia somos nós, via Resend.
  const asaasResult = await emitBillingToAsaas(billingId, {
    ...options,
    notificarEmail: false,
  });
  if (!asaasResult.ok) {
    return {
      ok: false,
      billingId,
      error: asaasResult.error,
      skipped: asaasResult.skipped,
    };
  }

  // 3) Gera o PDF com o código de barras Asaas já incluído (o loader busca
  //    direto do Asaas a partir do asaasChargeId que acabou de ser gravado).
  const data = await loadDemonstrativoFaturaData(billingId);
  if (!data) {
    return {
      ok: false,
      billingId,
      asaasChargeId: asaasResult.asaasChargeId,
      asaasInvoiceUrl: asaasResult.asaasInvoiceUrl,
      error: "Falha ao montar dados do demonstrativo após criar a cobrança Asaas",
    };
  }

  const pdfBuffer = await renderToBuffer(DemonstrativoFaturaPdf({ data }));

  // 4) Salva no storage (mesmo padrão dos PDFs de fatura RGE)
  const fileName = `${pre.ano}-${String(pre.mes).padStart(2, "0")}-demonstrativo.pdf`;
  const subdir = `demonstrativos/${pre.consumerUnitId}`;
  await saveBufferToStorage(Buffer.from(pdfBuffer), subdir, fileName);
  const demonstrativoUrl = `/api/files/${subdir}/${fileName}`;

  await prisma.consumerUnitBilling.update({
    where: { id: billingId },
    data: {
      demonstrativoUrl,
      demonstrativoGeradoEm: new Date(),
    },
  });

  // 5) Email (Fase 4). Falha de email não cancela a cobrança — só sinaliza.
  let emailEnviado = false;
  let emailErro: string | null = null;
  if (!options.pularEmail) {
    try {
      await sendDemonstrativoEmail(billingId, Buffer.from(pdfBuffer));
      emailEnviado = true;
      await prisma.consumerUnitBilling.update({
        where: { id: billingId },
        data: { emailEnviadoEm: new Date(), emailErro: null },
      });
    } catch (err) {
      emailErro = err instanceof Error ? err.message : String(err);
      await prisma.consumerUnitBilling.update({
        where: { id: billingId },
        data: { emailErro },
      });
    }
  }

  return {
    ok: true,
    billingId,
    asaasChargeId: asaasResult.asaasChargeId ?? null,
    asaasInvoiceUrl: asaasResult.asaasInvoiceUrl ?? null,
    demonstrativoUrl,
    emailEnviado,
    emailErro,
  };
}

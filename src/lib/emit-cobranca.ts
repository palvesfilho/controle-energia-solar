/**
 * Pipeline de emissão de cobrança ao cliente.
 *
 * Fluxo:
 *   1. Valida pré-condições: demonstrativo validado, UC já compensou, cliente
 *      com contato cadastrado.
 *   2. Cria cobrança no Asaas (delegado pra `emitBillingToAsaas`).
 *   3. Gera o PDF do novo demonstrativo (com código de barras Asaas embutido)
 *      e salva no storage (`demonstrativo-pdf.ts`).
 *   4. Avisa o cliente por EMAIL e WHATSAPP (`notificar-cobranca.ts`).
 *
 * 🔑 O aviso é disparado AQUI, e não dentro do `emitBillingToAsaas`, porque
 * este caminho tem o PDF fresco em mãos — anexar o buffer que acabou de ser
 * renderizado evita gerar o mesmo documento duas vezes. Por isso o
 * `notificar: false` na chamada abaixo: sem ele, o cliente receberia dois
 * emails da mesma cobrança.
 *
 * Falha de aviso NÃO cancela a cobrança — o erro de cada canal fica gravado em
 * `emailErro` / `whatsappErro` para o operador clicar "Reenviar" na tela.
 */
import { prisma } from "@/lib/prisma";
import { emitBillingToAsaas, type EmitBillingOptions } from "@/lib/billing-asaas";
import { gerarESalvarDemonstrativo } from "@/lib/demonstrativo-pdf";
import { notificarCobranca, type ResultadoNotificacao } from "@/lib/notificar-cobranca";
import {
  MENSAGEM_SEM_COMPENSACAO,
  SKIP_SEM_COMPENSACAO,
  ucJaCompensou,
} from "@/lib/uc-trava-faturamento";
import {
  SKIP_SEM_CONTATO,
  avaliarContato,
  contatoDaUc,
} from "@/lib/uc-trava-contato";

export interface EmitirCobrancaResult {
  ok: boolean;
  billingId: string;
  asaasChargeId?: string | null;
  asaasInvoiceUrl?: string | null;
  demonstrativoUrl?: string | null;
  emailEnviado?: boolean;
  emailErro?: string | null;
  whatsappEnviado?: boolean;
  whatsappErro?: string | null;
  /** Resultado completo dos dois canais — a tela usa para o toast detalhado. */
  notificacao?: ResultadoNotificacao;
  error?: string;
  skipped?: string;
}

export interface EmitirCobrancaOptions extends EmitBillingOptions {
  /** Pula a etapa de aviso ao cliente (útil em testes / smoke). */
  pularEmail?: boolean;
}

export async function emitirCobrancaComDemonstrativo(
  billingId: string,
  options: EmitirCobrancaOptions = {},
): Promise<EmitirCobrancaResult> {
  // 1) Pré-condição: demonstrativo validado
  const pre = await prisma.consumerUnitBilling.findUnique({
    where: { id: billingId },
    select: { id: true, demonstrativoValidadoEm: true, consumerUnitId: true },
  });
  if (!pre) return { ok: false, billingId, error: "Cobrança não encontrada" };
  if (!pre.demonstrativoValidadoEm) {
    return {
      ok: false,
      billingId,
      error:
        "Demonstrativo ainda não foi validado — clique em 'Validar Demonstrativo' antes de realizar a cobrança.",
    };
  }

  // 🔒 TRAVA DE FATURAMENTO — UC que nunca compensou não pode ser cobrada.
  // `emitBillingToAsaas` também trava (é o ponto único), mas repetir aqui é de
  // propósito: assim a recusa chega ao operador com a frase inteira ANTES de
  // qualquer ida ao Asaas, em vez de um `skipped` genérico no meio do pipeline.
  if (!(await ucJaCompensou(pre.consumerUnitId))) {
    return {
      ok: false,
      billingId,
      skipped: SKIP_SEM_COMPENSACAO,
      error: MENSAGEM_SEM_COMPENSACAO,
    };
  }

  // 🔒 TRAVA DE CONTATO — mesmo motivo de repetir: emitir para um cliente sem
  // email e telefone cria boleto que ninguém é avisado que existe.
  const travaContato = avaliarContato(await contatoDaUc(pre.consumerUnitId));
  if (!travaContato.liberado) {
    return {
      ok: false,
      billingId,
      skipped: SKIP_SEM_CONTATO,
      error: travaContato.motivo,
    };
  }

  // 2) Emite no Asaas. `notificar: false` porque quem avisa é este pipeline,
  //    lá embaixo, com o PDF em mãos.
  const asaasResult = await emitBillingToAsaas(billingId, {
    ...options,
    notificarEmail: false,
    notificar: false,
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
  let pdf: { buffer: Buffer; nomeArquivo: string } | undefined;
  let demonstrativoUrl: string | null = null;
  try {
    const gerado = await gerarESalvarDemonstrativo(billingId);
    pdf = { buffer: gerado.buffer, nomeArquivo: gerado.nomeArquivo };
    demonstrativoUrl = gerado.url;
  } catch (err) {
    // A cobrança no Asaas já existe. Recusar aqui deixaria o operador tentando
    // de novo e criando cobrança duplicada — segue sem anexo, e o aviso do
    // canal de email registra a ressalva.
    console.error("[emitirCobrancaComDemonstrativo] falha ao gerar PDF:", err);
  }

  // 4) Avisa o cliente (email + WhatsApp).
  let notificacao: ResultadoNotificacao | undefined;
  if (!options.pularEmail) {
    notificacao = await notificarCobranca(billingId, pdf ? { pdf } : {});
  }

  return {
    ok: true,
    billingId,
    asaasChargeId: asaasResult.asaasChargeId ?? null,
    asaasInvoiceUrl: asaasResult.asaasInvoiceUrl ?? null,
    demonstrativoUrl,
    emailEnviado: notificacao?.email.status === "enviado",
    emailErro: notificacao?.email.erro ?? null,
    whatsappEnviado: notificacao?.whatsapp.status === "enviado",
    whatsappErro: notificacao?.whatsapp.erro ?? null,
    notificacao,
  };
}

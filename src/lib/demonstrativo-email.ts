/**
 * Envio do demonstrativo/fatura por email, com PDF anexado.
 *
 * Configuração necessária no .env:
 *   RESEND_API_KEY              — chave da Resend
 *   RESEND_FROM                 — remetente (ex.: "Associação Brasil Solar <sac@redebrasilsolar.com.br>")
 *   RESEND_REPLY_TO  (opcional) — endereço pra resposta
 *
 * Falhas (chave ausente, email inválido, rate limit) são propagadas como
 * exceções com mensagem amigável — o caller (emitirCobrancaComDemonstrativo)
 * captura e grava em `ConsumerUnitBilling.emailErro`.
 */
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";

const MES_LABEL = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function getResend(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY ausente no .env");
  return new Resend(key);
}

function getFrom(): string {
  return (
    process.env.RESEND_FROM ||
    "Associação Brasil Solar <onboarding@resend.dev>"
  );
}

function renderHtml(args: {
  clienteNome: string;
  mesLabel: string;
  valor: string;
  vencimento: string;
}): string {
  // Email simples — o conteúdo "rico" fica no PDF anexado.
  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Fatura ${args.mesLabel} — Associação Brasil Solar</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Helvetica,Arial,sans-serif;color:#111827">
  <div style="max-width:560px;margin:24px auto;background:#fff;border-radius:10px;padding:28px 32px;box-shadow:0 2px 12px rgba(0,0,0,.05)">
    <div style="height:6px;background:linear-gradient(90deg,#1B5E54 0%,#3BAE99 50%,#EA6E2C 100%);border-radius:3px;margin-bottom:20px"></div>
    <h1 style="font-size:18px;font-weight:700;color:#1B5E54;margin:0 0 12px">Sua fatura de ${args.mesLabel} chegou</h1>
    <p style="font-size:14px;line-height:1.55;color:#374151;margin:0 0 14px">
      Olá <strong>${args.clienteNome}</strong>, esta é a sua fatura mensal da Associação de Energia Brasil Solar.
    </p>
    <table style="width:100%;border-collapse:collapse;margin:8px 0 18px">
      <tr>
        <td style="padding:8px 0;font-size:13px;color:#6b7280">Valor a pagar</td>
        <td style="padding:8px 0;font-size:15px;font-weight:700;color:#1B5E54;text-align:right">${args.valor}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;font-size:13px;color:#6b7280;border-top:1px solid #e5e7eb">Vencimento</td>
        <td style="padding:8px 0;font-size:14px;font-weight:600;color:#111827;text-align:right;border-top:1px solid #e5e7eb">${args.vencimento}</td>
      </tr>
    </table>
    <p style="font-size:13px;line-height:1.55;color:#374151;margin:0 0 8px">
      O demonstrativo completo, com detalhamento da economia e os códigos de barras, está em anexo neste email.
    </p>
    <p style="font-size:12px;color:#6b7280;margin:18px 0 0">
      Em caso de dúvidas, responda este email ou escreva pra <a href="mailto:sac@redebrasilsolar.com.br" style="color:#1B5E54">sac@redebrasilsolar.com.br</a>.
    </p>
  </div>
  <p style="text-align:center;font-size:11px;color:#9ca3af;margin:12px 16px 24px">
    Associação de Energia Brasil Solar · Aluguel de usinas fotovoltaicas
  </p>
</body>
</html>`;
}

/**
 * Envia o email do demonstrativo. Lança em caso de erro.
 */
export async function sendDemonstrativoEmail(
  billingId: string,
  pdfBuffer: Buffer,
): Promise<{ id: string }> {
  const billing = await prisma.consumerUnitBilling.findUnique({
    where: { id: billingId },
    include: { consumerUnit: { include: { consumer: true } } },
  });
  if (!billing) throw new Error("Cobrança não encontrada");

  const consumer = billing.consumerUnit.consumer;
  const to = consumer?.email?.trim();
  if (!to) {
    throw new Error(
      `Consumer (${consumer?.id ?? "—"}) não tem email cadastrado — não foi possível enviar`,
    );
  }

  const resend = getResend();
  const mesLabel = `${MES_LABEL[billing.mes - 1]}/${String(billing.ano).slice(-2)}`;
  const valor = (billing.valorCobranca ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
  const venc = billing.dataVencimento
    ? billing.dataVencimento.toLocaleDateString("pt-BR")
    : "—";
  const filename = `fatura-${billing.consumerUnit.codigoUc}-${billing.ano}-${String(billing.mes).padStart(2, "0")}.pdf`;

  const result = await resend.emails.send({
    from: getFrom(),
    to,
    replyTo: process.env.RESEND_REPLY_TO || undefined,
    subject: `Sua fatura ${mesLabel} — Associação Brasil Solar`,
    html: renderHtml({
      clienteNome: consumer?.name ?? billing.consumerUnit.nome,
      mesLabel,
      valor,
      vencimento: venc,
    }),
    attachments: [
      {
        filename,
        content: pdfBuffer,
      },
    ],
  });

  if (result.error) {
    throw new Error(`Resend: ${result.error.message || result.error.name}`);
  }
  return { id: result.data?.id ?? "" };
}

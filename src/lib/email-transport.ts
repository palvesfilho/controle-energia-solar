/**
 * Transporte único de email do sistema.
 *
 * 🔑 **Por que existe.** Até 05/09/2026 cada lugar que mandava email chamava a
 * Resend direto (`demonstrativo-email.ts` e `analise-mensal-email.ts`). Trocar
 * de provedor significava lembrar de todos — e esquecer um não quebra nada
 * visível: o email simplesmente não sai, calado. Agora todo mundo passa por
 * aqui.
 *
 * Provedor padrão: **SMTP do Google** (`nodemailer`, senha de app). A Resend
 * continua no código atrás de `EMAIL_PROVIDER=resend`, para dar meia-volta sem
 * deploy se o Google emperrar.
 *
 * Configuração (variáveis de ambiente):
 *   EMAIL_PROVIDER            google (padrão) | resend
 *   GOOGLE_SMTP_USER          conta que autentica (ex.: sac@redebrasilsolar.com.br)
 *   GOOGLE_SMTP_APP_PASSWORD  "senha de app" do Google — exige 2FA ligado na conta
 *   GOOGLE_SMTP_FROM          remetente exibido (padrão: o próprio USER)
 *   GOOGLE_SMTP_REPLY_TO      (opcional) endereço de resposta
 *   GOOGLE_SMTP_HOST/PORT     (opcional) padrão smtp.gmail.com:465
 *   RESEND_API_KEY / RESEND_FROM / RESEND_REPLY_TO — só no modo resend
 *
 * ⚠️ A senha de app do Google NÃO é a senha da conta. É gerada em
 * myaccount.google.com → Segurança → Senhas de app, e só aparece lá se a
 * verificação em duas etapas estiver ligada.
 */
import nodemailer, { type Transporter } from "nodemailer";
import { Resend } from "resend";

export type ProvedorEmail = "google" | "resend";

export interface EmailAnexo {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface EnviarEmailArgs {
  /** Destinatário principal. */
  to: string | string[];
  /** Cópia — usada para os endereços extras de `emailsRecebimento`. */
  cc?: string[];
  subject: string;
  html: string;
  /** Alternativa em texto puro. Recomendado: melhora a entrega. */
  text?: string;
  attachments?: EmailAnexo[];
}

export interface EnvioEmailResult {
  id: string;
  provedor: ProvedorEmail;
  /** Todos os endereços que receberam (to + cc), para gravar no histórico. */
  destinatarios: string[];
}

export function provedorEmail(): ProvedorEmail {
  return (process.env.EMAIL_PROVIDER ?? "google").toLowerCase() === "resend"
    ? "resend"
    : "google";
}

/**
 * O provedor está configurado? Devolve o motivo em vez de lançar, para a tela
 * de diagnóstico poder mostrar "falta a variável X" sem derrubar a página.
 */
export function emailConfigurado(): { ok: boolean; provedor: ProvedorEmail; motivo?: string } {
  const provedor = provedorEmail();
  if (provedor === "resend") {
    return process.env.RESEND_API_KEY
      ? { ok: true, provedor }
      : { ok: false, provedor, motivo: "RESEND_API_KEY não configurada" };
  }
  const faltando = [
    !process.env.GOOGLE_SMTP_USER && "GOOGLE_SMTP_USER",
    !process.env.GOOGLE_SMTP_APP_PASSWORD && "GOOGLE_SMTP_APP_PASSWORD",
  ].filter(Boolean) as string[];
  return faltando.length === 0
    ? { ok: true, provedor }
    : { ok: false, provedor, motivo: `${faltando.join(" e ")} não configurada(s)` };
}

/**
 * Remetente exibido no email. O nome vem da MESMA variável que assina o
 * WhatsApp (`NOTIFICACAO_REMETENTE_NOME`) — dois canais assinando com nomes
 * diferentes fazem o cliente achar que um dos dois é golpe.
 */
export function remetentePadrao(): string {
  const nome = process.env.NOTIFICACAO_REMETENTE_NOME || "Associação de Energia Brasil Solar";
  if (provedorEmail() === "resend") {
    return process.env.RESEND_FROM || `${nome} <onboarding@resend.dev>`;
  }
  const user = process.env.GOOGLE_SMTP_USER ?? "";
  return process.env.GOOGLE_SMTP_FROM || (user ? `${nome} <${user}>` : user);
}

function replyToPadrao(): string | undefined {
  return provedorEmail() === "resend"
    ? process.env.RESEND_REPLY_TO || undefined
    : process.env.GOOGLE_SMTP_REPLY_TO || undefined;
}

/**
 * O transporte SMTP é caro de abrir (handshake TLS + login). Reaproveitado
 * entre chamadas — o lote de cobrança manda dezenas de emails seguidos e abrir
 * uma conexão por email faz o Google cortar por excesso de logins.
 */
let transporterCache: { chave: string; t: Transporter } | null = null;

function getTransporter(): Transporter {
  const user = process.env.GOOGLE_SMTP_USER;
  const pass = process.env.GOOGLE_SMTP_APP_PASSWORD;
  if (!user || !pass) {
    throw new Error(
      "Email pelo Google não configurado: faltam GOOGLE_SMTP_USER e/ou GOOGLE_SMTP_APP_PASSWORD.",
    );
  }
  const host = process.env.GOOGLE_SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.GOOGLE_SMTP_PORT || 465);
  const chave = `${host}:${port}:${user}`;
  if (transporterCache?.chave === chave) return transporterCache.t;

  const t = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    pool: true,
    maxConnections: 3,
    // O lote pode enfileirar muita coisa; sem teto o Google derruba a conexão.
    maxMessages: 50,
  });
  transporterCache = { chave, t };
  return t;
}

/**
 * Traduz o erro cru do SMTP para uma frase que diz o que fazer.
 *
 * Sem isto, "senha de app errada" chega ao operador como
 * `Invalid login: 535-5.7.8 Username and Password not accepted`, e o caminho
 * até "ligue o 2FA e gere uma senha de app" é longo.
 */
function traduzirErroSmtp(err: unknown): string {
  const e = err as { code?: string; responseCode?: number; message?: string };
  const msg = e?.message ?? String(err);
  if (e?.code === "EAUTH" || e?.responseCode === 535) {
    return (
      "Google recusou o login (EAUTH). A senha em GOOGLE_SMTP_APP_PASSWORD " +
      "precisa ser uma SENHA DE APP (16 caracteres), não a senha da conta, e a " +
      "verificação em duas etapas precisa estar ligada nessa conta Google. " +
      `Resposta do servidor: ${msg}`
    );
  }
  if (e?.code === "ETIMEDOUT" || e?.code === "ECONNECTION" || e?.code === "ESOCKET") {
    return `Não foi possível falar com o servidor SMTP do Google (${e.code}). ${msg}`;
  }
  if (e?.responseCode === 550 || e?.responseCode === 553) {
    return (
      "O Google recusou o remetente. O endereço em GOOGLE_SMTP_FROM precisa ser " +
      `a própria conta ou um alias autorizado nela ("Enviar e-mail como"). ${msg}`
    );
  }
  return msg;
}

function comoLista(v: string | string[]): string[] {
  return (Array.isArray(v) ? v : [v]).map((s) => s.trim()).filter(Boolean);
}

/**
 * Envia o email. Lança em caso de erro, com mensagem já traduzida — o caller
 * grava em `ConsumerUnitBilling.emailErro`.
 */
export async function enviarEmail(args: EnviarEmailArgs): Promise<EnvioEmailResult> {
  const to = comoLista(args.to);
  const cc = comoLista(args.cc ?? []).filter((e) => !to.includes(e));
  if (to.length === 0) throw new Error("Nenhum destinatário informado");

  const provedor = provedorEmail();
  const from = remetentePadrao();
  const replyTo = replyToPadrao();
  const destinatarios = [...to, ...cc];

  if (provedor === "resend") {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY ausente no .env");
    const resend = new Resend(key);
    const r = await resend.emails.send({
      from,
      to,
      cc: cc.length > 0 ? cc : undefined,
      replyTo,
      subject: args.subject,
      html: args.html,
      text: args.text,
      attachments: args.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
      })),
    });
    if (r.error) throw new Error(`Resend: ${r.error.message || r.error.name}`);
    return { id: r.data?.id ?? "", provedor, destinatarios };
  }

  try {
    const info = await getTransporter().sendMail({
      from,
      to,
      cc: cc.length > 0 ? cc : undefined,
      replyTo,
      subject: args.subject,
      html: args.html,
      text: args.text,
      attachments: args.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    });
    return { id: info.messageId ?? "", provedor, destinatarios };
  } catch (err) {
    throw new Error(traduzirErroSmtp(err));
  }
}

/**
 * Confere a conexão sem mandar email. Usado pelo script de diagnóstico —
 * `verify()` faz handshake e login, então pega senha de app errada na hora.
 */
export async function verificarConexaoEmail(): Promise<{ ok: boolean; detalhe: string }> {
  const cfg = emailConfigurado();
  if (!cfg.ok) return { ok: false, detalhe: cfg.motivo ?? "não configurado" };
  if (cfg.provedor === "resend") {
    return { ok: true, detalhe: "Resend configurada (sem verificação de login)" };
  }
  try {
    await getTransporter().verify();
    return { ok: true, detalhe: `SMTP do Google aceitou o login de ${process.env.GOOGLE_SMTP_USER}` };
  } catch (err) {
    return { ok: false, detalhe: traduzirErroSmtp(err) };
  }
}

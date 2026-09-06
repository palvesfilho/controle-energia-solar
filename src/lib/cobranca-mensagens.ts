/**
 * O TEXTO que o cliente recebe quando a cobrança é emitida — email e WhatsApp.
 *
 * Fica separado do disparo de propósito: mexer na redação é a coisa mais
 * frequente que se faz aqui, e não deve exigir entrar no meio do pipeline de
 * envio.
 *
 * O nome da empresa vem de `NOTIFICACAO_REMETENTE_NOME` (padrão "Associação de
 * Energia Brasil Solar", que é o que o email já dizia antes).
 */

import { formatCodigoUc } from "@/lib/uc-codigo";
import { emailSuporte, nomeRemetente } from "@/lib/identidade-remetente";
import { logoEmpresaUrl } from "@/lib/logo-empresa";

const MES_LABEL = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

// Reexportado para quem já importava daqui; a definição mora em
// `identidade-remetente.ts`, junto com o email de contato e a descrição.
export { nomeRemetente };

/**
 * Marcas de que o cadastro é uma EMPRESA, não uma pessoa. Metade da carteira é
 * pessoa jurídica ("CLINICA RADIOLOGICA CARIDADE LTDA", "GEDEZ PROFESSORES
 * ASSOCIADOS LTDA").
 */
const MARCAS_EMPRESA =
  /\b(LTDA|S\.?\/?A|EIRELI|MEI|EPP|ME|ASSOCIA[CÇ][AÃ]O|INSTITUTO|FUNDA[CÇ][AÃ]O|COL[EÉ]GIO|CL[IÍ]NICA|COM[EÉ]RCIO|COMERCIO|SERVI[CÇ]OS|PARTICIPA[CÇ][OÕ]ES|IND[UÚ]STRIA)\b/i;

/**
 * Como chamar o cliente na saudação. String vazia = sem nome, só "Olá!".
 *
 * Pessoa: primeiro nome em caixa de título — o cadastro guarda
 * "CRISTIANO ANTONIAZZI ABAID" em maiúsculas, e "Olá, CRISTIANO!" parece robô
 * gritando.
 *
 * 🪤 Empresa: NENHUM nome. Cortar no primeiro produziria "Olá, Clinica!" e
 * "Olá, Instituto!"; usar o nome inteiro grita "OLÁ, VITTA MALL PARTICIPAÇÕES
 * SOCIETÁRIAS S.A.!" num WhatsApp. Quem identifica de qual cliente e de qual
 * unidade se trata é a linha da UC na mensagem.
 */
export function primeiroNome(nomeCompleto: string): string {
  const nome = (nomeCompleto ?? "").trim();
  if (!nome || MARCAS_EMPRESA.test(nome)) return "";
  const p = nome.split(/\s+/)[0];
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
}

export interface DadosCobranca {
  clienteNome: string;
  mes: number;
  ano: number;
  valor: number;
  vencimento: Date | null;
  /** Página pública do Asaas com boleto + PIX. */
  linkPagamento: string | null;
  codigoUc: string;
}

export function mesLabel(mes: number, ano: number): string {
  return `${MES_LABEL[mes - 1]}/${String(ano).slice(-2)}`;
}

export function moeda(v: number): string {
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

export function dataBR(d: Date | null): string {
  return d ? d.toLocaleDateString("pt-BR") : "—";
}

// ---------------------------------------------------------------- WhatsApp

/**
 * Aviso de WhatsApp.
 *
 * Curto de propósito: o WhatsApp é o empurrão ("chegou, é este valor, vence
 * tal dia, paga aqui"); o detalhamento da economia vive no PDF que vai por
 * email. Mensagem longa no zap é lida pela metade.
 *
 * 🔑 **A linha da unidade não é enfeite.** Vários clientes têm mais de uma UC
 * no MESMO telefone (a Beltrame tem três). Sem o código, chegariam três
 * mensagens idênticas a menos do valor, e ninguém saberia qual boleto é de
 * qual loja.
 */
export function textoWhatsappCobranca(d: DadosCobranca): string {
  const saudacao = primeiroNome(d.clienteNome);
  const linhas = [
    `Olá${saudacao ? `, ${saudacao}` : ""}! Sua fatura de energia solar de ${mesLabel(d.mes, d.ano)} já está disponível.`,
    "",
    `*Unidade:* ${formatCodigoUc(d.codigoUc)}`,
    `*Valor:* ${moeda(d.valor)}`,
    `*Vencimento:* ${dataBR(d.vencimento)}`,
    "",
    "Pague por PIX ou boleto e veja o demonstrativo completo neste link:",
    d.linkPagamento ?? "",
    "",
    "O demonstrativo também foi enviado em PDF para o seu email.",
    "",
    nomeRemetente(),
  ];
  return linhas.join("\n");
}

// ------------------------------------------------------------------- Email

export function assuntoEmailCobranca(d: DadosCobranca): string {
  return `Sua fatura ${mesLabel(d.mes, d.ano)} — ${nomeRemetente()}`;
}

/** Alternativa em texto puro. Melhora a entrega e salva quem lê sem HTML. */
export function textoEmailCobranca(d: DadosCobranca): string {
  return [
    `Olá ${d.clienteNome},`,
    "",
    `Esta é a sua fatura de ${mesLabel(d.mes, d.ano)} referente à UC ${formatCodigoUc(d.codigoUc)}.`,
    "",
    `Valor a pagar: ${moeda(d.valor)}`,
    `Vencimento: ${dataBR(d.vencimento)}`,
    ...(d.linkPagamento
      ? ["", `Pagar e ver o demonstrativo: ${d.linkPagamento}`]
      : []),
    "",
    "O demonstrativo completo, com o detalhamento da economia e os códigos de pagamento, está anexado a este email.",
    "",
    `Dúvidas: responda este email ou escreva para ${emailSuporte()}.`,
    "",
    nomeRemetente(),
  ].join("\n");
}

/**
 * O timbre do email — a marca acima do texto.
 *
 * ⚠️ **Devolve vazio sem `APP_BASE_URL`.** Cliente de email não resolve
 * caminho relativo: sem domínio o `<img>` viraria um ícone quebrado no topo de
 * uma cobrança, que é pior do que não ter marca nenhuma. A mesma variável já
 * decide se o link de pagamento entra (ver `notificar-cobranca.ts`).
 *
 * 🖼️ Muitos clientes bloqueiam imagem externa por padrão — por isso o `alt`
 * é o nome da empresa e o nome continua escrito no rodapé. A marca ilustra;
 * ela nunca é o único jeito de saber quem está cobrando.
 */
function timbreEmail(): string {
  const url = logoEmpresaUrl();
  if (!url) return "";
  return `<img src="${url}" alt="${nomeRemetente()}" width="132" style="display:block;width:132px;max-width:60%;height:auto;margin:0 0 16px">`;
}

export function htmlEmailCobranca(d: DadosCobranca): string {
  const mes = mesLabel(d.mes, d.ano);
  const botao = d.linkPagamento
    ? `<p style="margin:0 0 18px"><a href="${d.linkPagamento}" style="display:inline-block;background:#1B5E54;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 22px;border-radius:6px">Pagar por PIX ou boleto</a></p>`
    : "";

  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Fatura ${mes} — ${nomeRemetente()}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Helvetica,Arial,sans-serif;color:#111827">
  <div style="max-width:560px;margin:24px auto;background:#fff;border-radius:10px;padding:28px 32px;box-shadow:0 2px 12px rgba(0,0,0,.05)">
    <div style="height:6px;background:linear-gradient(90deg,#1B5E54 0%,#3BAE99 50%,#EA6E2C 100%);border-radius:3px;margin-bottom:20px"></div>
    ${timbreEmail()}
    <h1 style="font-size:18px;font-weight:700;color:#1B5E54;margin:0 0 12px">Sua fatura de ${mes} chegou</h1>
    <p style="font-size:14px;line-height:1.55;color:#374151;margin:0 0 14px">
      Olá <strong>${d.clienteNome}</strong>, esta é a sua fatura mensal da ${nomeRemetente()}, referente à unidade consumidora <strong>${formatCodigoUc(d.codigoUc)}</strong>.
    </p>
    <table style="width:100%;border-collapse:collapse;margin:8px 0 18px">
      <tr>
        <td style="padding:8px 0;font-size:13px;color:#6b7280">Valor a pagar</td>
        <td style="padding:8px 0;font-size:15px;font-weight:700;color:#1B5E54;text-align:right">${moeda(d.valor)}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;font-size:13px;color:#6b7280;border-top:1px solid #e5e7eb">Vencimento</td>
        <td style="padding:8px 0;font-size:14px;font-weight:600;color:#111827;text-align:right;border-top:1px solid #e5e7eb">${dataBR(d.vencimento)}</td>
      </tr>
    </table>
    ${botao}
    <p style="font-size:13px;line-height:1.55;color:#374151;margin:0 0 8px">
      O demonstrativo completo, com o detalhamento da economia e os códigos de pagamento, está em anexo neste email.
    </p>
    <p style="font-size:12px;color:#6b7280;margin:18px 0 0">
      Em caso de dúvidas, responda este email ou escreva para <a href="mailto:${emailSuporte()}" style="color:#1B5E54">${emailSuporte()}</a>.
    </p>
  </div>
  <p style="text-align:center;font-size:11px;color:#9ca3af;margin:12px 16px 24px">
    ${nomeRemetente()} · Aluguel de usinas fotovoltaicas
  </p>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────── Lembretes de cobrança

/**
 * O texto dos lembretes de vencimento e de atraso.
 *
 * 🔑 **Tom.** Antes do vencimento é um favor ("passando para lembrar"); no
 * atraso é um aviso factual, nunca uma ameaça. Cliente de energia solar não
 * está fugindo da conta — na maioria das vezes o boleto se perdeu no email. O
 * texto que acusa transforma um esquecimento em atrito, e o link resolve mais
 * do que a firmeza.
 */
export interface DadosLembrete {
  clienteNome: string;
  codigoUc: string;
  mes: number;
  ano: number;
  valor: number;
  vencimento: Date | null;
  link: string | null;
  tipo: "ANTES" | "ATRASO";
  diasAtraso: number;
}

export function assuntoLembrete(d: DadosLembrete): string {
  const mes = mesLabel(d.mes, d.ano);
  return d.tipo === "ANTES"
    ? `Sua fatura ${mes} vence em ${dataBR(d.vencimento)}`
    : `Fatura ${mes} em aberto — ${nomeRemetente()}`;
}

export function textoLembreteWhatsapp(d: DadosLembrete): string {
  const saudacao = primeiroNome(d.clienteNome);
  const abertura =
    d.tipo === "ANTES"
      ? `Olá${saudacao ? `, ${saudacao}` : ""}! Passando para lembrar que a sua fatura de energia solar de ${mesLabel(d.mes, d.ano)} vence em ${dataBR(d.vencimento)}.`
      : `Olá${saudacao ? `, ${saudacao}` : ""}! A sua fatura de energia solar de ${mesLabel(d.mes, d.ano)} venceu em ${dataBR(d.vencimento)} e consta em aberto.`;

  return [
    abertura,
    "",
    `*Unidade:* ${formatCodigoUc(d.codigoUc)}`,
    `*Valor:* ${moeda(d.valor)}`,
    "",
    ...(d.link
      ? ["Pague por PIX ou boleto e veja o demonstrativo neste link:", d.link, ""]
      : []),
    d.tipo === "ATRASO"
      ? "Se já pagou nos últimos dias, pode desconsiderar — a confirmação pode levar um pouco para chegar."
      : "",
    nomeRemetente(),
  ]
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n");
}

export function textoLembreteEmail(d: DadosLembrete): string {
  return [
    `Olá ${d.clienteNome},`,
    "",
    d.tipo === "ANTES"
      ? `Passando para lembrar que a sua fatura de ${mesLabel(d.mes, d.ano)}, da UC ${formatCodigoUc(d.codigoUc)}, vence em ${dataBR(d.vencimento)}.`
      : `A sua fatura de ${mesLabel(d.mes, d.ano)}, da UC ${formatCodigoUc(d.codigoUc)}, venceu em ${dataBR(d.vencimento)} e consta em aberto.`,
    "",
    `Valor: ${moeda(d.valor)}`,
    ...(d.link ? ["", `Pagar e ver o demonstrativo: ${d.link}`] : []),
    "",
    ...(d.tipo === "ATRASO"
      ? ["Se o pagamento foi feito nos últimos dias, pode desconsiderar este aviso.", ""]
      : []),
    `Dúvidas: responda este email ou escreva para ${emailSuporte()}.`,
    "",
    nomeRemetente(),
  ].join("\n");
}

export function htmlLembrete(d: DadosLembrete): string {
  const mes = mesLabel(d.mes, d.ano);
  const titulo =
    d.tipo === "ANTES" ? `Sua fatura de ${mes} vence em breve` : `Fatura de ${mes} em aberto`;
  const linha =
    d.tipo === "ANTES"
      ? `Passando para lembrar: a fatura da unidade <strong>${formatCodigoUc(d.codigoUc)}</strong> vence em <strong>${dataBR(d.vencimento)}</strong>.`
      : `A fatura da unidade <strong>${formatCodigoUc(d.codigoUc)}</strong> venceu em <strong>${dataBR(d.vencimento)}</strong> e consta em aberto.`;
  const botao = d.link
    ? `<p style="margin:0 0 18px"><a href="${d.link}" style="display:inline-block;background:#1B5E54;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 22px;border-radius:6px">Pagar por PIX ou boleto</a></p>`
    : "";
  const ressalva =
    d.tipo === "ATRASO"
      ? `<p style="font-size:12px;color:#6b7280;margin:0 0 8px">Se o pagamento foi feito nos últimos dias, pode desconsiderar este aviso — a confirmação bancária leva algum tempo para chegar até nós.</p>`
      : "";

  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>${titulo}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Helvetica,Arial,sans-serif;color:#111827">
  <div style="max-width:560px;margin:24px auto;background:#fff;border-radius:10px;padding:28px 32px;box-shadow:0 2px 12px rgba(0,0,0,.05)">
    <div style="height:6px;background:linear-gradient(90deg,#1B5E54 0%,#3BAE99 50%,#EA6E2C 100%);border-radius:3px;margin-bottom:20px"></div>
    ${timbreEmail()}
    <h1 style="font-size:18px;font-weight:700;color:#1B5E54;margin:0 0 12px">${titulo}</h1>
    <p style="font-size:14px;line-height:1.55;color:#374151;margin:0 0 14px">Olá <strong>${d.clienteNome}</strong>, ${linha}</p>
    <p style="font-size:15px;font-weight:700;color:#1B5E54;margin:0 0 18px">${moeda(d.valor)}</p>
    ${botao}
    ${ressalva}
    <p style="font-size:12px;color:#6b7280;margin:18px 0 0">
      Dúvidas? Responda este email ou escreva para <a href="mailto:${emailSuporte()}" style="color:#1B5E54">${emailSuporte()}</a>.
    </p>
  </div>
  <p style="text-align:center;font-size:11px;color:#9ca3af;margin:12px 16px 24px">${nomeRemetente()}</p>
</body>
</html>`;
}

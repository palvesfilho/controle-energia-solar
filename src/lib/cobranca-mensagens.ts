/**
 * O TEXTO que o cliente recebe na cobrança — email e WhatsApp.
 *
 * Fica separado do disparo de propósito: mexer na redação é a coisa mais
 * frequente que se faz aqui, e não deve exigir entrar no meio do pipeline de
 * envio.
 *
 * 🔑 **Desde 06/09/2026 a redação não mora mais aqui.** Ela vem de
 * `cobranca-textos.ts`, editável em Personalizações → Textos de cobrança. O
 * que este arquivo faz é MONTAR a mensagem: renderizar as variáveis, vestir o
 * HTML com a moldura da marca e pendurar a mobília que não é redação (valor,
 * vencimento, botão, assinatura).
 *
 * Todas as funções aceitam os textos por parâmetro e caem no PADRÃO se nada
 * for passado. Isso mantém o simulador e os testes funcionando sem banco, e
 * garante que uma redação salva com defeito nunca impeça a cobrança de sair.
 *
 * O nome da empresa vem de `NOTIFICACAO_REMETENTE_NOME` (padrão "Associação de
 * Energia Brasil Solar", que é o que o email já dizia antes).
 */

import { formatCodigoUc } from "@/lib/uc-codigo";
import { descricaoNegocio, emailSuporte, nomeRemetente } from "@/lib/identidade-remetente";
import { logoEmpresaUrl } from "@/lib/logo-empresa";
import {
  TEXTOS_PADRAO,
  ENCARGOS_PADRAO,
  renderTexto,
  percentualBR,
  type TextoEstagio,
  type TextosCobranca,
  type EncargosCobranca,
  type EstagioCobranca,
  type NomeVariavel,
} from "@/lib/cobranca-textos";
import { escapeHtml, paragrafosHtml as paragrafos } from "@/lib/texto-variaveis";

const MES_LABEL = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

const MES_EXTENSO = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
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

// ─────────────────────────────────────────────── Da redação para a mensagem

interface DadosDaVariavel {
  clienteNome: string;
  codigoUc: string;
  mes: number;
  ano: number;
  valor: number;
  vencimento: Date | null;
  link: string | null;
  diasAtraso?: number;
}

/**
 * Os valores que substituem `{{cada variável}}`.
 *
 * 🔑 Um lugar só, para email e WhatsApp: se `{{valor}}` fosse montado duas
 * vezes, um dia o email diria "R$ 1.234,50" e o zap "1234.5".
 */
function valoresDasVariaveis(
  d: DadosDaVariavel,
  encargos: EncargosCobranca,
): Record<NomeVariavel, string> {
  const nome = primeiroNome(d.clienteNome);
  return {
    saudacao: nome ? `Olá, ${nome}` : "Olá",
    cliente: d.clienteNome,
    primeiroNome: nome,
    uc: formatCodigoUc(d.codigoUc),
    mes: mesLabel(d.mes, d.ano),
    mesExtenso: `${MES_EXTENSO[d.mes - 1]} de ${d.ano}`,
    valor: moeda(d.valor),
    vencimento: dataBR(d.vencimento),
    link: d.link ?? "",
    diasAtraso: String(d.diasAtraso ?? 0),
    multa: percentualBR(encargos.multaPercentual),
    juros: encargos.jurosMensalPercentual
      ? `${percentualBR(encargos.jurosMensalPercentual)} ao mês`
      : "—",
    empresa: nomeRemetente(),
    suporte: emailSuporte(),
  };
}

/**
 * As chaves que o envio realmente preenche.
 *
 * 🔑 Existe para a guarda de build comparar com `VARIAVEIS`. Sem ela o furo é
 * invisível: uma variável declarada e não preenchida some da frase em vez de
 * gritar, e ninguém descobre até um cliente perguntar por que a mensagem tem
 * um buraco. Ver `scripts/verifica-textos-cobranca.ts`.
 */
export function chavesPreenchidasPeloEnvio(): string[] {
  return Object.keys(
    valoresDasVariaveis(
      {
        clienteNome: "Fulano de Tal",
        codigoUc: "3090656984",
        mes: 1,
        ano: 2026,
        valor: 0,
        vencimento: null,
        link: null,
      },
      ENCARGOS_PADRAO,
    ),
  );
}

/**
 * Renderiza um campo do texto, caindo no PADRÃO se o personalizado quebrar.
 *
 * ⚠️ **Nunca lança.** Esta função roda dentro do disparo: um texto salvo com
 * defeito não pode impedir a cobrança de sair. O defeito vira log e o cliente
 * recebe a mensagem de fábrica, que é sempre válida.
 */
function render(
  texto: string,
  padrao: string,
  valores: Record<NomeVariavel, string>,
  onde: string,
): string {
  try {
    return renderTexto(texto, valores);
  } catch (e) {
    console.error(`[cobranca-textos] ${onde}: ${(e as Error).message} — usando o texto padrão`);
    return renderTexto(padrao, valores);
  }
}

export const ESTILO_PARAGRAFO_EMAIL =
  "font-size:14px;line-height:1.55;color:#374151;margin:0 0 14px";

/**
 * Linhas em branco viram parágrafos; uma quebra sozinha vira `<br>`.
 *
 * 🔒 O escape mora em `texto-variaveis.ts`, compartilhado com os comunicados em
 * massa: o corpo é texto do OPERADOR indo para dentro de um HTML, e ter duas
 * versões dessa proteção é ter uma que um dia fica para trás.
 */
function paragrafosHtml(texto: string): string {
  return paragrafos(texto, ESTILO_PARAGRAFO_EMAIL);
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
 * qual loja. Por isso ela vem no texto PADRÃO — quem editar e tirar, tira
 * sabendo.
 *
 * A assinatura com o nome da empresa é fixa, fora do texto editável: no
 * WhatsApp ela é a única coisa que diz de quem é a mensagem.
 */
export function textoWhatsappCobranca(
  d: DadosCobranca,
  texto: TextoEstagio = TEXTOS_PADRAO.FATURA,
  encargos: EncargosCobranca = ENCARGOS_PADRAO,
): string {
  const v = valoresDasVariaveis({ ...d, link: d.linkPagamento }, encargos);
  const corpo = render(texto.corpoWhatsapp, TEXTOS_PADRAO.FATURA.corpoWhatsapp, v, "FATURA/whatsapp");
  return `${corpo}\n\n${nomeRemetente()}`;
}

// ------------------------------------------------------------------- Email

export function assuntoEmailCobranca(
  d: DadosCobranca,
  texto: TextoEstagio = TEXTOS_PADRAO.FATURA,
  encargos: EncargosCobranca = ENCARGOS_PADRAO,
): string {
  const v = valoresDasVariaveis({ ...d, link: d.linkPagamento }, encargos);
  return render(texto.assunto, TEXTOS_PADRAO.FATURA.assunto, v, "FATURA/assunto");
}

/** Alternativa em texto puro. Melhora a entrega e salva quem lê sem HTML. */
export function textoEmailCobranca(
  d: DadosCobranca,
  texto: TextoEstagio = TEXTOS_PADRAO.FATURA,
  encargos: EncargosCobranca = ENCARGOS_PADRAO,
): string {
  const v = valoresDasVariaveis({ ...d, link: d.linkPagamento }, encargos);
  const corpo = render(texto.corpoEmail, TEXTOS_PADRAO.FATURA.corpoEmail, v, "FATURA/email");
  return corpoEmailComRodape(corpo, d.valor, d.vencimento, d.linkPagamento);
}

/**
 * A MOBÍLIA do email em texto puro: valor, vencimento, link e assinatura.
 *
 * Fica fora do texto editável de propósito. Valor e vencimento são o dado da
 * cobrança, não redação — e um operador que apagasse `{{valor}}` sem querer
 * mandaria uma cobrança sem dizer quanto é.
 */
function corpoEmailComRodape(
  corpo: string,
  valor: number,
  vencimento: Date | null,
  link: string | null,
): string {
  return [
    corpo,
    "",
    `Valor a pagar: ${moeda(valor)}`,
    `Vencimento: ${dataBR(vencimento)}`,
    ...(link ? ["", `Pagar e ver o demonstrativo: ${link}`] : []),
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

/**
 * O HTML de QUALQUER email de cobrança — fatura e lembretes.
 *
 * 🔑 Era duplicado em dois lugares até 06/09/2026, e foi por isso que o timbre
 * precisou ser inserido duas vezes. Agora a moldura é uma só: timbre, título,
 * o texto do operador, o quadro de valor e vencimento, o botão e o rodapé.
 */
function htmlEmailBase(opcoes: {
  titulo: string;
  corpo: string;
  valor: number;
  vencimento: Date | null;
  link: string | null;
}): string {
  const botao = opcoes.link
    ? `<p style="margin:0 0 18px"><a href="${opcoes.link}" style="display:inline-block;background:#1B5E54;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 22px;border-radius:6px">Pagar por PIX ou boleto</a></p>`
    : "";

  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>${escapeHtml(opcoes.titulo)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Helvetica,Arial,sans-serif;color:#111827">
  <div style="max-width:560px;margin:24px auto;background:#fff;border-radius:10px;padding:28px 32px;box-shadow:0 2px 12px rgba(0,0,0,.05)">
    <div style="height:6px;background:linear-gradient(90deg,#1B5E54 0%,#3BAE99 50%,#EA6E2C 100%);border-radius:3px;margin-bottom:20px"></div>
    ${timbreEmail()}
    <h1 style="font-size:18px;font-weight:700;color:#1B5E54;margin:0 0 12px">${escapeHtml(opcoes.titulo)}</h1>
    ${paragrafosHtml(opcoes.corpo)}
    <table style="width:100%;border-collapse:collapse;margin:8px 0 18px">
      <tr>
        <td style="padding:8px 0;font-size:13px;color:#6b7280">Valor a pagar</td>
        <td style="padding:8px 0;font-size:15px;font-weight:700;color:#1B5E54;text-align:right">${moeda(opcoes.valor)}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;font-size:13px;color:#6b7280;border-top:1px solid #e5e7eb">Vencimento</td>
        <td style="padding:8px 0;font-size:14px;font-weight:600;color:#111827;text-align:right;border-top:1px solid #e5e7eb">${dataBR(opcoes.vencimento)}</td>
      </tr>
    </table>
    ${botao}
    <p style="font-size:12px;color:#6b7280;margin:18px 0 0">
      Em caso de dúvidas, responda este email ou escreva para <a href="mailto:${emailSuporte()}" style="color:#1B5E54">${emailSuporte()}</a>.
    </p>
  </div>
  <p style="text-align:center;font-size:11px;color:#9ca3af;margin:12px 16px 24px">
    ${nomeRemetente()} · ${descricaoNegocio()}
  </p>
</body>
</html>`;
}

export function htmlEmailCobranca(
  d: DadosCobranca,
  texto: TextoEstagio = TEXTOS_PADRAO.FATURA,
  encargos: EncargosCobranca = ENCARGOS_PADRAO,
): string {
  const v = valoresDasVariaveis({ ...d, link: d.linkPagamento }, encargos);
  return htmlEmailBase({
    titulo: render(texto.assunto, TEXTOS_PADRAO.FATURA.assunto, v, "FATURA/assunto"),
    corpo: render(texto.corpoEmail, TEXTOS_PADRAO.FATURA.corpoEmail, v, "FATURA/email"),
    valor: d.valor,
    vencimento: d.vencimento,
    link: d.linkPagamento,
  });
}

// ─────────────────────────────────────────────────────── Lembretes de cobrança

/**
 * O texto dos lembretes de vencimento e de atraso.
 *
 * 🔑 **Tom.** Antes do vencimento é um favor ("passando para lembrar"); no
 * atraso é um aviso factual, nunca uma ameaça. Cliente de energia solar não
 * está fugindo da conta — na maioria das vezes o boleto se perdeu no email. O
 * texto que acusa transforma um esquecimento em atrito, e o link resolve mais
 * do que a firmeza. Passados os dias de `atrasoFirmeDias` o tom sobe um
 * degrau — mas quem escolhe as palavras é o operador, na tela.
 *
 * 🪤 **`tipo` NÃO é o estágio do texto.** `tipo` é o que se grava em
 * `CobrancaLembrete`, e entra na chave única que impede reenvio. Se o dia 15
 * passasse a gravar um `tipo` novo, um lembrete já enviado deixaria de ser
 * reconhecido e o cliente receberia dois. O estágio do texto se decide à
 * parte, em `estagioDoLembrete`.
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

/** Qual redação usar: a de atraso recente ou a de atraso prolongado. */
export function estagioDoLembrete(
  d: Pick<DadosLembrete, "tipo" | "diasAtraso">,
  encargos: EncargosCobranca = ENCARGOS_PADRAO,
): EstagioCobranca {
  if (d.tipo === "ANTES") return "ANTES";
  return d.diasAtraso >= encargos.atrasoFirmeDias ? "ATRASO_FIRME" : "ATRASO";
}

export function assuntoLembrete(
  d: DadosLembrete,
  textos: TextosCobranca = TEXTOS_PADRAO,
  encargos: EncargosCobranca = ENCARGOS_PADRAO,
): string {
  const e = estagioDoLembrete(d, encargos);
  const v = valoresDasVariaveis(d, encargos);
  return render(textos[e].assunto, TEXTOS_PADRAO[e].assunto, v, `${e}/assunto`);
}

export function textoLembreteWhatsapp(
  d: DadosLembrete,
  textos: TextosCobranca = TEXTOS_PADRAO,
  encargos: EncargosCobranca = ENCARGOS_PADRAO,
): string {
  const e = estagioDoLembrete(d, encargos);
  const v = valoresDasVariaveis(d, encargos);
  const corpo = render(textos[e].corpoWhatsapp, TEXTOS_PADRAO[e].corpoWhatsapp, v, `${e}/whatsapp`);
  return `${corpo}\n\n${nomeRemetente()}`;
}

export function textoLembreteEmail(
  d: DadosLembrete,
  textos: TextosCobranca = TEXTOS_PADRAO,
  encargos: EncargosCobranca = ENCARGOS_PADRAO,
): string {
  const e = estagioDoLembrete(d, encargos);
  const v = valoresDasVariaveis(d, encargos);
  const corpo = render(textos[e].corpoEmail, TEXTOS_PADRAO[e].corpoEmail, v, `${e}/email`);
  return corpoEmailComRodape(corpo, d.valor, d.vencimento, d.link);
}

export function htmlLembrete(
  d: DadosLembrete,
  textos: TextosCobranca = TEXTOS_PADRAO,
  encargos: EncargosCobranca = ENCARGOS_PADRAO,
): string {
  const e = estagioDoLembrete(d, encargos);
  const v = valoresDasVariaveis(d, encargos);
  return htmlEmailBase({
    titulo: render(textos[e].assunto, TEXTOS_PADRAO[e].assunto, v, `${e}/assunto`),
    corpo: render(textos[e].corpoEmail, TEXTOS_PADRAO[e].corpoEmail, v, `${e}/email`),
    valor: d.valor,
    vencimento: d.vencimento,
    link: d.link,
  });
}

/**
 * Aviso ao cliente de que a cobrança foi emitida: EMAIL + WHATSAPP.
 *
 * 🔑 **Um ponto só, de propósito.** Antes de 05/09/2026 existiam três caminhos
 * de emissão e só um tentava avisar o cliente — o lote e a emissão avulsa
 * criavam boleto no Asaas e o cliente descobria quando vencia. Esta função é
 * chamada do fim do `emitBillingToAsaas`, por onde os três passam.
 *
 * ⚠️ **Nada aqui derruba a cobrança.** Boleto emitido com email falhado
 * continua boleto emitido: o erro de cada canal é gravado no billing para o
 * operador reenviar pela tela. O contrário — desfazer a cobrança porque o email
 * caiu — deixaria o Asaas e o banco em estados diferentes.
 *
 * **Modo de operação — `NOTIFICACAO_COBRANCA_MODO`:**
 *   simulacao (padrão) — monta tudo, registra no log para quem iria, NÃO envia.
 *   real                — envia de verdade.
 *   off                 — não faz nada.
 *
 * O padrão é `simulacao` porque isto toca caixa de entrada e celular de gente
 * de verdade e não tem desfazer. Sai de simulação com decisão explícita, não
 * por deploy.
 */
import { prisma } from "@/lib/prisma";
import { parseInstallments } from "@/lib/billing-installments";
import { linkPublicoDaFatura } from "@/lib/fatura-publica";
import {
  textosDeCobranca,
  getEncargosCobranca,
  type TextoEstagio,
  type EncargosCobranca,
} from "@/lib/cobranca-textos";
import { enviarEmail, emailConfigurado } from "@/lib/email-transport";
import { enviarTextoWhatsapp, uazapiConfigurado } from "@/lib/whatsapp-uazapi";
import { gerarESalvarDemonstrativo } from "@/lib/demonstrativo-pdf";
import { montarContato, formatarTelefone, type ContatoUc } from "@/lib/uc-trava-contato";
import {
  assuntoEmailCobranca,
  htmlEmailCobranca,
  textoEmailCobranca,
  textoWhatsappCobranca,
  type DadosCobranca,
} from "@/lib/cobranca-mensagens";

export type ModoNotificacao = "off" | "simulacao" | "real";

export function modoNotificacao(): ModoNotificacao {
  const v = (process.env.NOTIFICACAO_COBRANCA_MODO ?? "simulacao").toLowerCase();
  if (v === "real") return "real";
  if (v === "off") return "off";
  return "simulacao";
}

/** A notificação própria está ligada? Se sim, o Asaas NÃO deve notificar também. */
export function notificacaoPropriaAtiva(): boolean {
  return modoNotificacao() !== "off";
}

export type StatusCanal =
  | "enviado"
  | "simulado"
  | "erro"
  | "sem_destino"
  | "desligado";

export interface ResultadoCanal {
  status: StatusCanal;
  /** Para quem foi (ou iria): endereços de email, ou o E.164 do WhatsApp. */
  destino: string | null;
  erro: string | null;
  /** Enviado, mas com uma ressalva (ex.: email sem o PDF anexado). */
  aviso?: string;
  /** Só em simulação: o conteúdo que teria saído. */
  previa?: string;
}

export interface ResultadoNotificacao {
  billingId: string;
  modo: ModoNotificacao;
  email: ResultadoCanal;
  whatsapp: ResultadoCanal;
}

export interface NotificarOpcoes {
  /** PDF já gerado pelo caller — evita gerar duas vezes no pipeline completo. */
  pdf?: { buffer: Buffer; nomeArquivo: string };
  /** Força o envio real mesmo em `simulacao` (usado pelo botão de teste). */
  forcarReal?: boolean;
}

const desligado = (): ResultadoCanal => ({
  status: "desligado",
  destino: null,
  erro: null,
});

/**
 * Link de pagamento que vai na mensagem.
 *
 * 🔑 **Preferimos SEMPRE o nosso** (`/fatura/<token>`): o cliente paga por PIX
 * ou boleto e abre o demonstrativo no domínio da empresa, em vez de ser jogado
 * no checkout hospedado do Asaas. Ver `lib/fatura-publica.ts`.
 *
 * O link do Asaas fica como reserva, e não é decoração: as cobranças emitidas
 * antes de 06/09/2026 não têm `tokenPublico`, e sem esta linha o reenvio de uma
 * delas sairia sem link nenhum.
 *
 * 🪤 **Cobrança parcelada não tem `asaasInvoiceUrl`.** Nesse caminho o campo
 * fica null de propósito (o "principal" é virtual — cada parcela tem o seu id
 * dentro do JSON `installments`). Sem tratar isso, o cliente parcelado receberia
 * "cobrança sem link" para sempre, calado.
 */
function linkDePagamento(billing: {
  tokenPublico: string | null;
  asaasInvoiceUrl: string | null;
  installments: string | null;
}): string | null {
  // `APP_BASE_URL` vazio produziria "/fatura/xxx" sem domínio — inútil dentro de
  // um email. Nesse caso vale mais o link do Asaas do que um link quebrado.
  if (billing.tokenPublico && process.env.APP_BASE_URL) {
    return linkPublicoDaFatura(billing.tokenPublico);
  }
  if (billing.asaasInvoiceUrl) return billing.asaasInvoiceUrl;
  const parcelas = parseInstallments(billing.installments);
  return parcelas?.find((p) => p.asaasInvoiceUrl)?.asaasInvoiceUrl ?? null;
}

export async function notificarCobranca(
  billingId: string,
  opcoes: NotificarOpcoes = {},
): Promise<ResultadoNotificacao> {
  const modo = opcoes.forcarReal ? "real" : modoNotificacao();
  if (modo === "off") {
    return { billingId, modo, email: desligado(), whatsapp: desligado() };
  }

  const billing = await prisma.consumerUnitBilling.findUnique({
    where: { id: billingId },
    include: { consumerUnit: { include: { consumer: true } } },
  });
  if (!billing) {
    const erro: ResultadoCanal = {
      status: "erro",
      destino: null,
      erro: "Cobrança não encontrada",
    };
    return { billingId, modo, email: erro, whatsapp: { ...erro } };
  }

  const uc = billing.consumerUnit;
  const contato = montarContato(uc.id, uc.consumer);
  const dados: DadosCobranca = {
    clienteNome: uc.consumer?.name ?? uc.nome,
    mes: billing.mes,
    ano: billing.ano,
    valor: billing.valorCobranca ?? 0,
    vencimento: billing.dataVencimento,
    linkPagamento: linkDePagamento(billing),
    codigoUc: uc.codigoUc,
  };

  // A redação e os encargos vêm do banco (Personalizações → Textos de
  // cobrança). Lidos UMA vez por cobrança: os dois canais têm que dizer a
  // mesma coisa, e reler no meio abriria a janela para o operador salvar entre
  // o email e o WhatsApp.
  const textos = await textosDeCobranca();
  const encargos = await getEncargosCobranca();

  const email = await notificarPorEmail(billingId, dados, contato, modo, opcoes, textos.FATURA, encargos);
  const whatsapp = await notificarPorWhatsapp(billingId, dados, contato, modo, textos.FATURA, encargos);

  if (modo === "simulacao") {
    console.log(
      `[notificar-cobranca][SIMULAÇÃO] billing=${billingId} uc=${uc.codigoUc} ` +
        `email→${email.destino ?? "—"} (${email.status}) ` +
        `whatsapp→${whatsapp.destino ?? "—"} (${whatsapp.status})`,
    );
  }

  return { billingId, modo, email, whatsapp };
}

// ------------------------------------------------------------------- Email

async function notificarPorEmail(
  billingId: string,
  dados: DadosCobranca,
  contato: ContatoUc,
  modo: ModoNotificacao,
  opcoes: NotificarOpcoes,
  texto: TextoEstagio,
  encargos: EncargosCobranca,
): Promise<ResultadoCanal> {
  if (contato.emails.length === 0) {
    const erro = "Cliente sem email cadastrado";
    if (modo === "real") await gravarEmail(billingId, { erro });
    return { status: "sem_destino", destino: null, erro };
  }

  const destino = contato.emails.join("; ");
  const cfg = emailConfigurado();
  if (!cfg.ok) {
    const erro = `Email não configurado: ${cfg.motivo}`;
    if (modo === "real") await gravarEmail(billingId, { erro });
    return { status: "erro", destino, erro };
  }

  const assunto = assuntoEmailCobranca(dados, texto, encargos);

  // ⚠️ A simulação sai ANTES de gerar o PDF de propósito.
  // `gerarESalvarDemonstrativo` escreve no storage e atualiza
  // `demonstrativoUrl`/`demonstrativoGeradoEm` no billing — uma "simulação" que
  // mexe no banco não é simulação. O preço é não provar aqui que o PDF monta;
  // quem prova isso é o botão "Visualizar Cobrança" da tela.
  if (modo === "simulacao") {
    return {
      status: "simulado",
      destino,
      erro: null,
      previa: `[${assunto}] ${textoEmailCobranca(dados, texto, encargos)}`,
    };
  }

  // O PDF é buscado aqui e não no caller para que o LOTE também mande o anexo.
  // Falhar em gerar o PDF não cancela o email: o cliente precisa saber do valor
  // e do vencimento de qualquer forma — mas a ressalva fica registrada.
  let pdf = opcoes.pdf ?? null;
  let avisoPdf: string | undefined;
  if (!pdf) {
    try {
      const g = await gerarESalvarDemonstrativo(billingId);
      pdf = { buffer: g.buffer, nomeArquivo: g.nomeArquivo };
    } catch (err) {
      avisoPdf = `enviado SEM o demonstrativo anexado: ${
        err instanceof Error ? err.message : String(err)
      }`;
    }
  }

  try {
    const r = await enviarEmail({
      to: contato.emails[0],
      cc: contato.emails.slice(1),
      subject: assunto,
      html: htmlEmailCobranca(dados, texto, encargos),
      text: textoEmailCobranca(dados, texto, encargos),
      attachments: pdf
        ? [
            {
              filename: pdf.nomeArquivo,
              content: pdf.buffer,
              contentType: "application/pdf",
            },
          ]
        : undefined,
    });
    await gravarEmail(billingId, {
      enviadoEm: new Date(),
      destinatarios: r.destinatarios.join("; "),
      // Ressalva do anexo fica gravada JUNTO com o "enviado": os dois campos
      // preenchidos é o que a tela pinta como âmbar, não como falha.
      erro: avisoPdf ? `ENVIADO ${avisoPdf}` : null,
    });
    return { status: "enviado", destino, erro: null, aviso: avisoPdf };
  } catch (err) {
    const erro = err instanceof Error ? err.message : String(err);
    await gravarEmail(billingId, { erro });
    return { status: "erro", destino, erro };
  }
}

async function gravarEmail(
  billingId: string,
  d: { enviadoEm?: Date; destinatarios?: string; erro: string | null },
) {
  await prisma.consumerUnitBilling.update({
    where: { id: billingId },
    data: {
      ...(d.enviadoEm ? { emailEnviadoEm: d.enviadoEm } : {}),
      ...(d.destinatarios ? { emailDestinatarios: d.destinatarios } : {}),
      emailErro: d.erro,
    },
  });
}

// ---------------------------------------------------------------- WhatsApp

async function notificarPorWhatsapp(
  billingId: string,
  dados: DadosCobranca,
  contato: ContatoUc,
  modo: ModoNotificacao,
  texto: TextoEstagio,
  encargos: EncargosCobranca,
): Promise<ResultadoCanal> {
  if (!contato.telefone) {
    const erro = contato.telefoneCadastrado
      ? `Telefone cadastrado ("${contato.telefoneCadastrado}") não serve para WhatsApp`
      : "Cliente sem telefone cadastrado";
    if (modo === "real") await gravarWhatsapp(billingId, { erro });
    return { status: "sem_destino", destino: null, erro };
  }

  const destino = formatarTelefone(contato.telefone);

  // 🚫 Sem link não vai mensagem. Um WhatsApp dizendo "sua fatura chegou" sem
  // dizer onde pagar gera ligação para o SAC, não pagamento.
  if (!dados.linkPagamento) {
    const erro =
      "Cobrança sem link de pagamento do Asaas (invoiceUrl) — nada a enviar por WhatsApp";
    if (modo === "real") await gravarWhatsapp(billingId, { erro, numero: contato.telefone });
    return { status: "erro", destino, erro };
  }

  const cfg = uazapiConfigurado();
  if (!cfg.ok) {
    const erro = `WhatsApp não configurado: ${cfg.motivo}`;
    if (modo === "real") await gravarWhatsapp(billingId, { erro, numero: contato.telefone });
    return { status: "erro", destino, erro };
  }

  const mensagem = textoWhatsappCobranca(dados, texto, encargos);
  if (modo === "simulacao") {
    return { status: "simulado", destino, erro: null, previa: mensagem };
  }

  try {
    await enviarTextoWhatsapp(contato.telefone, mensagem);
    await gravarWhatsapp(billingId, {
      enviadoEm: new Date(),
      numero: contato.telefone,
      erro: null,
    });
    return { status: "enviado", destino, erro: null };
  } catch (err) {
    const erro = err instanceof Error ? err.message : String(err);
    await gravarWhatsapp(billingId, { erro, numero: contato.telefone });
    return { status: "erro", destino, erro };
  }
}

async function gravarWhatsapp(
  billingId: string,
  d: { enviadoEm?: Date; numero?: string; erro: string | null },
) {
  await prisma.consumerUnitBilling.update({
    where: { id: billingId },
    data: {
      ...(d.enviadoEm ? { whatsappEnviadoEm: d.enviadoEm } : {}),
      ...(d.numero ? { whatsappNumero: d.numero } : {}),
      whatsappErro: d.erro,
    },
  });
}

/**
 * O DISPARO de um comunicado em massa.
 *
 * Três coisas separam isto de um laço que chama `enviarEmail` 75 vezes, e as
 * três são a razão de o módulo existir:
 *
 * 1. **Ninguém recebe duas vezes.** Cada destinatário vira uma linha em
 *    `ComunicadoEnvio` com índice único `(comunicado, tipo, destinatário)`, e a
 *    linha é gravada ANTES do envio. Um clique repetido no botão, um restart de
 *    contêiner no meio, uma aba aberta duas vezes — em todos os casos a segunda
 *    tentativa esbarra no índice e para. Mensagem em massa repetida é o jeito
 *    mais rápido de perder a lista.
 *
 * 2. **WhatsApp sai ESPAÇADO.** Disparar 72 mensagens seguidas por API
 *    não-oficial é o comportamento que faz o número ser banido. O intervalo é
 *    aleatório dentro de uma faixa, e não fixo: cadência de metrônomo é
 *    exatamente o que se detecta.
 *
 * 3. **Nasce em simulação.** `COMUNICADOS_MODO` decide, e o padrão é
 *    `simulacao`. Chave PRÓPRIA, separada de `NOTIFICACAO_COBRANCA_MODO`: um
 *    aviso de reajuste não deveria depender de ligar as notificações de fatura,
 *    nem o contrário.
 */
import { prisma } from "@/lib/prisma";
import { enviarEmail, emailConfigurado } from "@/lib/email-transport";
import { enviarTextoWhatsapp, uazapiConfigurado } from "@/lib/whatsapp-uazapi";
import {
  resolverPublico,
  descreverPublico,
  type Destinatario,
  type FiltroComunicado,
  type PublicoComunicado,
} from "@/lib/comunicados-publico";
import {
  htmlComunicado,
  renderParaDestinatario,
  textoWhatsappComunicado,
  variaveisDesconhecidas,
  type TipoComunicado,
  type DesenhoComunicado,
} from "@/lib/comunicados-textos";

export type ModoComunicado = "simulacao" | "real";

/** `COMUNICADOS_MODO=real` libera o envio. Qualquer outra coisa é ensaio. */
export function modoComunicado(): ModoComunicado {
  return (process.env.COMUNICADOS_MODO ?? "simulacao").toLowerCase() === "real"
    ? "real"
    : "simulacao";
}

/**
 * Intervalo entre WhatsApps, em milissegundos. Aleatório dentro da faixa.
 *
 * 4–9 s dá ~10 minutos para 75 mensagens. É lento de propósito: a alternativa
 * é rápido e banido.
 */
const ESPERA_WHATSAPP_MIN = 4000;
const ESPERA_WHATSAPP_MAX = 9000;

function esperar(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface ResultadoComunicado {
  comunicadoId: string;
  modo: ModoComunicado;
  publicoResumo: string;
  destinatarios: number;
  email: { enviados: number; falhas: number; semDestino: number };
  whatsapp: { enviados: number; falhas: number; semDestino: number };
  /** Já tinham linha gravada — a trava de reenvio funcionando. */
  jaEnviados: number;
  erros: string[];
}

/**
 * O TIPO de destinatário usado no envio de teste.
 *
 * 🪤 **É o que impede o teste de gastar o envio real.** A trava de reenvio é o
 * índice único `(comunicado, tipo, destinatário)`. Se o teste gravasse a linha
 * do cliente com o tipo normal, o disparo de verdade depois PULARIA essa
 * pessoa — ela ficaria sem a mensagem porque alguém testou. Com um tipo à
 * parte, as duas linhas convivem e ninguém é perdido.
 */
const TIPO_TESTE = "TESTE";

export interface OpcoesDisparo {
  /**
   * Manda para ESTE endereço em vez de para a lista, usando o mesmo caminho do
   * envio real: mesmo público, mesmo render, mesma gravação. Serve para a
   * primeira execução do código acontecer contra quem operou, e não contra a
   * carteira.
   */
  testePara?: string;
}

/**
 * Dispara. Idempotente por destinatário; pode ser chamada de novo com
 * segurança para completar um disparo interrompido.
 */
export async function dispararComunicado(
  comunicadoId: string,
  opcoes: OpcoesDisparo = {},
): Promise<ResultadoComunicado> {
  const teste = opcoes.testePara?.trim() || null;
  // ⚠️ O teste IGNORA o modo: ele vai para o endereço de quem está operando, e
  // um "teste" que não sai não testa nada. O modo continua mandando na lista.
  const modo: ModoComunicado = teste ? "real" : modoComunicado();
  const c = await prisma.comunicado.findUnique({ where: { id: comunicadoId } });
  if (!c) throw new Error("Comunicado não encontrado");
  if (c.status === "ENVIADO") throw new Error("Este comunicado já foi enviado");

  const publico = c.publico as PublicoComunicado;
  const filtro = (c.publicoFiltro ?? {}) as FiltroComunicado;
  const canais = c.canais.split(",").map((x) => x.trim().toUpperCase());
  const querEmail = canais.includes("EMAIL");
  const querWhatsapp = canais.includes("WHATSAPP");

  // ⚠️ A validação acontece AQUI de novo, e não só ao salvar. Entre salvar e
  // disparar alguém pode ter mexido no texto por outra via, e um `{{}}` errado
  // no meio de 75 mensagens não tem desfazer.
  for (const [onde, texto] of [
    ["assunto", c.assunto],
    ["texto do email", c.corpoEmail],
    ["texto do WhatsApp", c.corpoWhatsapp],
  ] as const) {
    const ruins = variaveisDesconhecidas(texto, publico);
    if (ruins.length > 0) {
      throw new Error(`No ${onde} há variável que não existe: ${ruins.map((r) => `{{${r}}}`).join(", ")}`);
    }
  }

  const listaCompleta = await resolverPublico(publico, filtro);
  // No teste, UMA pessoa real do recorte — os dados dela alimentam as
  // variáveis, então o email chega igualzinho ao que ela receberia.
  const lista = teste ? listaCompleta.slice(0, 1) : listaCompleta;
  const resultado: ResultadoComunicado = {
    comunicadoId,
    modo,
    publicoResumo: descreverPublico(publico, filtro),
    destinatarios: lista.length,
    email: { enviados: 0, falhas: 0, semDestino: 0 },
    whatsapp: { enviados: 0, falhas: 0, semDestino: 0 },
    jaEnviados: 0,
    erros: [],
  };

  if (lista.length === 0) {
    resultado.erros.push("O recorte não alcançou ninguém.");
    return resultado;
  }

  const emailOk = emailConfigurado();
  const zapOk = uazapiConfigurado();
  if (querEmail && !emailOk.ok) resultado.erros.push(`Email: ${emailOk.motivo}`);
  if (querWhatsapp && !zapOk.ok) resultado.erros.push(`WhatsApp: ${zapOk.motivo}`);

  // 🔒 O teste NÃO mexe no status: o comunicado continua rascunho, editável, e
  // o disparo de verdade continua disponível. Um teste que marcasse "enviado"
  // trancaria o que ele existe para destravar.
  if (!teste) await prisma.comunicado.update({
    where: { id: comunicadoId },
    data: {
      status: "ENVIANDO",
      simulacao: modo === "simulacao",
      publicoResumo: resultado.publicoResumo,
      totalDestinatarios: lista.length,
      totalEmail: lista.filter((d) => d.emails.length > 0).length,
      totalWhatsapp: lista.filter((d) => !!d.telefone).length,
    },
  });

  // 🪤 **O teste tem de poder rodar de novo.** O índice único vale para o tipo
  // TESTE também, então a segunda tentativa esbarraria nele e não mandaria
  // nada — em silêncio, que é o pior jeito de descobrir. Testar é justamente
  // o ciclo "manda, olha, corrige o texto, manda outra vez"; então a linha do
  // teste anterior é apagada antes. Isso NÃO toca nas linhas do envio real:
  // elas têm outro tipo.
  if (teste) {
    await prisma.comunicadoEnvio.deleteMany({
      where: { comunicadoId, destinatarioTipo: TIPO_TESTE },
    });
  }

  let primeiroZap = true;
  for (const d of lista) {
    // 🔒 A LINHA PRIMEIRO. Se o envio falhar depois disto, o destinatário fica
    // marcado como tentado e não recebe de novo numa segunda rodada — que é o
    // erro certo: melhor alguém ficar sem a mensagem do que recebê-la duas
    // vezes com o texto de uma campanha em massa.
    let envio;
    try {
      envio = await prisma.comunicadoEnvio.create({
        data: {
          comunicadoId,
          destinatarioTipo: teste ? TIPO_TESTE : d.tipo,
          destinatarioId: d.id,
          destinatarioNome: d.nome,
          email: teste ? teste : d.emails.join("; ") || null,
          telefone: teste ? null : d.telefone,
          emailStatus: !querEmail ? "NAO_APLICA" : teste ? "PENDENTE" : d.emails.length === 0 ? "SEM_DESTINO" : "PENDENTE",
          // No teste o WhatsApp não sai: não há número de teste, e mandar para
          // o número do cliente não seria teste, seria envio.
          whatsappStatus: teste ? "NAO_APLICA" : !querWhatsapp ? "NAO_APLICA" : !d.telefone ? "SEM_DESTINO" : "PENDENTE",
        },
      });
    } catch {
      // Índice único: já foi. É o caminho normal de uma segunda rodada.
      resultado.jaEnviados++;
      continue;
    }

    if (querEmail) {
      if (!teste && d.emails.length === 0) resultado.email.semDestino++;
      else await mandarEmail(c, d, envio.id, modo, emailOk.ok, resultado, teste);
    }

    if (querWhatsapp && !teste) {
      if (!d.telefone) resultado.whatsapp.semDestino++;
      else {
        // Espera ANTES de cada mensagem, menos a primeira: assim o intervalo
        // existe entre duas mensagens de verdade, e não sobra no fim.
        if (!primeiroZap && modo === "real") {
          await esperar(
            ESPERA_WHATSAPP_MIN + Math.random() * (ESPERA_WHATSAPP_MAX - ESPERA_WHATSAPP_MIN),
          );
        }
        primeiroZap = false;
        await mandarWhatsapp(c, d, envio.id, modo, zapOk.ok, resultado);
      }
    }
  }

  if (!teste) {
    await prisma.comunicado.update({
      where: { id: comunicadoId },
      data: { status: "ENVIADO", enviadoEm: new Date() },
    });
  }

  console.log(
    `[comunicado] ${comunicadoId} (${modo}) — ${resultado.publicoResumo} · ` +
      `${resultado.destinatarios} pessoas · email ${resultado.email.enviados}/${resultado.email.falhas} · ` +
      `whatsapp ${resultado.whatsapp.enviados}/${resultado.whatsapp.falhas} · repetidos ${resultado.jaEnviados}`,
  );
  return resultado;
}

async function mandarEmail(
  c: {
    assunto: string;
    corpoEmail: string;
    tipo: string;
    desenho: string;
    destaqueRotulo: string | null;
    destaqueValor: string | null;
    destaqueNota: string | null;
    botaoTexto: string | null;
    botaoUrl: string | null;
    botaoNota: string | null;
  },
  d: Destinatario,
  envioId: string,
  modo: ModoComunicado,
  configurado: boolean,
  r: ResultadoComunicado,
  /** Quando presente, o email vai para cá em vez de ir para o cliente. */
  testePara: string | null = null,
): Promise<void> {
  try {
    const assunto = renderParaDestinatario(c.assunto, d);
    const corpo = renderParaDestinatario(c.corpoEmail, d);

    if (modo === "simulacao" || !configurado) {
      await prisma.comunicadoEnvio.update({
        where: { id: envioId },
        data: {
          emailStatus: "SIMULADO",
          emailErro: configurado ? null : "email não configurado",
        },
      });
      return;
    }

    await enviarEmail({
      to: testePara ?? d.emails[0],
      // No teste ninguém entra em cópia — o endereço de teste recebe sozinho.
      cc: testePara ? [] : d.emails.slice(1),
      subject: assunto,
      html: htmlComunicado(assunto, corpo, c.tipo as TipoComunicado, c.desenho as DesenhoComunicado, {
        destaqueRotulo: c.destaqueRotulo,
        destaqueValor: c.destaqueValor,
        destaqueNota: c.destaqueNota,
        botaoTexto: c.botaoTexto,
        botaoUrl: c.botaoUrl,
        botaoNota: c.botaoNota,
      }),
      text: corpo,
    });
    await prisma.comunicadoEnvio.update({
      where: { id: envioId },
      data: { emailStatus: "ENVIADO", emailEnviadoEm: new Date() },
    });
    r.email.enviados++;
  } catch (e) {
    r.email.falhas++;
    const msg = e instanceof Error ? e.message : String(e);
    r.erros.push(`${d.nome} (email): ${msg}`);
    await prisma.comunicadoEnvio.update({
      where: { id: envioId },
      data: { emailStatus: "FALHA", emailErro: msg.slice(0, 400) },
    });
  }
}

async function mandarWhatsapp(
  c: { corpoWhatsapp: string },
  d: Destinatario,
  envioId: string,
  modo: ModoComunicado,
  configurado: boolean,
  r: ResultadoComunicado,
): Promise<void> {
  try {
    const corpo = textoWhatsappComunicado(renderParaDestinatario(c.corpoWhatsapp, d));

    if (modo === "simulacao" || !configurado) {
      await prisma.comunicadoEnvio.update({
        where: { id: envioId },
        data: {
          whatsappStatus: "SIMULADO",
          whatsappErro: configurado ? null : "WhatsApp não configurado",
        },
      });
      return;
    }

    await enviarTextoWhatsapp(d.telefone!, corpo);
    await prisma.comunicadoEnvio.update({
      where: { id: envioId },
      data: { whatsappStatus: "ENVIADO", whatsappEnviadoEm: new Date() },
    });
    r.whatsapp.enviados++;
  } catch (e) {
    r.whatsapp.falhas++;
    const msg = e instanceof Error ? e.message : String(e);
    r.erros.push(`${d.nome} (WhatsApp): ${msg}`);
    await prisma.comunicadoEnvio.update({
      where: { id: envioId },
      data: { whatsappStatus: "FALHA", whatsappErro: msg.slice(0, 400) },
    });
  }
}

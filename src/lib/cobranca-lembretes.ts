/**
 * Lembretes de cobrança — vencimento próximo e atraso.
 *
 * 🔑 **Por que isto existe.** Em 06/09/2026 silenciamos as notificações do
 * Asaas no cadastro do pagador, para o cliente parar de receber dois emails da
 * mesma cobrança. Isso levou junto os avisos de vencimento e de atraso, que o
 * Asaas dava de graça — e o cliente passou a receber a fatura e silêncio até o
 * boleto vencer. Estes lembretes são a reposição, agora com a nossa marca e o
 * nosso link.
 *
 * A régua vem de `getCadenciaCobranca` (Personalizações → Cadência de
 * cobranças) e nasce DESLIGADA.
 *
 * ⚠️ **Idempotência é a regra central, não um detalhe.** Cada lembrete grava
 * uma linha em `CobrancaLembrete` com `@@unique(billing, tipo, dia, canal)`.
 * Sem isso, um restart de contêiner no dia do vencimento reenviaria tudo — e
 * cobrança repetida queima a confiança do cliente mais rápido do que atraso
 * nenhum. A linha é gravada ANTES do envio, justamente para que uma falha no
 * meio não vire reenvio na próxima rodada.
 */
import { prisma } from "@/lib/prisma";
import { SEM_UC_BRASIL_SOLAR } from "@/lib/uc-origem";
import { getCadenciaCobranca, type CadenciaCobranca } from "@/lib/app-settings";
import { montarContato, formatarTelefone } from "@/lib/uc-trava-contato";
import { enviarEmail, emailConfigurado } from "@/lib/email-transport";
import { enviarTextoWhatsapp, uazapiConfigurado } from "@/lib/whatsapp-uazapi";
import { modoNotificacao } from "@/lib/notificar-cobranca";
import { linkPublicoDaFatura } from "@/lib/fatura-publica";
import {
  assuntoLembrete,
  htmlLembrete,
  textoLembreteEmail,
  textoLembreteWhatsapp,
  type DadosLembrete,
} from "@/lib/cobranca-mensagens";

export type TipoLembrete = "ANTES" | "ATRASO";
export type CanalLembrete = "EMAIL" | "WHATSAPP";

export interface ResultadoLembretes {
  modo: string;
  cadenciaAtiva: boolean;
  /** Cobranças que a régua selecionou para hoje. */
  candidatas: number;
  enviados: number;
  falhas: number;
  /** Já tinham linha gravada — a trava funcionando. */
  jaEnviados: number;
  detalhes: string[];
}

/** Meia-noite local, para contar dias inteiros e não frações. */
function meiaNoite(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Dias entre hoje e o vencimento. Positivo = ainda vai vencer; negativo = está
 * atrasado. Contado sobre a MEIA-NOITE dos dois lados: comparar horários faria
 * "vence hoje às 23h" contar como um dia inteiro de antecedência.
 */
export function diasParaVencer(vencimento: Date, hoje = new Date()): number {
  const ms = meiaNoite(vencimento).getTime() - meiaNoite(hoje).getTime();
  return Math.round(ms / 86_400_000);
}

/**
 * Qual lembrete a régua manda hoje para uma fatura que vence em `dias`?
 * `null` quando hoje não é dia de falar — que é a maioria dos dias.
 */
export function lembreteDeHoje(
  dias: number,
  cadencia: CadenciaCobranca,
): { tipo: TipoLembrete; dia: number } | null {
  // `dias >= 0`: o zero é o próprio dia do vencimento, e é um lembrete válido.
  // Não colide com atraso, que exige `-dias > 0`.
  if (dias >= 0 && cadencia.antesDias.includes(dias)) {
    return { tipo: "ANTES", dia: dias };
  }
  const atraso = -dias;
  if (atraso > 0 && cadencia.atrasoDias.includes(atraso)) {
    return { tipo: "ATRASO", dia: atraso };
  }
  return null;
}

/**
 * Roda a régua para o dia de hoje.
 *
 * O que NÃO recebe lembrete, e por quê:
 *   - status PAGO ou CANCELADO — cobrar quem já pagou é o pior erro possível
 *   - sem `asaasChargeId` nem parcelas — não há o que pagar
 *   - UC do módulo Brasil Solar — não é faturada pela Associação
 *   - sem o canal cadastrado — nada a fazer, e a tela já cobra o cadastro
 */
export async function dispararLembretesDoDia(
  hoje = new Date(),
): Promise<ResultadoLembretes> {
  const modo = modoNotificacao();
  const cadencia = await getCadenciaCobranca();
  const base: ResultadoLembretes = {
    modo,
    cadenciaAtiva: cadencia.ativos,
    candidatas: 0,
    enviados: 0,
    falhas: 0,
    jaEnviados: 0,
    detalhes: [],
  };

  if (!cadencia.ativos || modo === "off") return base;
  if (cadencia.antesDias.length === 0 && cadencia.atrasoDias.length === 0) return base;

  // Janela de busca: só o intervalo que a régua alcança. Sem isto a consulta
  // varreria as 1.429 cobranças a cada rodada para achar as poucas de hoje.
  const maiorAtraso = Math.max(0, ...cadencia.atrasoDias);
  const maiorAntes = Math.max(0, ...cadencia.antesDias);
  const de = new Date(meiaNoite(hoje).getTime() - maiorAtraso * 86_400_000);
  const ate = new Date(meiaNoite(hoje).getTime() + maiorAntes * 86_400_000);

  const abertas = await prisma.consumerUnitBilling.findMany({
    where: {
      status: { notIn: ["PAGO", "CANCELADO"] },
      dataVencimento: { gte: de, lte: ate },
      valorCobranca: { gt: 0 },
      consumerUnit: { active: true, ...SEM_UC_BRASIL_SOLAR },
    },
    include: { consumerUnit: { include: { consumer: true } } },
  });

  for (const b of abertas) {
    if (!b.dataVencimento) continue;
    if (!b.asaasChargeId && !b.installments) continue;

    const qual = lembreteDeHoje(diasParaVencer(b.dataVencimento, hoje), cadencia);
    if (!qual) continue;
    base.candidatas++;

    const uc = b.consumerUnit;
    const contato = montarContato(uc.id, uc.consumer);
    const dados: DadosLembrete = {
      clienteNome: uc.consumer?.name ?? uc.nome,
      codigoUc: uc.codigoUc,
      mes: b.mes,
      ano: b.ano,
      valor: b.valorCobranca ?? 0,
      vencimento: b.dataVencimento,
      link: b.tokenPublico ? linkPublicoDaFatura(b.tokenPublico) : b.asaasInvoiceUrl,
      tipo: qual.tipo,
      diasAtraso: qual.tipo === "ATRASO" ? qual.dia : 0,
    };

    if (cadencia.canais.email && contato.emails.length > 0) {
      await umLembrete(base, b.id, qual, "EMAIL", contato.emails.join("; "), modo, () =>
        enviarEmail({
          to: contato.emails[0],
          cc: contato.emails.slice(1),
          subject: assuntoLembrete(dados),
          html: htmlLembrete(dados),
          text: textoLembreteEmail(dados),
        }).then(() => undefined),
      );
    }

    if (cadencia.canais.whatsapp && contato.telefone) {
      const numero = contato.telefone;
      await umLembrete(
        base,
        b.id,
        qual,
        "WHATSAPP",
        formatarTelefone(numero),
        modo,
        () => enviarTextoWhatsapp(numero, textoLembreteWhatsapp(dados)).then(() => undefined),
      );
    }
  }

  return base;
}

/**
 * Um lembrete, num canal. A linha em `CobrancaLembrete` é criada ANTES do
 * envio: se o processo morrer no meio, a próxima rodada encontra a linha e não
 * repete. O preço é um lembrete eventualmente perdido — muito melhor do que um
 * duplicado, numa mensagem de cobrança.
 */
async function umLembrete(
  acc: ResultadoLembretes,
  billingId: string,
  qual: { tipo: TipoLembrete; dia: number },
  canal: CanalLembrete,
  destino: string,
  modo: string,
  enviar: () => Promise<void>,
): Promise<void> {
  const rotulo = `${qual.tipo.toLowerCase()} d${qual.dia} ${canal.toLowerCase()} → ${destino}`;

  if (modo === "simulacao") {
    // Simulação NÃO grava: gravar bloquearia o envio real de amanhã, quando o
    // modo virar `real` — e o cliente perderia o lembrete sem ninguém notar.
    acc.detalhes.push(`[simulado] ${rotulo}`);
    return;
  }

  const cfg = canal === "EMAIL" ? emailConfigurado() : uazapiConfigurado();
  if (!cfg.ok) {
    acc.falhas++;
    acc.detalhes.push(`[não configurado] ${rotulo}`);
    return;
  }

  try {
    await prisma.cobrancaLembrete.create({
      data: { billingId, tipo: qual.tipo, diaReferencia: qual.dia, canal },
    });
  } catch {
    // Violação do @@unique: já foi enviado. É a trava fazendo o trabalho dela.
    acc.jaEnviados++;
    return;
  }

  try {
    await enviar();
    await prisma.cobrancaLembrete.updateMany({
      where: { billingId, tipo: qual.tipo, diaReferencia: qual.dia, canal },
      data: { enviadoEm: new Date(), erro: null },
    });
    acc.enviados++;
    acc.detalhes.push(`[enviado] ${rotulo}`);
  } catch (err) {
    const erro = err instanceof Error ? err.message : String(err);
    await prisma.cobrancaLembrete.updateMany({
      where: { billingId, tipo: qual.tipo, diaReferencia: qual.dia, canal },
      data: { erro },
    });
    acc.falhas++;
    acc.detalhes.push(`[falhou] ${rotulo}: ${erro}`);
  }
}

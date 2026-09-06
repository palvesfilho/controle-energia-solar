/**
 * TRAVA DE CONTATO — UC sem email E telefone cadastrados não pode ser cobrada.
 *
 * 🔑 **Por que existe.** A partir de 05/09/2026 toda cobrança emitida dispara
 * um email (SMTP do Google) e uma mensagem de WhatsApp (Uazapi) para o cliente.
 * Emitir boleto para uma UC sem contato cadastrado produz o pior dos mundos: a
 * cobrança existe no Asaas, o dinheiro é esperado, e o cliente não é avisado
 * por canal nenhum — descobre quando o boleto vence. Antes disso o cadastro
 * incompleto não custava nada; agora custa a comunicação inteira.
 *
 * ⚠️ **O tamanho do buraco, medido em 05/09/2026:** das 117 UCs que já
 * compensaram (as únicas faturáveis, ver `uc-trava-faturamento.ts`), só 49
 * passam nesta trava. 67 não têm telefone, 34 não têm email, 33 não têm nem
 * `consumer` vinculado. Por isso a trava é chaveada por
 * `TRAVA_CONTATO_COBRANCA` (default `on`): enquanto o cadastro é preenchido,
 * dá para desligar e faturar, e a tela continua cobrando o preenchimento.
 *
 * Onde é aplicada (todos os caminhos que levam a dinheiro, igual à trava de
 * compensação):
 *   - `billing-asaas.ts` → `emitBillingToAsaas` — ponto único por onde passam a
 *     emissão avulsa, o lote e o pipeline do demonstrativo.
 *   - `emit-cobranca.ts` — pré-condição, para o motivo chegar inteiro ao
 *     operador antes de qualquer ida ao Asaas.
 *   - `validar-demonstrativo/route.ts` — recusa validar, um passo antes.
 *   - `GET /api/billing/consumer-units` — devolve `contato` para a tela
 *     desabilitar o botão em vez de deixar clicar e falhar.
 *
 * A guarda `scripts/verifica-trava-contato.ts` roda no build e quebra se algum
 * desses pontos perder a trava.
 */
import { prisma } from "@/lib/prisma";

/** Código de recusa devolvido em `skipped`, no mesmo formato de `no_value`. */
export const SKIP_SEM_CONTATO = "sem_contato";

/**
 * DDDs que existem no Brasil. Sem esta lista um telefone digitado errado
 * ("2199999999" com um dígito a menos) viraria um número plausível e a
 * mensagem sairia para um desconhecido.
 */
const DDDS_VALIDOS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

export type MotivoTelefone =
  | "vazio"
  | "curto_demais"
  | "longo_demais"
  | "ddd_invalido"
  | "telefone_fixo";

export interface TelefoneNormalizado {
  /** `55DD9XXXXXXXX` (13 dígitos) quando válido; null quando não dá para usar. */
  e164: string | null;
  motivo?: MotivoTelefone;
}

/**
 * Normaliza um telefone brasileiro para o formato que a Uazapi espera.
 *
 * 🪤 **O caso que morde.** No banco os números vêm em 10 ou 11 dígitos e SEM
 * DDI: `(55)99976-8597`, `5599161375`. Os de 10 dígitos são celulares antigos,
 * de antes do nono dígito (2016) — mandar do jeito que está entrega em número
 * errado ou em ninguém. Aqui o `9` é reinserido.
 *
 * 🚫 **Fixo é recusado de propósito.** Um número de 10 dígitos cujo assinante
 * começa em 2–5 é telefone fixo e não tem WhatsApp. Aceitar seria gravar
 * "enviado" para uma mensagem que nunca existiu.
 */
export function normalizarTelefoneBR(raw?: string | null): TelefoneNormalizado {
  const d = (raw ?? "").replace(/\D/g, "");
  if (!d) return { e164: null, motivo: "vazio" };

  let ddd: number;
  let assinante: string;

  if (d.length === 13 && d.startsWith("55")) {
    // Já em E.164 com o nono dígito: 55 + DD + 9XXXXXXXX
    ddd = Number(d.slice(2, 4));
    assinante = d.slice(4);
  } else if (d.length === 12 && d.startsWith("55")) {
    // E.164 sem o nono dígito: 55 + DD + XXXXXXXX
    ddd = Number(d.slice(2, 4));
    assinante = d.slice(4);
  } else if (d.length === 11) {
    // Formato nacional atual: DD + 9XXXXXXXX
    ddd = Number(d.slice(0, 2));
    assinante = d.slice(2);
  } else if (d.length === 10) {
    // Formato nacional antigo: DD + XXXXXXXX
    ddd = Number(d.slice(0, 2));
    assinante = d.slice(2);
  } else {
    return { e164: null, motivo: d.length < 10 ? "curto_demais" : "longo_demais" };
  }

  if (!DDDS_VALIDOS.has(ddd)) return { e164: null, motivo: "ddd_invalido" };

  if (assinante.length === 8) {
    // Celular antigo começa em 6/7/8/9 e ganha o nono dígito. Começando em
    // 2–5 é linha fixa — não existe WhatsApp ali.
    if (!/^[6-9]/.test(assinante)) return { e164: null, motivo: "telefone_fixo" };
    assinante = `9${assinante}`;
  }

  if (assinante.length !== 9) {
    return {
      e164: null,
      motivo: assinante.length < 9 ? "curto_demais" : "longo_demais",
    };
  }

  return { e164: `55${String(ddd).padStart(2, "0")}${assinante}` };
}

/** Formato de leitura humana — usado em tela e log, nunca para enviar. */
export function formatarTelefone(e164: string): string {
  const d = e164.replace(/\D/g, "");
  if (d.length !== 13) return e164;
  return `(${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
}

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/;

/**
 * Todos os endereços do cliente, em ordem: `Consumer.email` primeiro (é o `to`),
 * depois os de `Consumer.emailsRecebimento` (separados por `;`, entram em cópia).
 * Duplicatas e endereços malformados caem fora.
 */
export function emailsDoConsumer(
  consumer?: { email?: string | null; emailsRecebimento?: string | null } | null,
): string[] {
  if (!consumer) return [];
  const brutos = [
    ...(consumer.email ?? "").split(/[;,]/),
    ...(consumer.emailsRecebimento ?? "").split(/[;,]/),
  ];
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const b of brutos) {
    const e = b.trim().toLowerCase();
    if (!e || !EMAIL_RE.test(e) || vistos.has(e)) continue;
    vistos.add(e);
    out.push(e);
  }
  return out;
}

export interface ContatoUc {
  consumerUnitId: string;
  consumerId: string | null;
  /** Vazio quando não há nenhum endereço utilizável. */
  emails: string[];
  /** E.164 pronto para a Uazapi, ou null. */
  telefone: string | null;
  /** Como o número está no cadastro — o que o operador precisa procurar. */
  telefoneCadastrado: string | null;
  motivoTelefone?: MotivoTelefone;
  temEmail: boolean;
  temTelefone: boolean;
  /** Null quando está tudo certo. Frase pronta para toast e tooltip. */
  pendencia: string | null;
}

const ROTULO_MOTIVO: Record<MotivoTelefone, string> = {
  vazio: "sem telefone cadastrado",
  curto_demais: "telefone cadastrado tem dígitos de menos",
  longo_demais: "telefone cadastrado tem dígitos de mais",
  ddd_invalido: "telefone cadastrado tem DDD inexistente",
  telefone_fixo: "telefone cadastrado é fixo e não recebe WhatsApp",
};

/**
 * Monta o contato a partir do que já foi carregado do banco. Separada da
 * consulta de propósito: `emitBillingToAsaas` já tem o `consumer` em mãos e não
 * precisa de mais uma ida ao banco.
 */
export function montarContato(
  consumerUnitId: string,
  consumer?: {
    id: string;
    email?: string | null;
    emailsRecebimento?: string | null;
    phone?: string | null;
  } | null,
): ContatoUc {
  const emails = emailsDoConsumer(consumer);
  const tel = normalizarTelefoneBR(consumer?.phone);

  const faltas: string[] = [];
  if (!consumer) {
    faltas.push("a UC não tem cliente vinculado");
  } else {
    if (emails.length === 0) faltas.push("sem email cadastrado");
    if (!tel.e164) faltas.push(ROTULO_MOTIVO[tel.motivo ?? "vazio"]);
  }

  return {
    consumerUnitId,
    consumerId: consumer?.id ?? null,
    emails,
    telefone: tel.e164,
    telefoneCadastrado: consumer?.phone?.trim() || null,
    motivoTelefone: tel.motivo,
    temEmail: emails.length > 0,
    temTelefone: !!tel.e164,
    pendencia: faltas.length > 0 ? faltas.join(" e ") : null,
  };
}

/** Frase única da recusa — API, toast e tooltip dizem a mesma coisa. */
export function mensagemSemContato(contato: ContatoUc): string {
  return (
    `Cadastro de contato incompleto (${contato.pendencia}). ` +
    "Toda cobrança emitida envia email e WhatsApp ao cliente — sem os dois " +
    "canais a cobrança sairia sem ninguém ser avisado. Preencha email e " +
    "celular no cadastro do cliente e emita de novo."
  );
}

/** A trava está ligada? `TRAVA_CONTATO_COBRANCA=off` desliga. */
export function travaContatoAtiva(): boolean {
  return (process.env.TRAVA_CONTATO_COBRANCA ?? "on").toLowerCase() !== "off";
}

export interface ResultadoTravaContato {
  liberado: boolean;
  contato: ContatoUc;
  /** Preenchido só quando `liberado` é false. */
  motivo?: string;
}

/** Aplica a régua (e a chave de desligar) a um contato já montado. */
export function avaliarContato(contato: ContatoUc): ResultadoTravaContato {
  if (!contato.pendencia) return { liberado: true, contato };
  if (!travaContatoAtiva()) return { liberado: true, contato };
  return { liberado: false, contato, motivo: mensagemSemContato(contato) };
}

/** Contato de uma UC, buscando no banco. */
export async function contatoDaUc(consumerUnitId: string): Promise<ContatoUc> {
  const uc = await prisma.consumerUnit.findUnique({
    where: { id: consumerUnitId },
    select: {
      id: true,
      consumer: {
        select: { id: true, email: true, emailsRecebimento: true, phone: true },
      },
    },
  });
  return montarContato(consumerUnitId, uc?.consumer ?? null);
}

/**
 * Versão em lote — uma consulta para N UCs.
 *
 * A tela do mês carrega ~110 UCs; perguntar uma a uma seriam 110 idas ao banco
 * só para pintar a coluna de ações. Mesmo motivo de `ucsQueJaCompensaram`.
 */
export async function contatosDasUcs(
  ids: string[],
): Promise<Map<string, ContatoUc>> {
  const out = new Map<string, ContatoUc>();
  if (ids.length === 0) return out;
  // origem-ok: busca por ids EXPLÍCITOS que o chamador já recortou (a tela de
  // faturamento aplica SEM_UC_BRASIL_SOLAR antes de montar a lista). Filtrar de
  // novo aqui só esconderia contato de UC que o chamador quis perguntar.
  const ucs = await prisma.consumerUnit.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      consumer: {
        select: { id: true, email: true, emailsRecebimento: true, phone: true },
      },
    },
  });
  for (const uc of ucs) out.set(uc.id, montarContato(uc.id, uc.consumer));
  return out;
}

/**
 * Trava a partir do id do `ConsumerUnitBilling` — a forma como as rotas de
 * faturamento conhecem a cobrança. `null` quando a cobrança não existe.
 */
export async function travaContatoPorBilling(
  billingId: string,
): Promise<ResultadoTravaContato | null> {
  const billing = await prisma.consumerUnitBilling.findUnique({
    where: { id: billingId },
    select: { consumerUnitId: true },
  });
  if (!billing) return null;
  return avaliarContato(await contatoDaUc(billing.consumerUnitId));
}

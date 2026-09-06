/**
 * QUEM recebe um comunicado — os dois públicos da Associação e o recorte deles.
 *
 * 🪤 **Não confundir com `mensagens-publico.ts`.** Aquele é o módulo Mensagens
 * da Rede Brasil Solar: público de proprietário BS, canal push. Aqui são os
 * dois públicos da Associação de Energia, por email e WhatsApp:
 *
 *   INVESTIDOR        dono de usina de investimento (`Investor`)
 *   CLIENTE_DESCONTO  quem recebe desconto na fatura (`ConsumerUnit` com
 *                     `percentCompensado > 0`, fora do mundo Brasil Solar)
 *
 * 🔑 **A unidade do envio é a PESSOA, não a UC.** Metade dos descontistas tem
 * mais de uma unidade — a Beltrame tem três no mesmo telefone. Mandar por UC
 * faria o mesmo cliente receber a mesma mensagem três vezes; por isso as UCs
 * são agrupadas por `consumerId` e a variável `{{unidades}}` lista todas.
 *
 * ⚠️ O filtro é sempre um RECORTE, nunca uma lista salva de nomes: comunicado
 * escrito hoje e disparado amanhã tem de pegar quem entrou no meio e não pode
 * pegar quem saiu. A lista só vira concreta no disparo, e aí congela em
 * `ComunicadoEnvio`.
 */
import { prisma } from "@/lib/prisma";
import { montarContato } from "@/lib/uc-trava-contato";
import { isOrigemBrasilSolar } from "@/lib/uc-origem";
import { formatCodigoUc } from "@/lib/uc-codigo";
import { ucsQueJaCompensaram } from "@/lib/uc-trava-faturamento";

export const PUBLICOS = ["INVESTIDOR", "CLIENTE_DESCONTO"] as const;
export type PublicoComunicado = (typeof PUBLICOS)[number];

export const PUBLICO_LABEL: Record<PublicoComunicado, string> = {
  INVESTIDOR: "Investidores (donos de usina)",
  CLIENTE_DESCONTO: "Clientes com desconto na fatura",
};

/**
 * Recorte do público. Todo campo é opcional e todos se somam com E.
 * Filtro vazio = todo mundo do público.
 */
export interface FiltroComunicado {
  /** Cidades (do cadastro do cliente ou do investidor). */
  cidades?: string[];
  /** Só quem tem WhatsApp válido / só quem tem email. */
  somenteComWhatsapp?: boolean;
  somenteComEmail?: boolean;
  /** INVESTIDOR: com usina vinculada × sem nenhuma. */
  investidorComUsina?: boolean;
  /**
   * CLIENTE_DESCONTO: só quem já compensou (está faturando) ou só quem ainda
   * está em implantação. Ausente = os dois.
   *
   * 🔑 A distinção importa no texto: avisar reajuste de tarifa para quem ainda
   * não recebeu crédito nenhum gera a pergunta "reajuste do quê?".
   */
  situacao?: "FATURANDO" | "EM_IMPLANTACAO";
  /** CLIENTE_DESCONTO: usinas geradoras cujas UCs devem entrar. */
  plantIds?: string[];
}

/** Uma pessoa alcançável, já com os contatos resolvidos. */
export interface Destinatario {
  tipo: PublicoComunicado;
  id: string;
  nome: string;
  /** Todos os endereços; o primeiro é o principal, os demais vão em cópia. */
  emails: string[];
  /** E.164, ou null quando não há telefone utilizável. */
  telefone: string | null;
  cidade: string | null;
  /** UCs (descontista) ou usinas (investidor) — alimenta `{{unidades}}`. */
  unidades: string[];
}

// ─────────────────────────────────────────────────────────────── Investidores

async function investidores(): Promise<Destinatario[]> {
  const linhas = await prisma.investor.findMany({
    select: {
      id: true,
      phone: true,
      cidade: true,
      nomeEmpresa: true,
      additionalEmails: true,
      user: { select: { name: true, email: true } },
      plants: { select: { plant: { select: { name: true } } } },
    },
  });

  return linhas.map((i) => {
    // 🔑 O email do investidor mora no `User`, não no `Investor` — ele entra no
    // sistema, diferente do descontista. Os adicionais (sócio, financeiro) vêm
    // do JSON `additionalEmails` e vão em cópia.
    const principais = [i.user?.email, ...lerEmailsExtras(i.additionalEmails)]
      .map((e) => (e ?? "").trim())
      .filter(emailUtilizavel);

    return {
      tipo: "INVESTIDOR" as const,
      id: i.id,
      nome: i.nomeEmpresa?.trim() || i.user?.name?.trim() || "(sem nome)",
      emails: [...new Set(principais)],
      telefone: normalizarTelefone(i.phone),
      cidade: i.cidade?.trim() || null,
      unidades: i.plants.map((p) => p.plant?.name ?? "").filter(Boolean),
    };
  });
}

/**
 * O endereço serve para MANDAR de verdade?
 *
 * 🚨 **11 dos 19 investidores têm email inventado** — `fulano@sem-email.dommo.local`,
 * gerado na importação das usinas Dommo para dar um `User` a quem não tinha
 * email. Eles passam em qualquer validação de formato: têm `@`, têm domínio,
 * têm ponto. Só não existem.
 *
 * Descoberto em 06/09/2026 rodando o resolvedor contra produção, ANTES do
 * primeiro disparo. Se tivesse passado, o primeiro comunicado sairia com 11
 * bounces de uma vez — e reputação de remetente se perde muito mais rápido do
 * que se constrói, ainda mais num domínio configurado há um dia.
 *
 * `.local` é reservado para rede interna (RFC 6762) e nunca resolve na
 * internet; `.invalid`, `.test` e `.example` são reservados pela RFC 2606.
 * Nenhum deles pode receber email, hoje ou nunca.
 */
export function emailUtilizavel(email: string): boolean {
  const e = email.trim().toLowerCase();
  if (!e.includes("@") || e.startsWith("@") || e.endsWith("@")) return false;
  const dominio = e.split("@").pop() ?? "";
  if (!dominio.includes(".")) return false;
  return !/\.(local|invalid|test|example|localhost)$/.test(dominio);
}

/** `additionalEmails` é um array JSON de strings; texto solto também é aceito. */
function lerEmailsExtras(bruto: string | null): string[] {
  if (!bruto?.trim()) return [];
  try {
    const v = JSON.parse(bruto);
    if (Array.isArray(v)) return v.map((x) => String(x));
  } catch {
    /* não era JSON — cai no split abaixo */
  }
  return bruto.split(/[;,]/).map((s) => s.trim());
}

/**
 * 🪤 Reaproveita a normalização da COBRANÇA em vez de escrever outra.
 * `montarContato` já sabe descartar telefone fixo, número sem o nono dígito e
 * o que mais aparece no cadastro; um segundo normalizador aqui divergiria do
 * que a fatura considera alcançável, e aí a mesma pessoa seria "tem WhatsApp"
 * numa tela e "não tem" na outra.
 */
function normalizarTelefone(phone: string | null): string | null {
  return montarContato("", { id: "", phone }).telefone;
}

// ──────────────────────────────────────────────────── Clientes com desconto

async function clientesComDesconto(filtro: FiltroComunicado): Promise<Destinatario[]> {
  const ucs = await prisma.consumerUnit.findMany({
    where: {
      active: true,
      percentCompensado: { gt: 0 },
      ...(filtro.plantIds?.length ? { plantId: { in: filtro.plantIds } } : {}),
    },
    select: {
      id: true,
      codigoUc: true,
      origem: true,
      cidade: true,
      consumer: {
        select: {
          id: true,
          name: true,
          email: true,
          emailsRecebimento: true,
          phone: true,
        },
      },
    },
  });

  // ⚠️ UC do módulo Brasil Solar não é cliente da Associação. É a mesma regra
  // que a cobrança aplica, e o motivo é o mesmo: são duas relações comerciais
  // diferentes, com ofertas diferentes.
  const daAssociacao = ucs.filter((u) => !isOrigemBrasilSolar(u.origem) && u.consumer);

  // 🔑 "Está faturando" = já teve fatura da distribuidora COM compensação, e
  // quem sabe isso é `uc-trava-faturamento.ts`. Escrever a regra de novo aqui
  // faria a mesma UC aparecer como "em implantação" nesta tela e "faturando"
  // na de cobrança, e ninguém saberia qual das duas mente.
  const compensaram = await ucsQueJaCompensaram(daAssociacao.map((u) => u.id));

  const porPessoa = new Map<string, Destinatario & { jaCompensou: boolean }>();
  for (const u of daAssociacao) {
    const c = u.consumer!;
    const contato = montarContato(u.id, c);
    const existente = porPessoa.get(c.id);
    const rotuloUc = formatCodigoUc(u.codigoUc);

    if (existente) {
      existente.unidades.push(rotuloUc);
      // Basta UMA unidade já compensando para a pessoa contar como faturando.
      existente.jaCompensou ||= compensaram.has(u.id);
      continue;
    }
    porPessoa.set(c.id, {
      tipo: "CLIENTE_DESCONTO",
      id: c.id,
      nome: c.name,
      // O mesmo crivo do investidor: `montarContato` valida FORMATO, não
      // existência. Hoje nenhum consumidor tem endereço inventado, mas a regra
      // vale para os dois públicos ou não vale para nenhum.
      emails: contato.emails.filter(emailUtilizavel),
      telefone: contato.telefone,
      cidade: u.cidade?.trim() || null,
      unidades: [rotuloUc],
      jaCompensou: compensaram.has(u.id),
    });
  }

  let lista = [...porPessoa.values()];
  if (filtro.situacao === "FATURANDO") lista = lista.filter((d) => d.jaCompensou);
  if (filtro.situacao === "EM_IMPLANTACAO") lista = lista.filter((d) => !d.jaCompensou);
  return lista.map(({ jaCompensou: _ignorado, ...d }) => d);
}

// ──────────────────────────────────────────────────────────────── A resolução

/** A lista concreta de quem receberia este comunicado, agora. */
export async function resolverPublico(
  publico: PublicoComunicado,
  filtro: FiltroComunicado = {},
): Promise<Destinatario[]> {
  let lista =
    publico === "INVESTIDOR" ? await investidores() : await clientesComDesconto(filtro);

  if (publico === "INVESTIDOR" && filtro.investidorComUsina !== undefined) {
    lista = lista.filter((d) => (d.unidades.length > 0) === filtro.investidorComUsina);
  }
  if (filtro.cidades?.length) {
    const alvo = new Set(filtro.cidades.map((c) => c.trim().toLowerCase()));
    lista = lista.filter((d) => d.cidade && alvo.has(d.cidade.toLowerCase()));
  }
  if (filtro.somenteComEmail) lista = lista.filter((d) => d.emails.length > 0);
  if (filtro.somenteComWhatsapp) lista = lista.filter((d) => !!d.telefone);

  return lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/**
 * As cidades que existem no público, para a tela oferecer o filtro.
 *
 * 🪤 Deduplica ignorando a CAIXA. O cadastro tem "SANTA MARIA" e "Santa Maria",
 * "MARIANO MORO" e "Mariano Moro" — sem isto a tela ofereceria a mesma cidade
 * duas vezes e quem marcasse uma perderia metade do público.
 */
export async function cidadesDoPublico(publico: PublicoComunicado): Promise<string[]> {
  const lista = await resolverPublico(publico);
  const vistas = new Map<string, string>();
  for (const d of lista) {
    if (!d.cidade) continue;
    const chave = d.cidade.toLowerCase();
    // Fica a grafia mais "escrita à mão" — a que não é toda em maiúsculas.
    const atual = vistas.get(chave);
    if (!atual || (atual === atual.toUpperCase() && d.cidade !== d.cidade.toUpperCase())) {
      vistas.set(chave, d.cidade);
    }
  }
  return [...vistas.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/** A frase do recorte, para a tela e para o log dizerem a mesma coisa. */
export function descreverPublico(publico: PublicoComunicado, f: FiltroComunicado): string {
  const partes: string[] = [PUBLICO_LABEL[publico]];
  if (f.situacao === "FATURANDO") partes.push("já faturando");
  if (f.situacao === "EM_IMPLANTACAO") partes.push("em implantação");
  if (f.investidorComUsina === true) partes.push("com usina");
  if (f.investidorComUsina === false) partes.push("sem usina");
  if (f.plantIds?.length) partes.push(`${f.plantIds.length} usina(s) geradora(s)`);
  if (f.cidades?.length) partes.push(f.cidades.join(", "));
  if (f.somenteComEmail) partes.push("com email");
  if (f.somenteComWhatsapp) partes.push("com WhatsApp");
  return partes.join(" · ");
}

/** Quantos seriam alcançados por cada canal — o número que a tela mostra. */
export function contarAlcance(lista: Destinatario[]): {
  total: number;
  comEmail: number;
  comWhatsapp: number;
  semNenhum: number;
} {
  return {
    total: lista.length,
    comEmail: lista.filter((d) => d.emails.length > 0).length,
    comWhatsapp: lista.filter((d) => !!d.telefone).length,
    semNenhum: lista.filter((d) => d.emails.length === 0 && !d.telefone).length,
  };
}

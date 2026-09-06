/**
 * GET/POST /api/admin/comunicados — a lista e a criação.
 *
 * Comunicado é mensagem em massa para cliente real. Por isso a permissão é a
 * mesma trinca que escreve os textos de cobrança: quem manda isto fala em nome
 * da empresa para a carteira inteira, de uma vez só.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { PUBLICOS, descreverPublico, type PublicoComunicado } from "@/lib/comunicados-publico";
import {
  variaveisDesconhecidas,
  TIPOS,
  DESENHOS,
  DESENHO_LABEL,
  type TipoComunicado,
  type DesenhoComunicado,
} from "@/lib/comunicados-textos";
import { modoComunicado } from "@/lib/comunicados-envio";

export function autorizado(role: string | undefined): boolean {
  return canAccessSection(role ?? "", "comunicados");
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !autorizado(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const comunicados = await prisma.comunicado.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true, nome: true, publico: true, publicoResumo: true, canais: true,
      status: true, simulacao: true, totalDestinatarios: true, tipo: true, desenho: true,
      enviadoEm: true, createdAt: true, criadoPorNome: true,
      _count: { select: { envios: true } },
    },
  });

  return NextResponse.json({ comunicados, modo: modoComunicado() });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !autorizado(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const erro = validar(body);
  if (erro) return NextResponse.json({ error: erro }, { status: 400 });

  const publico = body.publico as PublicoComunicado;
  const filtro = (body.publicoFiltro ?? {}) as Record<string, unknown>;

  const criado = await prisma.comunicado.create({
    data: {
      nome: String(body.nome).trim(),
      publico,
      publicoFiltro: filtro as never,
      publicoResumo: descreverPublico(publico, filtro),
      canais: canaisDe(body.canais),
      tipo: tipoDe(body.tipo),
      ...desenhoEExtras(body),
      assunto: String(body.assunto).trim(),
      corpoEmail: String(body.corpoEmail).trim(),
      corpoWhatsapp: String(body.corpoWhatsapp).trim(),
      criadoPorId: session.user.id ?? null,
      criadoPorNome: session.user.name ?? session.user.email ?? null,
    },
    select: { id: true },
  });

  return NextResponse.json({ id: criado.id });
}

/**
 * O tipo, com INFORMATIVO como rede. Valor estranho vindo da tela não pode
 * virar um email sem cor nenhuma nem derrubar a criação.
 */
export function tipoDe(v: unknown): TipoComunicado {
  const t = String(v ?? "").toUpperCase();
  return (TIPOS as readonly string[]).includes(t) ? (t as TipoComunicado) : "INFORMATIVO";
}

export function desenhoDe(v: unknown): DesenhoComunicado {
  const d = String(v ?? "").toUpperCase();
  return (DESENHOS as readonly string[]).includes(d) ? (d as DesenhoComunicado) : "PADRAO";
}

/**
 * O desenho e os campos que só ele usa.
 *
 * 🔑 **Os extras são ZERADOS quando o desenho não os usa.** Trocar de "número
 * em destaque" para "carta" e deixar o valor gravado faria a cifra voltar a
 * aparecer se alguém trocasse de volta meses depois, sem lembrar que ela estava
 * lá. O que a tela não mostra não pode ficar guardado em silêncio.
 */
function desenhoEExtras(body: Record<string, unknown>) {
  const desenho = desenhoDe(body.desenho);
  const t = (k: string) => {
    const v = String(body[k] ?? "").trim();
    return v || null;
  };
  return {
    desenho,
    destaqueRotulo: desenho === "DESTAQUE" ? t("destaqueRotulo") : null,
    destaqueValor: desenho === "DESTAQUE" ? t("destaqueValor") : null,
    destaqueNota: desenho === "DESTAQUE" ? t("destaqueNota") : null,
    botaoTexto: desenho === "BOTAO" ? t("botaoTexto") : null,
    botaoUrl: desenho === "BOTAO" ? t("botaoUrl") : null,
    botaoNota: desenho === "BOTAO" ? t("botaoNota") : null,
  };
}

export { desenhoEExtras };

export function canaisDe(v: unknown): string {
  const lista = Array.isArray(v) ? v.map(String) : String(v ?? "").split(",");
  const limpos = lista.map((c) => c.trim().toUpperCase()).filter((c) => c === "EMAIL" || c === "WHATSAPP");
  return [...new Set(limpos)].join(",") || "EMAIL";
}

/**
 * 🔒 A validação que impede um comunicado de nascer quebrado.
 *
 * Corpo vazio manda mensagem muda para 75 pessoas; variável inventada manda
 * `{{fulano}}` escrito no meio da frase. As duas coisas só têm conserto ANTES
 * do disparo — depois é pedir desculpa para a lista inteira.
 */
export function validar(body: Record<string, unknown>): string | null {
  const publico = body.publico as PublicoComunicado;
  if (!PUBLICOS.includes(publico)) return "Escolha o público.";
  if (!String(body.nome ?? "").trim()) return "Dê um nome ao comunicado (só você vê).";

  const canais = canaisDe(body.canais);
  if (!canais) return "Escolha ao menos um canal.";

  // 🔒 Desenho que promete um elemento e não o tem sai pior do que o padrão:
  // "Número em destaque" sem número é uma caixa vazia, e botão sem link é um
  // convite a clicar em nada. Recusar aqui é a única chance — depois do
  // disparo, o email já está na caixa de 75 pessoas.
  const desenho = desenhoDe(body.desenho);
  if (canais.includes("EMAIL")) {
    if (desenho === "DESTAQUE" && !String(body.destaqueValor ?? "").trim()) {
      return `O desenho "${DESENHO_LABEL.DESTAQUE}" precisa do valor em destaque (ex.: +8,4%).`;
    }
    if (desenho === "BOTAO") {
      const texto = String(body.botaoTexto ?? "").trim();
      const url = String(body.botaoUrl ?? "").trim();
      if (!texto || !url) {
        return `O desenho "${DESENHO_LABEL.BOTAO}" precisa do texto e do link do botão.`;
      }
      // 🔒 `javascript:` num href montado com texto do operador é a porta
      // óbvia, e o email já saiu quando alguém percebe.
      if (!/^https?:\/\//i.test(url)) {
        return "O link do botão precisa começar com http:// ou https://.";
      }
    }
  }

  const campos: [string, string][] = [
    ["assunto", "assunto do email"],
    ["corpoEmail", "texto do email"],
    ["corpoWhatsapp", "texto do WhatsApp"],
  ];
  for (const [campo, rotulo] of campos) {
    // O corpo do canal não escolhido não precisa existir — mas se existir,
    // precisa ser válido: o operador pode ligar o canal depois.
    const valor = String(body[campo] ?? "").trim();
    const precisa =
      campo === "corpoWhatsapp" ? canais.includes("WHATSAPP") : canais.includes("EMAIL");
    if (!valor) {
      if (precisa) return `O ${rotulo} está vazio.`;
      continue;
    }
    const ruins = variaveisDesconhecidas(valor, publico);
    if (ruins.length > 0) {
      return `No ${rotulo} há variável que não existe: ${ruins.map((r) => `{{${r}}}`).join(", ")}.`;
    }
  }
  return null;
}

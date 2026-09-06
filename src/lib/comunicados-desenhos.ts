/**
 * OS DESENHOS do email do comunicado — a estrutura, não a cor.
 *
 * São dois eixos, e confundi-los é o erro fácil aqui:
 *
 *   `desenho`  ONDE as coisas ficam (marca no topo? na lateral? botão? cifra?)
 *   `tipo`     COM QUE FORÇA (informativo, atenção, urgente — cor e selo)
 *
 * Os dois se combinam. A exceção é `CARTA`, que **ignora o peso de propósito**:
 * o desenho existe justamente para não ter cor, e uma carta urgente vermelha é
 * uma contradição. A tela avisa quando essa combinação é escolhida.
 *
 * 🔑 **A moldura é a mesma em todos**: mesma largura, mesmo logotipo, mesmo
 * rodapé de contato. O que muda é a arrumação. Quem recebe precisa reconhecer o
 * remetente antes de reparar no arranjo — email que muda de cara inteira a cada
 * envio parece de outra empresa.
 *
 * ⚠️ **HTML de email não é HTML de página.** Nada de flexbox, grid ou CSS
 * externo: cliente de email ignora os três. As colunas saem em `<table>`, o
 * estilo é inline, e é por isso que estes trechos parecem antiquados.
 */
import { descricaoNegocio, emailSuporte, nomeRemetente } from "@/lib/identidade-remetente";
import { logoEmpresaUrl } from "@/lib/logo-empresa";
import { escapeHtml, paragrafosHtml } from "@/lib/texto-variaveis";

export const DESENHOS = [
  "PADRAO",
  "TIMBRE_LATERAL",
  "CABECALHO_SOLIDO",
  "CARTA",
  "DESTAQUE",
  "BOTAO",
  "AVISO_CURTO",
] as const;
export type DesenhoComunicado = (typeof DESENHOS)[number];

export const DESENHO_LABEL: Record<DesenhoComunicado, string> = {
  PADRAO: "Padrão",
  TIMBRE_LATERAL: "Timbre lateral",
  CABECALHO_SOLIDO: "Cabeçalho sólido",
  CARTA: "Carta",
  DESTAQUE: "Número em destaque",
  BOTAO: "Com um botão",
  AVISO_CURTO: "Aviso curto",
};

export const DESENHO_QUANDO: Record<DesenhoComunicado, string> = {
  PADRAO: "Faixa da marca no topo. Serve para quase tudo.",
  TIMBRE_LATERAL: "A cor vira barra de canto. Mais discreto.",
  CABECALHO_SOLIDO: "Bloco de cor cheio, marca e título dentro.",
  CARTA: "Sem cor, serifada, assinada. Assunto delicado.",
  DESTAQUE: "Quando uma cifra é a notícia.",
  BOTAO: "Quando o cliente precisa FAZER algo.",
  AVISO_CURTO: "Um recado de uma frase, lido sem rolar.",
};

/** Os desenhos que exigem campo além de assunto e texto. */
export const DESENHO_EXIGE: Partial<Record<DesenhoComunicado, string>> = {
  DESTAQUE: "Precisa do valor em destaque (ex.: +8,4%).",
  BOTAO: "Precisa do texto e do link do botão.",
};

/** 🪤 O único que ignora o peso. Ver o cabeçalho deste arquivo. */
export function desenhoIgnoraPeso(d: DesenhoComunicado): boolean {
  return d === "CARTA";
}

// ─────────────────────────────────────────────────────────────── As cores

export type TipoComunicado = "INFORMATIVO" | "ATENCAO" | "URGENTE";

interface Peso {
  faixa: string;
  solido: string;
  titulo: string;
  selo: string | null;
  seloFundo: string;
  seloTexto: string;
  caixaFundo: string;
  caixaTexto: string;
  caixaRotulo: string;
}

const PESO: Record<TipoComunicado, Peso> = {
  INFORMATIVO: {
    faixa: "linear-gradient(90deg,#1B5E54 0%,#3BAE99 50%,#EA6E2C 100%)",
    solido: "#1B5E54",
    titulo: "#1B5E54",
    selo: null,
    seloFundo: "",
    seloTexto: "",
    caixaFundo: "#FCE5D5",
    caixaTexto: "#7A3A14",
    caixaRotulo: "#A85427",
  },
  ATENCAO: {
    faixa: "#F0A100",
    solido: "#B47500",
    titulo: "#7A4E00",
    selo: "ATENÇÃO",
    seloFundo: "#FEF3C7",
    seloTexto: "#92400E",
    caixaFundo: "#FEF3C7",
    caixaTexto: "#7A4E00",
    caixaRotulo: "#92400E",
  },
  URGENTE: {
    faixa: "#C62828",
    solido: "#9B1C1C",
    titulo: "#8E1B1B",
    selo: "URGENTE",
    seloFundo: "#FEE2E2",
    seloTexto: "#991B1B",
    caixaFundo: "#FEE2E2",
    caixaTexto: "#7F1D1D",
    caixaRotulo: "#991B1B",
  },
};

// ────────────────────────────────────────────────────────── Peças comuns

const ESTILO_P = "font-size:15px;line-height:1.6;color:#374151;margin:0 0 16px";

/** O que o desenho DESTAQUE e o BOTAO acrescentam. */
export interface ExtrasComunicado {
  destaqueRotulo?: string | null;
  destaqueValor?: string | null;
  destaqueNota?: string | null;
  botaoTexto?: string | null;
  botaoUrl?: string | null;
  botaoNota?: string | null;
}

function marca(largura: number, margem = "0 0 16px"): string {
  const url = logoEmpresaUrl();
  if (!url) return "";
  return `<img src="${url}" alt="${nomeRemetente()}" width="${largura}" style="display:block;width:${largura}px;max-width:60%;height:auto;margin:${margem}">`;
}

function seloDe(p: Peso): string {
  if (!p.selo) return "";
  return `<div style="display:inline-block;background:${p.seloFundo};color:${p.seloTexto};font-size:11px;font-weight:700;letter-spacing:1px;padding:4px 10px;border-radius:999px;margin:0 0 10px">${p.selo}</div>`;
}

function rodape(): string {
  return `<p style="font-size:12px;color:#6b7280;margin:22px 0 0;border-top:1px solid #e5e7eb;padding-top:14px">
      Dúvidas? Responda este email ou escreva para <a href="mailto:${emailSuporte()}" style="color:#1B5E54">${emailSuporte()}</a>.
    </p>`;
}

function assinaturaExterna(): string {
  return `<p style="text-align:center;font-size:11px;color:#9ca3af;margin:12px 16px 24px">
    ${nomeRemetente()} · ${descricaoNegocio()}
  </p>`;
}

function documento(corpo: string, fundo = "#f3f4f6", titulo = ""): string {
  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>${escapeHtml(titulo)}</title></head>
<body style="margin:0;padding:0;background:${fundo};font-family:Helvetica,Arial,sans-serif;color:#111827">
${corpo}
</body>
</html>`;
}

/**
 * A caixa da cifra. Vazia quando não há valor — e aí o bloco inteiro some, em
 * vez de sair um retângulo colorido sem nada dentro.
 */
function caixaDestaque(p: Peso, e: ExtrasComunicado): string {
  if (!e.destaqueValor?.trim()) return "";
  const rotulo = e.destaqueRotulo?.trim()
    ? `<div style="font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:${p.caixaRotulo};font-weight:700">${escapeHtml(e.destaqueRotulo)}</div>`
    : "";
  const nota = e.destaqueNota?.trim()
    ? `<div style="font-size:12px;color:${p.caixaTexto};margin-top:4px">${escapeHtml(e.destaqueNota)}</div>`
    : "";
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px"><tr>
      <td style="background:${p.caixaFundo};border-radius:8px;padding:18px 20px">
        ${rotulo}
        <div style="font-size:34px;font-weight:700;color:${p.caixaTexto};line-height:1.05;margin-top:6px">${escapeHtml(e.destaqueValor)}</div>
        ${nota}
      </td>
    </tr></table>`;
}

/**
 * O botão.
 *
 * 🔒 O `href` é escapado e a rota já recusa o que não for http(s). Um link
 * montado com texto do operador é a porta óbvia para `javascript:` — e o email
 * já saiu quando alguém percebe.
 */
function botao(e: ExtrasComunicado): string {
  if (!e.botaoTexto?.trim() || !e.botaoUrl?.trim()) return "";
  const nota = e.botaoNota?.trim()
    ? `<p style="font-size:12.5px;color:#6b7280;margin:0 0 4px">${escapeHtml(e.botaoNota)}</p>`
    : "";
  // O botão fica TEAL mesmo no urgente: vermelho num botão lê-se como
  // "cancelar", e o que se quer é que a pessoa clique.
  return `<table cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 8px"><tr>
      <td style="background:#1B5E54;border-radius:6px">
        <a href="${escapeHtml(e.botaoUrl)}" style="display:inline-block;padding:14px 26px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600">${escapeHtml(e.botaoTexto)}</a>
      </td>
    </tr></table>
    ${nota}`;
}

// ─────────────────────────────────────────────────────── Os sete desenhos

/**
 * Monta o email. `desenho` desconhecido cai em PADRAO e `tipo` desconhecido em
 * INFORMATIVO — um valor inesperado no banco não pode derrubar um disparo no
 * meio de 75 mensagens.
 */
export function htmlComunicado(
  assunto: string,
  corpo: string,
  tipo: TipoComunicado = "INFORMATIVO",
  desenho: DesenhoComunicado = "PADRAO",
  extras: ExtrasComunicado = {},
): string {
  const p = PESO[tipo] ?? PESO.INFORMATIVO;
  const d = DESENHOS.includes(desenho) ? desenho : "PADRAO";
  const t = escapeHtml(assunto);
  const texto = paragrafosHtml(corpo, ESTILO_P);

  if (d === "TIMBRE_LATERAL") {
    return documento(
      `<div style="max-width:560px;margin:24px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.05)">
    <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td width="8" style="background:${p.solido}"></td>
      <td style="padding:28px 32px">
        ${marca(120, "0 0 18px")}
        ${seloDe(p)}
        <h1 style="font-size:19px;font-weight:700;color:${p.titulo};margin:0 0 16px">${t}</h1>
        ${texto}
        ${rodape()}
      </td>
    </tr></table>
  </div>
  ${assinaturaExterna()}`,
      "#f3f4f6",
      assunto,
    );
  }

  if (d === "CABECALHO_SOLIDO") {
    // 🪤 O logotipo vai sobre fundo BRANCO dentro do bloco colorido. Um PNG
    // colorido sobre teal escuro fica ilegível, e muitos clientes de email
    // bloqueiam imagem — aí sobraria um bloco de cor vazio.
    const url = logoEmpresaUrl();
    const logo = url
      ? `<img src="${url}" alt="${nomeRemetente()}" width="112" style="display:block;width:112px;height:auto;margin:0 0 14px;background:#ffffff;padding:8px 10px;border-radius:4px">`
      : `<div style="color:#ffffff;font-size:15px;font-weight:700;margin:0 0 14px">${nomeRemetente()}</div>`;
    return documento(
      `<div style="max-width:560px;margin:24px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.05)">
    <div style="background:${p.solido};padding:26px 32px">
      ${logo}
      <div style="color:rgba(255,255,255,0.75);font-size:11px;letter-spacing:1.4px;text-transform:uppercase;margin:0 0 6px">${p.selo ?? "Comunicado"}</div>
      <h1 style="font-size:21px;font-weight:700;color:#ffffff;margin:0;line-height:1.25">${t}</h1>
    </div>
    <div style="padding:26px 32px">
      ${texto}
      ${rodape()}
    </div>
  </div>
  ${assinaturaExterna()}`,
      "#f3f4f6",
      assunto,
    );
  }

  if (d === "CARTA") {
    // Ignora o peso de propósito: sem faixa, sem selo, sem cor no título.
    return documento(
      `<div style="max-width:560px;margin:36px auto;background:#fff;padding:40px 44px;border:1px solid #e5e7eb">
    ${marca(88, "0 0 30px")}
    <h1 style="font-family:Georgia,serif;font-size:22px;font-weight:400;color:#111827;margin:0 0 22px;line-height:1.3">${t}</h1>
    ${paragrafosHtml(corpo, "font-size:16px;line-height:1.6;color:#374151;margin:0 0 16px")}
    <p style="font-size:16px;line-height:1.6;color:#374151;margin:26px 0 0">Um abraço,<br><span style="color:#1B5E54">${nomeRemetente()}</span></p>
    ${rodape()}
  </div>`,
      "#FAFAF8",
      assunto,
    );
  }

  if (d === "AVISO_CURTO") {
    const url = logoEmpresaUrl();
    const logo = url
      ? `<img src="${url}" alt="${nomeRemetente()}" width="96" style="display:block;width:96px;height:auto;margin:0 auto 22px">`
      : "";
    return documento(
      `<div style="max-width:420px;margin:40px auto;background:#fff;border-radius:12px;border-top:4px solid ${p.solido};padding:30px 30px 26px;box-shadow:0 2px 12px rgba(0,0,0,.06);text-align:center">
    ${logo}
    ${seloDe(p)}
    <h1 style="font-size:24px;font-weight:700;color:${p.titulo};margin:0 0 14px;line-height:1.2">${t}</h1>
    ${paragrafosHtml(corpo, "font-size:15px;line-height:1.6;color:#374151;margin:0 0 22px")}
    <div style="border-top:1px solid #e5e7eb;padding-top:14px;font-size:12px;color:#9ca3af">${nomeRemetente()}</div>
  </div>`,
      "#EDF2F0",
      assunto,
    );
  }

  // PADRAO, DESTAQUE e BOTAO compartilham a moldura da faixa no topo — os dois
  // últimos só acrescentam um bloco depois do texto.
  const extra = d === "DESTAQUE" ? caixaDestaque(p, extras) : d === "BOTAO" ? botao(extras) : "";

  return documento(
    `<div style="max-width:560px;margin:24px auto;background:#fff;border-radius:10px;padding:28px 32px;box-shadow:0 2px 12px rgba(0,0,0,.05)">
    <div style="height:6px;background:${p.faixa};border-radius:3px;margin-bottom:20px"></div>
    ${marca(132)}
    ${seloDe(p)}
    <h1 style="font-size:19px;font-weight:700;color:${p.titulo};margin:0 0 16px">${t}</h1>
    ${texto}
    ${extra}
    ${rodape()}
  </div>
  ${assinaturaExterna()}`,
    "#f3f4f6",
    assunto,
  );
}

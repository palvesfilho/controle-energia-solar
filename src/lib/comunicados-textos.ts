/**
 * A REDAÇÃO de um comunicado e como ela vira email e WhatsApp.
 *
 * O motor de `{{variáveis}}` é o mesmo da cobrança (`texto-variaveis.ts`); o
 * que muda é o CONTRATO — quais nomes valem aqui. E ele muda por público:
 * `{{unidades}}` são UCs para o descontista e usinas para o investidor, e é
 * proposital que a mesma variável signifique a coisa certa em cada lista.
 *
 * 🔑 **O email do comunicado não tem mobília de cobrança.** Nada de valor,
 * vencimento ou botão de pagar: isto não é uma fatura. O que a moldura garante
 * é o timbre com a marca, o título e o rodapé com quem está falando — o resto
 * é o texto do operador.
 */
import { descricaoNegocio, emailSuporte, nomeRemetente } from "@/lib/identidade-remetente";
import { logoEmpresaUrl } from "@/lib/logo-empresa";
import {
  escapeHtml,
  paragrafosHtml,
  renderTextoComVariaveis,
  variaveisDesconhecidas as desconhecidasNaLista,
} from "@/lib/texto-variaveis";
import { primeiroNome } from "@/lib/cobranca-mensagens";
import type { Destinatario, PublicoComunicado } from "@/lib/comunicados-publico";

export interface VariavelComunicado {
  chave: string;
  ajuda: string;
}

/** Valem nos dois públicos. */
const COMUNS: VariavelComunicado[] = [
  { chave: "saudacao", ajuda: "Olá / Olá, Fulano — já resolve o caso da empresa, que não recebe nome" },
  { chave: "nome", ajuda: "Nome como está no cadastro" },
  { chave: "primeiroNome", ajuda: "Só o primeiro nome; vazio quando é empresa" },
  { chave: "cidade", ajuda: "Cidade do cadastro; vazio quando não há" },
  { chave: "empresa", ajuda: "Nome da empresa que assina" },
  { chave: "suporte", ajuda: "Email de contato" },
];

/**
 * A lista por público. `{{unidades}}` existe nos dois com o mesmo nome e
 * sentidos diferentes — é o que a pessoa tem conosco.
 */
export function variaveisDoPublico(publico: PublicoComunicado): VariavelComunicado[] {
  const especifica: VariavelComunicado =
    publico === "INVESTIDOR"
      ? { chave: "unidades", ajuda: "Usinas do investidor, separadas por vírgula" }
      : { chave: "unidades", ajuda: "Unidades consumidoras do cliente, separadas por vírgula" };
  return [...COMUNS, especifica, { chave: "quantasUnidades", ajuda: "Quantas são (número)" }];
}

/** Os valores para UMA pessoa. */
export function valoresDoDestinatario(d: Destinatario): Record<string, string> {
  const nome = primeiroNome(d.nome);
  return {
    saudacao: nome ? `Olá, ${nome}` : "Olá",
    nome: d.nome,
    primeiroNome: nome,
    cidade: d.cidade ?? "",
    unidades: d.unidades.join(", "),
    quantasUnidades: String(d.unidades.length),
    empresa: nomeRemetente(),
    suporte: emailSuporte(),
  };
}

export function variaveisDesconhecidas(texto: string, publico: PublicoComunicado): string[] {
  return desconhecidasNaLista(
    texto,
    variaveisDoPublico(publico).map((v) => v.chave),
  );
}

/**
 * Renderiza para uma pessoa. **Lança** quando o texto tem defeito.
 *
 * ⚠️ Aqui é o oposto da cobrança, e de propósito. Na cobrança um texto quebrado
 * cai no padrão para não travar o faturamento do mês. Comunicado não tem texto
 * padrão nenhum — é sempre escrito para a ocasião. Mandar "alguma coisa" no
 * lugar do que o operador escreveu seria pior do que não mandar; então o
 * disparo recusa antes de começar, e a validação acontece ao salvar e de novo
 * na prévia.
 */
export function renderParaDestinatario(texto: string, d: Destinatario): string {
  return renderTextoComVariaveis(texto, valoresDoDestinatario(d));
}

const ESTILO_PARAGRAFO = "font-size:15px;line-height:1.6;color:#374151;margin:0 0 16px";

export const TIPOS = ["INFORMATIVO", "ATENCAO", "URGENTE"] as const;
export type TipoComunicado = (typeof TIPOS)[number];

export const TIPO_LABEL: Record<TipoComunicado, string> = {
  INFORMATIVO: "Informativo",
  ATENCAO: "Atenção",
  URGENTE: "Urgente",
};

export const TIPO_QUANDO: Record<TipoComunicado, string> = {
  INFORMATIVO: "O padrão. Notícia, novidade, explicação.",
  ATENCAO: "Algo muda para o cliente: reajuste, nova regra, prazo se aproximando.",
  URGENTE: "Exige ação e tem prazo curto. Use pouco.",
};

/**
 * O peso visual de cada tipo — só cores e um selo, nunca a estrutura.
 *
 * 🔑 **O que muda é o mínimo**: a faixa do topo, a cor do título e um selo
 * acima dele. O logotipo, o corpo e o rodapé são idênticos nos três, porque
 * quem recebe precisa reconhecer o remetente antes de reparar no tom — e um
 * email que muda de cara inteira parece de outra empresa.
 *
 * ⚠️ **Vermelho gasta rápido.** Se todo comunicado virar urgente, o cliente
 * para de distinguir e o recurso perde a função. Isso é disciplina de uso e a
 * tela avisa; o software não tem como impedir.
 */
const APARENCIA: Record<
  TipoComunicado,
  { faixa: string; titulo: string; selo: string | null; seloFundo: string; seloTexto: string }
> = {
  INFORMATIVO: {
    faixa: "linear-gradient(90deg,#1B5E54 0%,#3BAE99 50%,#EA6E2C 100%)",
    titulo: "#1B5E54",
    selo: null,
    seloFundo: "",
    seloTexto: "",
  },
  ATENCAO: {
    faixa: "#F0A100",
    titulo: "#7A4E00",
    selo: "ATENÇÃO",
    seloFundo: "#FEF3C7",
    seloTexto: "#92400E",
  },
  URGENTE: {
    faixa: "#C62828",
    titulo: "#8E1B1B",
    selo: "URGENTE",
    seloFundo: "#FEE2E2",
    seloTexto: "#991B1B",
  },
};

/**
 * O email do comunicado: timbre, selo (quando há), título, texto, rodapé.
 *
 * Mesma moldura da cobrança para quem recebe reconhecer o remetente — mesmo
 * logotipo, mesma largura, mesmo rodapé.
 *
 * 🪤 Tipo desconhecido cai em INFORMATIVO em vez de quebrar: um valor
 * inesperado no banco (migração antiga, escrita por outra via) não pode
 * impedir a mensagem de sair.
 */
export function htmlComunicado(
  assunto: string,
  corpo: string,
  tipo: TipoComunicado = "INFORMATIVO",
): string {
  const v = APARENCIA[tipo] ?? APARENCIA.INFORMATIVO;
  const logo = logoEmpresaUrl();
  const timbre = logo
    ? `<img src="${logo}" alt="${nomeRemetente()}" width="132" style="display:block;width:132px;max-width:60%;height:auto;margin:0 0 16px">`
    : "";
  const selo = v.selo
    ? `<div style="display:inline-block;background:${v.seloFundo};color:${v.seloTexto};font-size:11px;font-weight:700;letter-spacing:1px;padding:4px 10px;border-radius:999px;margin:0 0 10px">${v.selo}</div>`
    : "";

  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>${escapeHtml(assunto)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Helvetica,Arial,sans-serif;color:#111827">
  <div style="max-width:560px;margin:24px auto;background:#fff;border-radius:10px;padding:28px 32px;box-shadow:0 2px 12px rgba(0,0,0,.05)">
    <div style="height:6px;background:${v.faixa};border-radius:3px;margin-bottom:20px"></div>
    ${timbre}
    ${selo}
    <h1 style="font-size:19px;font-weight:700;color:${v.titulo};margin:0 0 16px">${escapeHtml(assunto)}</h1>
    ${paragrafosHtml(corpo, ESTILO_PARAGRAFO)}
    <p style="font-size:12px;color:#6b7280;margin:22px 0 0;border-top:1px solid #e5e7eb;padding-top:14px">
      Dúvidas? Responda este email ou escreva para <a href="mailto:${emailSuporte()}" style="color:#1B5E54">${emailSuporte()}</a>.
    </p>
  </div>
  <p style="text-align:center;font-size:11px;color:#9ca3af;margin:12px 16px 24px">
    ${nomeRemetente()} · ${descricaoNegocio()}
  </p>
</body>
</html>`;
}

/**
 * O WhatsApp: o texto do operador e a assinatura.
 *
 * A assinatura é fixa, fora do texto editável — no WhatsApp ela é a única
 * coisa que diz de quem é a mensagem.
 */
export function textoWhatsappComunicado(corpo: string): string {
  return `${corpo.trim()}\n\n${nomeRemetente()}`;
}

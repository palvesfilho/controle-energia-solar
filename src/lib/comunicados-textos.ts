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
import { emailSuporte, nomeRemetente } from "@/lib/identidade-remetente";
import {
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

/**
 * O EMAIL do comunicado mora em `comunicados-desenhos.ts`.
 *
 * 🔑 Saiu daqui em 06/09/2026, quando os desenhos passaram de um para sete:
 * este arquivo é sobre a REDAÇÃO (variáveis, render, validação) e aquele é
 * sobre a APARÊNCIA. Misturar os dois faria um arquivo em que ninguém acha
 * nem uma coisa nem outra.
 */
export {
  htmlComunicado,
  DESENHOS,
  DESENHO_LABEL,
  DESENHO_QUANDO,
  DESENHO_EXIGE,
  desenhoIgnoraPeso,
  type DesenhoComunicado,
  type TipoComunicado,
  type ExtrasComunicado,
} from "@/lib/comunicados-desenhos";

export const TIPOS = ["INFORMATIVO", "ATENCAO", "URGENTE"] as const;

export const TIPO_LABEL: Record<(typeof TIPOS)[number], string> = {
  INFORMATIVO: "Informativo",
  ATENCAO: "Atenção",
  URGENTE: "Urgente",
};

export const TIPO_QUANDO: Record<(typeof TIPOS)[number], string> = {
  INFORMATIVO: "O padrão. Notícia, novidade, explicação.",
  ATENCAO: "Algo muda para o cliente: reajuste, nova regra, prazo se aproximando.",
  URGENTE: "Exige ação e tem prazo curto. Use pouco.",
};

/**
 * O WhatsApp: o texto do operador e a assinatura.
 *
 * A assinatura é fixa, fora do texto editável — no WhatsApp ela é a única
 * coisa que diz de quem é a mensagem.
 */
export function textoWhatsappComunicado(corpo: string): string {
  return `${corpo.trim()}\n\n${nomeRemetente()}`;
}

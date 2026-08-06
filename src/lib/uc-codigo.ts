/**
 * Código da UC (migração RGE jul/2026) — normalização e exibição.
 *
 * A concessionária passou a imprimir o "Número da UC" no formato pontuado
 * `3.562.981.001-26`, enquanto o parser de fatura e o de-para gravam SÓ DÍGITOS
 * (`356298100126`). O formato canônico no banco continua sendo DÍGITOS — se um
 * for gravado pontuado e outro em dígitos, o sistema trata como UCs diferentes
 * e duplica.
 *
 * Regra: **grava dígitos, exibe pontuado**.
 * - `normalizeCodigoUc` → entrada do usuário/planilha/API vira dígitos.
 * - `formatCodigoUc` → dígitos viram o formato impresso pela concessionária.
 */
import { matchBusca } from "./busca";

// Forma longa (12 dígitos): 3.562.981.001-26
// Forma curta (11 dígitos): 429.474.001-20 — sem o primeiro grupo. Confirmada no
// portal da RGE (2026-07-22) em UCs antigas; ex.: CAUZZO JÚLIO DE CASTILHOS e
// IRFADI SANTO CRISTO. Aqui o casamento é ancorado (^...$) no campo de código da
// UC, então não há risco de confundir com o CPF que tem o mesmo arranjo.
const NUMERO_UC_FMT = /^(?:\d\.)?\d{3}\.\d{3}\.\d{3}-\d{2}$/;

// Só dígitos e separadores (ponto, hífen, espaço) — o código de UC nunca tem letra.
// Aceita formas parcialmente digitadas/coladas (ex.: "3.562.981.00126") para que
// nada pontuado escape para o banco.
const SO_DIGITOS_E_SEPARADORES = /^[\d.\-\s]+$/;

export function normalizeCodigoUc(v: string | null | undefined): string | null | undefined {
  if (typeof v !== "string") return v;
  const t = v.trim();
  if (!t) return v;
  if (NUMERO_UC_FMT.test(t)) return t.replace(/\D/g, "");
  // Formato inesperado, mas claramente numérico + separadores: mesmo assim grava
  // em dígitos. Evita que uma edição manual pontuada crie uma "outra" UC.
  if (SO_DIGITOS_E_SEPARADORES.test(t) && /\D/.test(t)) {
    const d = t.replace(/\D/g, "");
    if (d.length >= 8 && d.length <= 14) return d;
  }
  return v;
}

/**
 * Cláusula `where` para achar a `ConsumerUnit` de um código de UC.
 *
 * 🔑 **Regra única de casamento.** A RGE trocou os códigos em jul/2026, então a
 * mesma UC física aparece ora pelo código novo (`codigoUc`), ora pelo antigo
 * (`codigoUcAntigo`) — depende de onde o dado foi cadastrado. Quem casa só pelo
 * `codigoUc` exato não acha a UC e devolve **vazio sem erro**: o card de status
 * de faturas sumia inteiro (junto com o botão "Sincronizar faturas antigas"), o
 * relatório saía sem a titular, as beneficiárias não herdavam a credencial e o
 * cadastro criava uma UC duplicada. Nenhum desses casos dava mensagem.
 *
 * Use SEMPRE isto para ir de um código (do proprietário, da beneficiária, de uma
 * planilha) até a `ConsumerUnit`, com `findFirst` — nunca `findUnique`, que só
 * aceita a chave exata. Ver [[project_rge_troca_codigo_uc]].
 */
export function whereCodigoUc(codigo: string) {
  const norm = (normalizeCodigoUc(codigo) as string | null) ?? codigo;
  return { OR: [{ codigoUc: norm }, { codigoUcAntigo: norm }] };
}

/**
 * Exibe o código no padrão impresso pela concessionária.
 *
 * - 12 dígitos → `3.562.981.001-26`
 * - 11 dígitos → `429.474.001-20`
 * - qualquer outra coisa (código antigo de 10 dígitos, outras distribuidoras,
 *   valores já pontuados, vazio) volta inalterada.
 *
 * Conferido contra o banco (2026-07-27): todo código de 11/12 dígitos é do
 * formato novo da RGE; os antigos têm 10.
 */
export function formatCodigoUc<T extends string | null | undefined>(v: T): T {
  if (typeof v !== "string") return v;
  const t = v.trim();
  if (!/^\d+$/.test(t)) return v;
  if (t.length === 12) {
    return `${t[0]}.${t.slice(1, 4)}.${t.slice(4, 7)}.${t.slice(7, 10)}-${t.slice(10)}` as T;
  }
  if (t.length === 11) {
    return `${t.slice(0, 3)}.${t.slice(3, 6)}.${t.slice(6, 9)}-${t.slice(9)}` as T;
  }
  return v;
}

/**
 * Termo de busca casa tanto com o código em dígitos quanto com o pontuado que
 * aparece na tela — o operador copia da tela e cola no filtro.
 *
 * Hoje é só um atalho de um campo para `matchBusca` (`src/lib/busca.ts`), que
 * é a regra única de busca do sistema. As telas usam `matchBusca` direto,
 * passando o código junto dos demais campos; esta função fica para quem só
 * precisa comparar o código isolado.
 */
export function matchCodigoUc(codigo: string | null | undefined, termo: string): boolean {
  if (!codigo) return false;
  return matchBusca(termo, [codigo]);
}

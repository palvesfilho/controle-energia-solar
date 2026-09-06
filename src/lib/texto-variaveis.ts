/**
 * O motor de `{{variáveis}}` — compartilhado por tudo que deixa o operador
 * escrever um texto que vai para o cliente.
 *
 * Hoje são dois consumidores, com contratos de variáveis DIFERENTES:
 *   `cobranca-textos.ts`    — a redação da fatura e dos lembretes
 *   `comunicados-textos.ts` — a mensagem em massa por email e WhatsApp
 *
 * 🔑 **Por que um módulo só.** O segundo nasceu em 06/09/2026 e a tentação era
 * copiar o `renderTexto` do primeiro, trocando a lista de nomes. Dois motores
 * iguais divergem: alguém corrige o tratamento de espaço num, esquece o outro,
 * e o defeito aparece num só dos dois lugares — que é o tipo de bug que
 * ninguém procura, porque "no outro lugar funciona".
 *
 * O que NÃO mora aqui é a lista de variáveis: cada consumidor tem a sua, e
 * misturar `{{vencimento}}` de cobrança com `{{unidades}}` de comunicado só
 * ofereceria ao operador coisas que o envio dele não sabe preencher.
 */

/** `{{ nome }}` — o espaço interno é tolerado; quem digita não deve ser punido por ele. */
const PADRAO_VARIAVEL = /\{\{\s*([a-zA-Z]+)\s*\}\}/g;

/**
 * As variáveis do texto que não estão na lista permitida.
 * Vazio = o texto pode ir para o cliente.
 */
export function variaveisDesconhecidas(texto: string, permitidas: Iterable<string>): string[] {
  const validas = new Set(permitidas);
  const achadas = [...texto.matchAll(PADRAO_VARIAVEL)].map((m) => m[1]);
  return [...new Set(achadas.filter((n) => !validas.has(n)))];
}

/**
 * Troca `{{var}}` pelos valores. Lança em dois casos, e os dois são erro de
 * quem programou ou de quem escreveu — nunca silêncio.
 *
 * 🪤 **`?? ""` seria o buraco.** Uma variável declarada na lista mas que
 * ninguém preenche cairia no vazio e SUMIRIA da frase: a tela ofereceria
 * `{{mesExtenso}}`, o operador escreveria "vencimento de {{mesExtenso}}" e o
 * cliente leria "vencimento de ". Por isso a ausência da CHAVE é erro, e só
 * string vazia de verdade (o primeiro nome de uma empresa, um link que não
 * existe) passa em silêncio.
 */
export function renderTextoComVariaveis(
  texto: string,
  valores: Record<string, string>,
): string {
  const ruins = variaveisDesconhecidas(texto, Object.keys(valores));
  if (ruins.length > 0) {
    throw new Error(`variável desconhecida no texto: ${ruins.map((r) => `{{${r}}}`).join(", ")}`);
  }
  return texto.replace(PADRAO_VARIAVEL, (_, nome: string) => {
    if (!(nome in valores)) {
      throw new Error(`variável {{${nome}}} está declarada mas ninguém a preenche`);
    }
    return valores[nome];
  });
}

/**
 * Linhas em branco viram parágrafos; uma quebra sozinha vira `<br>`.
 *
 * 🔒 O corpo é texto do OPERADOR indo para dentro de um HTML. Sem escapar, um
 * `<` digitado na tela quebra o email — e um `<script>` viaja junto.
 */
export function paragrafosHtml(texto: string, estilo: string): string {
  return texto
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="${estilo}">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n    ");
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

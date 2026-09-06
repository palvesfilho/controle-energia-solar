/**
 * Exibição de CPF/CNPJ com a pontuação brasileira.
 *
 * O banco guarda os documentos em formatos MISTURADOS — medido em 15/08/2026:
 *   - a maioria já vem pontuada ("57.485.803/0001-09", "455.191.700-10")
 *   - parte vem só com dígitos ("03113843073", "53272174000170")
 *   - um caso vem pontuado E com espaço no meio ("53.272.174/0001- 70")
 *
 * Por isso a função NUNCA insere pontuação por cima do que veio: ela normaliza
 * pra dígitos primeiro e remonta a máscara do zero. Assim o resultado é o mesmo
 * independentemente de como o registro foi gravado.
 *
 * Zero à esquerda perdido em importação numérica é REPOSTO — ver
 * `repoeZerosAEsquerda()`, que também explica por que a reposição não vale para
 * valores que chegaram pontuados.
 *
 * 🚨 O que sobra com tamanho fora de 11/14 é devolvido CRU, sem máscara. São 5
 * ocorrências na base (2 valores distintos), todas com dígito faltando ou
 * sobrando no MEIO do documento — mascarar produziria um número plausível e
 * errado, pior que mostrar o defeito. Quem quiser marcar o defeito na tela usa
 * `isDocumentoValido()`.
 *
 * Não há validação de dígito verificador aqui de propósito: o objetivo é
 * exibir o que o cadastro tem, não julgar se o número existe na Receita.
 */

/** Só os dígitos, sem nenhuma correção — o que está gravado, cru. */
export function apenasDigitos(doc: string | null | undefined): string {
  return (doc ?? "").replace(/\D/g, "");
}

/**
 * Repõe zeros à ESQUERDA perdidos em importação numérica.
 *
 * CPF/CNPJ que passam por planilha ou por uma coluna numérica perdem o zero
 * inicial: `01123519056` volta como `1123519056`. O número segue exato — falta
 * só o zero — então repor é restaurar, não chutar (confirmado pelo Paulo em
 * 15/08/2026: "é um número de cadastro exato").
 *
 * 🔑 A reposição só vale para valores SEM PONTUAÇÃO, e a razão é que essa é a
 * assinatura do defeito: quem perdeu o zero passou por um campo numérico, e
 * campo numérico não guarda ponto nem barra. Quando o valor CHEGA pontuado, a
 * própria máscara mostra onde está o buraco — e aí ele não está na frente:
 *
 *     "11.518.950/001-29"  ->  13 dígitos, mas o que falta é o zero da FILIAL
 *                              (/001 deveria ser /0001). Completar pela
 *                              esquerda daria 01.151.895/0001-29 e trocaria a
 *                              RAIZ do CNPJ por uma empresa diferente.
 *
 * Por isso valor pontuado passa intacto: ali o zero ausente não é o da frente.
 */
export function repoeZerosAEsquerda(doc: string | null | undefined): string {
  const bruto = (doc ?? "").trim();
  if (!bruto) return "";

  const d = bruto.replace(/\D/g, "");
  if (!d) return "";

  // Já pontuado: o defeito, se houver, não é zero à esquerda. Não mexer.
  if (/\D/.test(bruto)) return d;

  // Faltando até 2 dígitos para o comprimento de CPF ou de CNPJ.
  if (d.length >= 9 && d.length <= 10) return d.padStart(11, "0");
  if (d.length >= 12 && d.length <= 13) return d.padStart(14, "0");

  return d;
}

/**
 * `true` quando o documento tem comprimento de CPF (11) ou CNPJ (14).
 * Vazio/null devolve `true` — ausência de documento não é documento defeituoso,
 * e a tela já mostra "-" nesse caso.
 */
export function isDocumentoValido(doc: string | null | undefined): boolean {
  const d = repoeZerosAEsquerda(doc);
  if (!d) return true;
  return d.length === 11 || d.length === 14;
}

/**
 * CPF -> 011.235.190-56 · CNPJ -> 57.485.803/0001-09
 *
 * Devolve `fallback` quando não há documento, e o valor CRU (só com espaços
 * aparados) quando o comprimento não bate com CPF nem CNPJ.
 */
export function formatCpfCnpj(
  doc: string | null | undefined,
  fallback = "-",
): string {
  if (doc == null) return fallback;
  const bruto = doc.trim();
  if (!bruto) return fallback;

  const d = repoeZerosAEsquerda(bruto);
  if (!d) return fallback;

  if (d.length === 11) {
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  if (d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }

  // Comprimento inesperado: mostra como está, sem inventar máscara.
  return bruto;
}

/**
 * Igual a `formatCpfCnpj`, mas prefixado com "CPF "/"CNPJ ". Útil onde o rótulo
 * da tela não diz de qual dos dois se trata (fila do CRM, buscas).
 */
export function formatCpfCnpjComRotulo(
  doc: string | null | undefined,
  fallback = "sem documento",
): string {
  const d = repoeZerosAEsquerda(doc);
  if (!d) return fallback;
  if (d.length === 11) return `CPF ${formatCpfCnpj(doc)}`;
  if (d.length === 14) return `CNPJ ${formatCpfCnpj(doc)}`;
  return formatCpfCnpj(doc, fallback);
}

/**
 * A UC guarda o titular DUAS vezes: nos campos dela (`nome`/`cpfCnpj`) e no
 * ponteiro `consumerId` para o cadastro de cliente. Esta função compara os
 * documentos dos dois lados.
 *
 * 🚨 **Por que existe.** Em 06/09/2026 a UC `199346300111` — da MAINARDI E
 * CARGNELUTTI, CNPJ 24.138.302/0001-99 nos próprios campos — estava apontando
 * para o cliente RODRIGO TREVISAN SBEGHEN, CPF 911.272.620-68. O seletor
 * "Consumidor" do formulário mostra só o NOME de 86 clientes em ordem
 * alfabética; alguém clicou na linha errada e nada, em lugar nenhum, conferiu.
 *
 * O erro não é decorativo: `pickCpfCnpj` em `billing-asaas.ts` prefere o
 * documento do CLIENTE e só usa o da UC como último recurso. O boleto do
 * consumo da empresa sairia no CPF da pessoa física, com o email dela.
 *
 * 📏 **`mesma_raiz` não é erro.** Os 8 primeiros dígitos do CNPJ são a raiz da
 * empresa; o que muda depois é a filial. As três UCs da PONTELLI JOALHERIA
 * apontam para a matriz `/0004` e têm `/0001`, `/0005` e `/0006` nos próprios
 * campos — é a mesma empresa, e gritar nesses casos é o caminho mais curto
 * para o aviso ser ignorado quando importar.
 */
export type ConfrontoDocumento = "sem_dado" | "igual" | "mesma_raiz" | "diverge";

export function comparaDocumentos(
  docA: string | null | undefined,
  docB: string | null | undefined,
): ConfrontoDocumento {
  const a = repoeZerosAEsquerda(docA);
  const b = repoeZerosAEsquerda(docB);
  if (!a || !b) return "sem_dado";
  if (a === b) return "igual";
  if (a.length === 14 && b.length === 14 && a.slice(0, 8) === b.slice(0, 8)) {
    return "mesma_raiz";
  }
  return "diverge";
}

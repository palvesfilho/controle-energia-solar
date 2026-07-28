/**
 * Busca textual única do sistema — client-safe (sem Prisma, sem `server-only`).
 *
 * Regra combinada com o Paulo (2026-07-28): o operador digita do jeito que
 * lembra e o sistema acha. Na prática:
 *
 * - **Acento e caixa não importam.** `JOAO`, `joão`, `Joao`, `joao` casam com
 *   `JOÃO`. Vale nos dois sentidos — o cadastro tanto pode estar acentuado
 *   quanto não, porque parte da base veio de importação sem acento.
 * - **Pontuação de documento não importa.** `123.456.789-00` acha
 *   `12345678900` e vice-versa. O mesmo vale para código de UC
 *   (`3.562.981.001-26` ≡ `356298100126`, ver [[uc-codigo]]), CEP e telefone —
 *   qualquer campo cujo termo digitado seja numérico.
 * - **Ordem das palavras não importa.** `correa joao` acha
 *   `JOÃO ALBERTO CORREA`. Cada palavra digitada precisa aparecer em ALGUM dos
 *   campos pesquisados, não necessariamente no mesmo — assim `joao carazinho`
 *   acha o João da cidade de Carazinho.
 *
 * A versão server-side (SQL) desta mesma regra está em `busca-sql.ts`; as duas
 * precisam andar juntas, senão a mesma busca dá resultado diferente dependendo
 * da tela.
 */

/**
 * Minúsculas, sem acento, espaços colapsados.
 *
 * `NFD` separa a letra do diacrítico e o `replace` remove a marca combinante —
 * cobre todo o alfabeto latino (á, ç, ñ, ü...) sem lista fixa de caracteres.
 */
export function normalizeBusca(s: string | null | undefined): string {
  if (typeof s !== "string") return "";
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Só os dígitos — para casar documento/código independente da pontuação. */
export function somenteDigitos(s: string | null | undefined): string {
  if (typeof s !== "string") return "";
  return s.replace(/\D/g, "");
}

/**
 * Um termo é "numérico" quando o operador claramente digitou um documento,
 * código de UC, CEP ou telefone: só dígitos e separadores (. - / ( ) espaço).
 * Nesse caso a comparação também é feita dígito a dígito.
 */
function ehTermoNumerico(token: string): boolean {
  return /\d/.test(token) && /^[\d.\-/()\s]+$/.test(token);
}

/**
 * Quebra o termo digitado em palavras. Preserva os separadores dentro de um
 * documento (`123.456.789-00` continua um token só) porque a quebra é por
 * espaço.
 */
function tokenizar(termo: string): string[] {
  return termo.trim().split(/\s+/).filter(Boolean);
}

/**
 * Casa o termo digitado contra os campos de um registro.
 *
 * Semântica: **E** entre as palavras digitadas, **OU** entre os campos. Termo
 * vazio casa com tudo (lista sem filtro).
 *
 * ```ts
 * const filtrados = itens.filter((i) =>
 *   matchBusca(termo, [i.nome, i.cpfCnpj, i.codigoUc, i.cidade])
 * );
 * ```
 */
export function matchBusca(
  termo: string | null | undefined,
  campos: Array<string | null | undefined>
): boolean {
  const tokens = tokenizar(typeof termo === "string" ? termo : "");
  if (tokens.length === 0) return true;

  // Pré-normaliza os campos uma vez só — a função roda por linha da tabela.
  const camposTexto: string[] = [];
  const camposDigitos: string[] = [];
  for (const c of campos) {
    if (typeof c !== "string" || !c) continue;
    camposTexto.push(normalizeBusca(c));
    const d = somenteDigitos(c);
    if (d) camposDigitos.push(d);
  }
  if (camposTexto.length === 0) return false;

  return tokens.every((token) => {
    const alvo = normalizeBusca(token);
    if (alvo && camposTexto.some((c) => c.includes(alvo))) return true;
    if (!ehTermoNumerico(token)) return false;
    const digitos = somenteDigitos(token);
    return digitos.length > 0 && camposDigitos.some((c) => c.includes(digitos));
  });
}

/**
 * Açúcar para o caso mais comum: campos passados soltos.
 *
 * ```ts
 * matchBuscaCampos(termo, i.nome, i.cpfCnpj, i.cidade)
 * ```
 */
export function matchBuscaCampos(
  termo: string | null | undefined,
  ...campos: Array<string | null | undefined>
): boolean {
  return matchBusca(termo, campos);
}

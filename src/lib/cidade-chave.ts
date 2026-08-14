/**
 * Agrupamento de nomes de cidade — regra ÚNICA do sistema.
 *
 * 🔑 **O campo `cidade` da base é texto livre e está bagunçado.** Diagnóstico de
 * 13/08/2026 sobre `BrasilSolarClient` (1.918 ativas): **182 grafias distintas**
 * para o que são ~60 cidades reais. Só "Santa Maria" aparece como:
 *
 *   Santa Maria (1.095) · Santa Maria/RS-uf=RS (58) · SANTA MARIA (44)
 *   SANTA MARIA/RS (16) · Santa Maria/RS (8) · "Santa Maria " (5)
 *   SANTA MARIA - RS (3) · " SANTA MARIA" · Santa maria · santa maria …
 *
 * Ou seja: caixa, acento, espaço sobrando **e a UF grudada dentro do próprio
 * campo cidade** ("Santa Maria/RS", "CACHOEIRA DO SUL - RS"). Um filtro com
 * `cidade = 'Santa Maria'` — que é o que a rota fazia — devolveria 1.095 de
 * 1.234 e esconderia 139 usinas sem avisar ninguém.
 *
 * Por isso o filtro de cidade não casa o texto cru: casa a CHAVE. O dropdown
 * mostra um item por chave e o `where` pega **todas** as variantes dela.
 */

/** As 27 UFs — usadas para reconhecer a sigla grudada no nome da cidade. */
const UFS = new Set([
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO",
]);

/** Preposições que ficam em minúscula no meio do nome ("Cachoeira do Sul"). */
const MINUSCULAS = new Set(["de", "do", "da", "dos", "das", "e"]);

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Quantos caracteres acentuados o nome tem.
 *
 * Conta sobre o NFD: "São".length é 3 tanto quanto "Sao".length, porque o `ã`
 * vem precomposto do banco. Comparar os comprimentos crus dava sempre 0 e o
 * desempate caía todo na frequência — que é justamente a grafia ERRADA, já que
 * a maioria da base foi digitada sem acento ("Rosario do Sul" 12 × "Rosário do
 * Sul" 3).
 */
function contarAcentos(s: string): number {
  return s.normalize("NFD").length - semAcento(s).length;
}

/**
 * Separa a UF grudada no nome: "Santa Maria/RS" → { nome: "Santa Maria", uf: "RS" }.
 * Aceita os separadores vistos na base: `/`, ` - `, `-` e o espaço puro
 * ("Aratiba RS", que sem isso virava uma cidade só dele).
 *
 * ⚠️ O separador é OBRIGATÓRIO. Torná-lo opcional cortaria as duas últimas
 * letras de qualquer nome — "Novo Hamburgo" viraria "Novo Hambur" + GO,
 * "Livramento" viraria "Livramen" + TO, "Nova Palma" viraria "Nova Pal" + MA.
 * Exigindo o separador, a sigla é sempre um TOKEN próprio, e nenhum município
 * brasileiro tem um token final de duas letras.
 */
export function separarUf(bruto: string): { nome: string; uf: string | null } {
  const limpo = bruto.trim().replace(/\s+/g, " ");
  const m = limpo.match(/^(.*?)(?:\s*[/-]\s*|\s+)([A-Za-z]{2})$/);
  if (m) {
    const uf = m[2].toUpperCase();
    const nome = m[1].trim();
    // `nome` vazio protege a cidade que é só a sigla ("RS" sozinho não vira "").
    if (UFS.has(uf) && nome) return { nome, uf };
  }
  return { nome: limpo, uf: null };
}

/**
 * Chave de agrupamento: minúscula, sem acento, sem espaço sobrando e sem a UF
 * grudada. `""` quando não há cidade — o chamador trata como "não informada".
 */
export function chaveCidade(bruto: string | null | undefined): string {
  if (!bruto) return "";
  const { nome } = separarUf(bruto);
  return semAcento(nome).toLowerCase().replace(/\s+/g, " ").trim();
}

/** "SANTA MARIA" → "Santa Maria"; preserva grafia já capitalizada à mão. */
function capitalizar(nome: string): string {
  const todaMaiuscula = nome === nome.toUpperCase();
  const todaMinuscula = nome === nome.toLowerCase();
  if (!todaMaiuscula && !todaMinuscula) return nome; // operador já escreveu certo
  return nome
    .toLowerCase()
    .split(" ")
    .map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
}

/**
 * Escolhe o rótulo de exibição entre as grafias da mesma chave.
 *
 * Prefere a que tem acento — entre "Sao Joao do Polesine" e "São João do
 * Polêsine" a segunda é a certa, e a maioria da base é a errada, então votar
 * por frequência daria o nome sem acento. Empate no acento decide por
 * frequência.
 */
export function rotuloCidade(variantes: { valor: string; count: number }[]): string {
  let melhor = "";
  let melhorAcentos = -1;
  let melhorCount = -1;
  for (const v of variantes) {
    const { nome } = separarUf(v.valor);
    if (!nome) continue;
    const acentos = contarAcentos(nome);
    if (acentos > melhorAcentos || (acentos === melhorAcentos && v.count > melhorCount)) {
      melhor = nome;
      melhorAcentos = acentos;
      melhorCount = v.count;
    }
  }
  return capitalizar(melhor);
}

/**
 * UF da cidade quando ela é única entre as variantes — vale tanto a coluna `uf`
 * quanto a sigla grudada no nome. Ambígua (ou ausente) devolve `null`, e aí o
 * dropdown mostra só o nome; quem precisa desempatar homônimo de outro estado
 * usa o filtro de UF, que continua existindo ao lado.
 */
export function ufDaCidade(variantes: { valor: string; uf?: string | null }[]): string | null {
  const ufs = new Set<string>();
  for (const v of variantes) {
    const embutida = separarUf(v.valor).uf;
    const coluna = (v.uf ?? "").trim().toUpperCase();
    if (embutida) ufs.add(embutida);
    if (coluna && UFS.has(coluna)) ufs.add(coluna);
  }
  return ufs.size === 1 ? [...ufs][0] : null;
}

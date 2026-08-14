/**
 * Caça caracteres que a fonte do PDF nao sabe desenhar.
 *
 * Os PDFs usam Helvetica, uma das 14 fontes padrao do formato, cuja codificacao
 * e a WinAnsi (CP1252). Caractere fora dela nao vira erro: vira OUTRA COISA.
 * O "−" (U+2212) sai invisivel, e o "≥" (U+2265) sai como "e" — porque sobra o
 * byte baixo, 0x65. Medido em 14/08/2026: o PDF do cliente imprimia
 * "e R$ 268,86" onde devia estar "≥ R$ 268,86".
 *
 * Roda sobre o FONTE, nao sobre o PDF gerado, porque o caractere pode estar num
 * ramo que so aparece para alguns clientes — esperar o defeito surgir em
 * producao e caro demais.
 *
 * npx tsx scripts/verifica-glifos-pdf.ts
 */
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";

/** Os 27 caracteres que a CP1252 acrescenta na faixa 0x80–0x9F. */
const EXTRAS_CP1252 = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ''\"\"•–—˜™š›œžŸ";

function foraDaWinAnsi(ch: string): boolean {
  const c = ch.codePointAt(0)!;
  if (c >= 0x20 && c <= 0x7e) return false; // ASCII imprimivel
  if (c >= 0xa0 && c <= 0xff) return false; // Latin-1 alto
  if (c === 0x09 || c === 0x0a || c === 0x0d) return false; // tab/quebras
  return !EXTRAS_CP1252.includes(ch);
}

const arquivos = globSync("src/components/**/*pdf*.tsx");
let achados = 0;

/**
 * Apaga comentarios preservando as QUEBRAS DE LINHA, para o numero da linha
 * continuar batendo com o arquivo real.
 *
 * Comentario nao e renderizado, entao nao quebra nada — e um varredor que
 * aponta comentario vira alarme que sempre toca, e alarme que sempre toca
 * ninguem le. Precisa varrer o arquivo INTEIRO, e nao linha a linha, porque os
 * comentarios JSX (`{/* ... *\/}`) deste projeto costumam ter varias linhas.
 */
function semComentarios(fonte: string): string {
  const vazio = (m: string) => m.replace(/[^\r\n]/g, " ");
  return fonte
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, vazio)
    .replace(/\/\*[\s\S]*?\*\//g, vazio)
    .replace(/\/\/[^\r\n]*/g, vazio);
}

for (const arq of arquivos) {
  const linhasReais = readFileSync(arq, "utf8").split(/\r?\n/);
  const linhas = semComentarios(readFileSync(arq, "utf8")).split(/\r?\n/);
  linhas.forEach((codigo, i) => {
    const linha = linhasReais[i] ?? codigo;
    if (codigo.trim() === "") return;

    const ruins = [...new Set([...codigo].filter(foraDaWinAnsi))];
    if (ruins.length === 0) return;
    achados++;
    const lista = ruins
      .map((c) => `${JSON.stringify(c)} (U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")})`)
      .join(", ");
    console.log(`${arq}:${i + 1}`);
    console.log(`   caractere(s): ${lista}`);
    console.log(`   ${linha.trim().slice(0, 120)}`);
  });
}

console.log(
  achados === 0
    ? `\nOK — nenhum caractere fora da WinAnsi em ${arquivos.length} componente(s) de PDF.`
    : `\n${achados} linha(s) com caractere que a Helvetica nao desenha.`,
);
process.exit(achados === 0 ? 0 : 1);

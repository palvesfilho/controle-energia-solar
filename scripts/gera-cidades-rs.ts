/**
 * Gera `src/lib/cidades-rs.ts` — os 497 municípios do RS COM acentuação.
 *
 * O Gerador de Propostas tem a mesma lista, mas sem acento ("Bage",
 * "Bento Goncalves"), e o Gestor escreve em pt-BR acentuado. Em vez de acentuar
 * 497 nomes na mão, busca no IBGE (fonte oficial) e CONFERE contra a lista do
 * Gerador: normalizando os dois lados, os conjuntos têm que ser idênticos. Se
 * divergirem, o script para em vez de gravar — divergência aqui significa que
 * uma das duas listas está desatualizada, e escolher em silêncio esconderia o
 * problema.
 *
 * Rodar só quando a lista mudar (município novo é raro). O arquivo gerado é que
 * vai pro git.
 */
import { readFileSync, writeFileSync } from "node:fs";

const IBGE = "https://servicodados.ibge.gov.br/api/v1/localidades/estados/RS/municipios";
const LISTA_GERADOR = "D:/PROJETOS_CLAUDE/GERADOR_PROPOSTA/frontend/src/lib/cidades_rs.js";
const SAIDA = "src/lib/cidades-rs.ts";

// Al\u00e9m dos acentos, tira ap\u00f3strofo e h\u00edfen: o IBGE grafa "Sant'Ana do
// Livramento" (nome oficial) e o Gerador "Santana do Livramento". \u00c9 o MESMO
// munic\u00edpio, e sem isso a confer\u00eancia acusaria diverg\u00eancia onde n\u00e3o h\u00e1.
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['\u2019\-]/g, "")
    .toLowerCase()
    .trim();

async function main() {
  const res = await fetch(IBGE);
  if (!res.ok) throw new Error(`IBGE respondeu ${res.status}`);
  const municipios = (await res.json()) as { nome: string }[];
  const doIbge = municipios.map((m) => m.nome).sort((a, b) => a.localeCompare(b, "pt-BR"));
  console.log(`IBGE: ${doIbge.length} municípios`);

  const txt = readFileSync(LISTA_GERADOR, "utf8");
  const doGerador = [...new Set([...txt.matchAll(/"([^"]+)"/g)].map((m) => m[1]))];
  console.log(`Gerador: ${doGerador.length} municípios`);

  const setIbge = new Set(doIbge.map(norm));
  const setGerador = new Set(doGerador.map(norm));
  const soIbge = [...setIbge].filter((n) => !setGerador.has(n));
  const soGerador = [...setGerador].filter((n) => !setIbge.has(n));

  if (soIbge.length || soGerador.length) {
    console.error(`\nAS DUAS LISTAS DIVERGEM — nada foi gravado.`);
    if (soIbge.length) console.error(`  só no IBGE (${soIbge.length}): ${soIbge.slice(0, 10).join(", ")}`);
    if (soGerador.length) console.error(`  só no Gerador (${soGerador.length}): ${soGerador.slice(0, 10).join(", ")}`);
    process.exit(1);
  }
  console.log(`✓ os dois conjuntos batem (${setIbge.size} nomes) — o IBGE só acrescenta os acentos\n`);

  // Grafias que diferem além do acento (apóstrofo/hífen) — vale ver na saída.
  const porNorm = new Map(doGerador.map((c) => [norm(c), c]));
  const diferentes = doIbge.filter((c) => {
    const g = porNorm.get(norm(c));
    return g && g.replace(/['’\-]/g, "") !== c.replace(/['’\-]/g, "");
  });
  if (diferentes.length) {
    console.log(`Grafia diferente do Gerador (fica valendo a do IBGE, que é a oficial):`);
    for (const c of diferentes) console.log(`   "${porNorm.get(norm(c))}" -> "${c}"`);
    console.log("");
  }

  const acentuados = doIbge.filter((c) => /[áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ]/.test(c));
  console.log(`${acentuados.length} nomes ganham acento. Ex.: ${acentuados.slice(0, 6).join(" · ")}`);

  const linhas: string[] = [];
  for (let i = 0; i < doIbge.length; i += 4) {
    linhas.push("  " + doIbge.slice(i, i + 4).map((c) => JSON.stringify(c)).join(", ") + ",");
  }

  const conteudo = `// GERADO por scripts/gera-cidades-rs.ts — não editar à mão.
// Fonte: IBGE (/localidades/estados/RS/municipios), conferido contra a lista do
// GERADOR_PROPOSTA: mesmos ${doIbge.length} municípios, aqui com a acentuação correta.
//
// A busca do <CidadeInput> normaliza acentos, então digitar "bage" acha "Bagé".

export const CIDADES_RS: string[] = [
${linhas.join("\n")}
];
`;

  writeFileSync(SAIDA, conteudo, "utf8");
  console.log(`\nGravado ${SAIDA} com ${doIbge.length} municípios.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

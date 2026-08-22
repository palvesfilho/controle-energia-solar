/**
 * Impede que UC do modulo BRASIL SOLAR vaze para tela da ASSOCIACAO.
 *
 * O problema que este script existe para matar: a separacao entre os dois
 * mundos e o campo `ConsumerUnit.origem`, e o filtro `SEM_UC_BRASIL_SOLAR` e
 * OPCIONAL — quem escreve uma consulta nova simplesmente esquece, e o vazamento
 * nao da erro nenhum. Ele aparece semanas depois, como cliente da rede Brasil
 * Solar no meio da lista de quem recebe desconto na fatura. Aconteceu pelo
 * menos 4 vezes ate 22/08/2026; a ultima fui eu, no seletor "+ Adicionar UC"
 * do rateio, que subiu com `where: { active: true }` e despejou 39 UCs BS no
 * meio de 147.
 *
 * A regra: TODA consulta a `prisma.consumerUnit` precisa declarar o que faz com
 * a origem. Ou filtra, ou diz por escrito por que nao filtra.
 *
 * Como declarar que uma consulta NAO precisa do filtro:
 *
 *   // origem-ok: busca por codigoUc especifico, os dois mundos valem
 *   const uc = await prisma.consumerUnit.findFirst({ ... })
 *
 * E, para um arquivo inteiro que so existe dentro do modulo Brasil Solar,
 * uma unica linha em qualquer lugar do arquivo:
 *
 *   // origem-ok-arquivo: modulo Brasil Solar — estas UCs sao o assunto aqui
 *
 * Rodar:  npx tsx scripts/verifica-origem-uc.ts
 */
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";

/**
 * So consultas em forma de LISTA. `findUnique`/`findFirst` pedem UMA UC por
 * identidade (id ou codigoUc) e nao tem como "vazar para a lista" — incluir as
 * duas gerava 32 alarmes, quase todos falsos, e trava que grita a toa e trava
 * que alguem desliga.
 */
const CONSULTAS = /prisma\.consumerUnit\.(findMany|count|groupBy|aggregate)/;

/** Quantas linhas depois da chamada ainda contam como "dentro da consulta". */
const JANELA = 30;
/** Quantas linhas antes aceitam o marcador de dispensa. */
const JANELA_MARCADOR = 4;

interface Falha {
  arquivo: string;
  linha: number;
  trecho: string;
}

const arquivos = globSync("src/**/*.{ts,tsx}");
const falhas: Falha[] = [];
let filtradas = 0;
let dispensadas = 0;

for (const arquivo of arquivos) {
  const texto = readFileSync(arquivo, "utf8");
  if (!CONSULTAS.test(texto)) continue;

  // Dispensa do arquivo inteiro (modulos que SAO o Brasil Solar).
  if (texto.includes("origem-ok-arquivo:")) {
    dispensadas += texto.split("\n").filter((l) => CONSULTAS.test(l)).length;
    continue;
  }

  const linhas = texto.split("\n");
  for (let i = 0; i < linhas.length; i++) {
    if (!CONSULTAS.test(linhas[i])) continue;

    const antes = linhas.slice(Math.max(0, i - JANELA_MARCADOR), i + 1).join("\n");
    if (antes.includes("origem-ok:")) {
      dispensadas++;
      continue;
    }

    const dentro = linhas.slice(i, Math.min(linhas.length, i + JANELA)).join("\n");
    if (dentro.includes("SEM_UC_BRASIL_SOLAR") || /\borigem\s*:/.test(dentro)) {
      filtradas++;
      continue;
    }

    falhas.push({ arquivo, linha: i + 1, trecho: linhas[i].trim() });
  }
}

console.log(
  `consultas a ConsumerUnit: ${filtradas} filtradas | ${dispensadas} dispensadas por escrito | ${falhas.length} sem declaracao`,
);

if (falhas.length > 0) {
  console.error(`\nX ${falhas.length} consulta(s) nao dizem o que fazem com a origem:\n`);
  for (const f of falhas) {
    console.error(`   ${f.arquivo}:${f.linha}`);
    console.error(`      ${f.trecho}`);
  }
  console.error(
    `\nEscolha uma das duas saidas:
   1) e tela da ASSOCIACAO  -> acrescente ...SEM_UC_BRASIL_SOLAR ao where
   2) nao precisa do filtro -> escreva o motivo na linha de cima:
      // origem-ok: <motivo>

Sem isso, UC da rede Brasil Solar volta a aparecer como cliente de desconto.`,
  );
  process.exit(1);
}

console.log("OK — nenhuma consulta a ConsumerUnit ficou sem declarar a origem.");

/**
 * Acha (e opcionalmente conserta) acentuação quebrada no código-fonte.
 *
 * O defeito: um arquivo UTF-8 foi lido como WINDOWS-1252 e regravado como
 * UTF-8. O "á", que são os bytes C3 A1, vira C3 83 C2 A1 — dois caracteres na
 * tela no lugar de um. Em 15/08/2026 havia 517 trechos assim em 56 arquivos; a
 * tela de Personalizações inteira estava com acento quebrado.
 *
 * Os exemplos aqui estão em BYTES de propósito: escrever o texto quebrado faria
 * este script acusar o próprio comentário.
 *
 * Por que cp1252 e não latin1: os bytes 0x80–0x9F não existem em latin1, e são
 * exatamente os que viram cifrão de euro, travessão e aspas curvas no cp1252.
 * Tratar como latin1 conserta as vogais acentuadas (2 bytes) e deixa passar o
 * travessão (3 bytes), que era metade do problema.
 *
 * A troca só acontece quando a corrida de bytes decodifica como UTF-8 VÁLIDO.
 * Texto correto ("Âmbar", "NÃO", "Santo Ângelo") não forma UTF-8 válido e é
 * recusado sozinho — a checagem é a rede de segurança, não a intenção.
 *
 * ⚠️ Não conserta tudo: se o segundo byte da sequência for perdido por uma
 * normalização (um NBSP virando espaço comum), a informação some e sobra um
 * "Ã" solto. Esses aparecem no relatório final para conserto à mão.
 *
 *   npx tsx scripts/verifica-acentuacao.ts             # só relata, sai 1 se achar
 *   npx tsx scripts/verifica-acentuacao.ts --corrigir  # grava
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join, extname } from "path";

const CORRIGIR = process.argv.includes("--corrigir");
const PASTAS = ["src", "scripts", "prisma"];
const EXTENSOES = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".prisma", ".css"]);

/** Os 27 caracteres da faixa 0x80–0x9F em que cp1252 difere do latin1. */
const CP1252_ALTO: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87,
  "ˆ": 0x88, "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e, "‘": 0x91,
  "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "˜": 0x98,
  "™": 0x99, "š": 0x9a, "›": 0x9b, "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f,
};

function byteDe(ch: string): number | null {
  const c = ch.codePointAt(0)!;
  if (c <= 0x7f) return c;
  if (CP1252_ALTO[ch] !== undefined) return CP1252_ALTO[ch];
  if (c >= 0xa0 && c <= 0xff) return c;
  return null;
}

function consertar(texto: string): { texto: string; trocas: number } {
  const chars = [...texto];
  const saida: string[] = [];
  let trocas = 0;

  for (let i = 0; i < chars.length; ) {
    const b = byteDe(chars[i]);
    if (b === null || b < 0x80) {
      saida.push(chars[i++]);
      continue;
    }
    let j = i;
    const bytes: number[] = [];
    while (j < chars.length) {
      const bj = byteDe(chars[j]);
      if (bj === null || bj < 0x80) break;
      bytes.push(bj);
      j++;
    }
    const bruto = chars.slice(i, j).join("");
    const decodificado = Buffer.from(bytes).toString("utf8");
    if (!decodificado.includes("�") && decodificado !== bruto) {
      saida.push(decodificado);
      trocas++;
    } else {
      saida.push(bruto);
    }
    i = j;
  }
  return { texto: saida.join(""), trocas };
}

function varrer(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (!/node_modules|\.next|\.git/.test(p)) varrer(p, acc);
    } else if (EXTENSOES.has(extname(e.name))) {
      acc.push(p);
    }
  }
  return acc;
}

const arquivos = PASTAS.flatMap((p) => varrer(p));
const relatorio: { arquivo: string; trocas: number }[] = [];

for (const f of arquivos) {
  let s: string;
  try {
    s = readFileSync(f, "utf8");
  } catch {
    continue;
  }
  const r = consertar(s);
  if (r.trocas === 0) continue;
  relatorio.push({ arquivo: f, trocas: r.trocas });
  if (CORRIGIR) writeFileSync(f, r.texto, "utf8");
}

const total = relatorio.reduce((s, r) => s + r.trocas, 0);
if (relatorio.length === 0) {
  console.log("✔ Acentuação OK — nenhum trecho quebrado.");
} else {
  console.log(
    `${CORRIGIR ? "Corrigidos" : "Encontrados"}: ${relatorio.length} arquivo(s), ${total} trecho(s)`,
  );
  for (const r of relatorio.sort((a, b) => b.trocas - a.trocas)) {
    console.log(`  ${String(r.trocas).padStart(4)}  ${r.arquivo}`);
  }
}

// Sobra do caso irrecuperável: o 2º byte do par virou espaço (um NBSP
// normalizado), deixando "Ã" ou "Â" grudado num espaço. É estreito de
// propósito — classes de regex ([ÃÕÇ]) e fim de palavra ("ÓRFÃ") são legítimos
// e enchiam o relatório de ruído.
const SUSPEITO = /[ÃÂ] /g;
const restos: string[] = [];
for (const f of arquivos) {
  if (f.includes("verifica-acentuacao")) continue; // este arquivo fala do assunto
  let s: string;
  try {
    s = readFileSync(f, "utf8");
  } catch {
    continue;
  }
  s.split(/\r?\n/).forEach((linha, i) => {
    SUSPEITO.lastIndex = 0;
    if (SUSPEITO.test(linha)) restos.push(`  ${f}:${i + 1}  ${linha.trim().slice(0, 90)}`);
  });
}
if (restos.length > 0) {
  console.log(`\n⚠ ${restos.length} caractere(s) solto(s) — o par se perdeu, conserte à mão:`);
  for (const r of restos) console.log(r);
}

if (!CORRIGIR && (relatorio.length > 0 || restos.length > 0)) process.exit(1);

/**
 * Encontrar onde o LoginComponent obtém o turnstile token e o usa no signIn.
 */

import "dotenv/config";

const URLS = [
  "https://sunweg.net/main.3a1fe58c4f3e737d.js",
  "https://sunweg.net/scripts.97d6a72b40bb23d0.js",
];

async function fetchTxt(u: string) {
  return await (await fetch(u, { cache: "no-store" })).text();
}

async function main() {
  for (const url of URLS) {
    console.log(`\n=== ${url} ===`);
    const body = await fetchTxt(url);
    console.log(`tamanho: ${body.length}`);

    // turnstile sitekey: começa com 0x4 ou similar - na verdade são 0x + 22 chars hex
    const tsKey = Array.from(body.matchAll(/['"`](0x[0-9a-fA-F_-]{20,30})['"`]/g)).map((m) => m[1]);
    console.log(`turnstile sitekeys (0x...): ${[...new Set(tsKey)].join(", ") || "nenhuma"}`);

    // procurar "Turnstile" como string
    for (const kw of ["Turnstile", "turnstile", "cf-turnstile", "siteverify"]) {
      let pos = 0;
      let n = 0;
      while ((pos = body.indexOf(kw, pos)) > 0 && n < 3) {
        console.log(`\n${kw} #${n + 1} pos ${pos}`);
        console.log(body.substring(Math.max(0, pos - 150), Math.min(body.length, pos + 250)));
        pos += kw.length;
        n++;
      }
    }
  }
}

main().catch(console.error);

/**
 * Pegar o index.html completo e procurar o sitekey do Turnstile + callback.
 */

import "dotenv/config";

async function main() {
  const res = await fetch("https://sunweg.net/", { cache: "no-store" });
  const html = await res.text();

  console.log(`index: ${html.length} bytes\n`);

  // Sitekey do Turnstile geralmente vai num atributo data-sitekey
  const sk = Array.from(html.matchAll(/data-sitekey\s*=\s*["']([^"']+)["']/g)).map((m) => m[1]);
  console.log(`data-sitekey: ${[...new Set(sk)].join(", ") || "nenhum"}`);

  // procurar "0x" sitekeys (formato Turnstile: 0x + 22 chars)
  const ts = Array.from(html.matchAll(/['"`](0x[0-9A-Za-z_]{20,30})['"`]/g)).map((m) => m[1]);
  console.log(`turnstile keys: ${[...new Set(ts)].join(", ") || "nenhum"}`);

  // Imprimir trecho do index
  console.log("\n=== index.html (após posição 0) ===");
  console.log(html);
}

main().catch(console.error);

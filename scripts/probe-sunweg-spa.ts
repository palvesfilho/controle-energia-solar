/**
 * Fase 0.2 — Inspecionar a SPA do sunweg.net e extrair endpoints da API.
 * Estratégia: baixar o index.html, pegar URLs de chunks JS, baixar cada chunk
 * e procurar por padrões `https://api.sunweg.net/...` ou `/api/...` referenciados.
 *
 * Executa: npx tsx scripts/probe-sunweg-spa.ts
 */

import "dotenv/config";

const ORIGIN = "https://sunweg.net";

async function main() {
  console.log("=== Sunweg SPA Probe ===\n");

  // 1) Baixar index
  const indexRes = await fetch(`${ORIGIN}/`, {
    headers: { "User-Agent": "Mozilla/5.0" },
    cache: "no-store",
  });
  const html = await indexRes.text();
  console.log(`index HTTP ${indexRes.status} — ${html.length} bytes`);

  // 2) Extrair chunks JS (src="..." | <script src=) e CSS
  const scriptMatches = Array.from(
    html.matchAll(/<script[^>]+src=["']([^"']+\.js[^"']*)["']/gi)
  ).map((m) => m[1]);
  const inlineModulesMatch = Array.from(
    html.matchAll(/<link[^>]+href=["']([^"']+\.js)["']/gi)
  ).map((m) => m[1]);
  const chunks = Array.from(new Set([...scriptMatches, ...inlineModulesMatch]));
  console.log(`\nChunks JS encontrados: ${chunks.length}`);
  chunks.forEach((c) => console.log(`  - ${c}`));

  // 3) Baixar cada chunk e procurar padrões de API
  const apiPatterns = new Set<string>();
  const interestingKeywords = [
    "autenticar",
    "usuario/login",
    "login",
    "plant",
    "planta",
    "token",
    "Bearer",
    "api.sunweg",
  ];

  for (const chunkUrl of chunks) {
    const absUrl = chunkUrl.startsWith("http") ? chunkUrl : `${ORIGIN}${chunkUrl.startsWith("/") ? "" : "/"}${chunkUrl}`;
    try {
      const r = await fetch(absUrl, { cache: "no-store" });
      if (!r.ok) {
        console.log(`\n  ✗ ${absUrl} → HTTP ${r.status}`);
        continue;
      }
      const body = await r.text();

      // Buscar URLs absolutas
      const absMatches = Array.from(body.matchAll(/https?:\/\/[a-z0-9.\-_]*sunweg[a-z0-9.\-_]*\/[^"'`\s)<>]+/gi)).map((m) => m[0]);
      // Buscar paths relativos /api/... /v2/...
      const relMatches = Array.from(body.matchAll(/["'`](\/(?:api|v2|v1)[^"'`\s)]*)["'`]/g)).map((m) => m[1]);

      [...absMatches, ...relMatches].forEach((u) => apiPatterns.add(u));

      // Highlight keywords
      const hits: string[] = [];
      for (const kw of interestingKeywords) {
        if (body.toLowerCase().includes(kw.toLowerCase())) hits.push(kw);
      }
      console.log(`\n  ${absUrl}`);
      console.log(`    ${body.length} bytes, keywords: ${hits.join(", ") || "(nenhuma)"}`);
    } catch (e) {
      console.log(`\n  ✗ ${absUrl} → ${(e as Error).message}`);
    }
  }

  console.log("\n\n=== Padrões de API encontrados ===");
  const sorted = [...apiPatterns].sort();
  sorted.forEach((u) => console.log(`  ${u}`));
  console.log(`\nTotal: ${sorted.length} padrões únicos`);
}

main().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});

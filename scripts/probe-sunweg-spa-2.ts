/**
 * Fase 0.3 — extrair strings de endpoint do main bundle do sunweg.net.
 * Executa: npx tsx scripts/probe-sunweg-spa-2.ts
 */

import "dotenv/config";

const MAIN_JS = "https://sunweg.net/main.3a1fe58c4f3e737d.js";

async function main() {
  console.log("=== Sunweg Main Bundle Probe ===\n");

  const res = await fetch(MAIN_JS, { cache: "no-store" });
  const body = await res.text();
  console.log(`Bundle: ${body.length} bytes\n`);

  // 1) URLs absolutas com sunweg
  const abs = Array.from(body.matchAll(/https?:\/\/[a-z0-9.\-_]*sunweg[a-z0-9.\-_/]+/gi))
    .map((m) => m[0])
    .map((s) => s.replace(/[)"',`;]+$/, ""));
  const absUniq = [...new Set(abs)];
  console.log(`URLs absolutas sunweg: ${absUniq.length}`);
  absUniq.slice(0, 30).forEach((u) => console.log(`  ${u}`));

  console.log("");

  // 2) Procurar caminhos típicos de API: /v2/, /api/, /usuario/, /planta/, /plant/
  const paths = Array.from(
    body.matchAll(/["'`](\/(?:v[12]|api|usuario|planta|plant|alarme|relatorio|inversor|dispositivo)[a-zA-Z0-9_\-\/]*)["'`]/g)
  ).map((m) => m[1]);
  const pathsUniq = [...new Set(paths)].sort();
  console.log(`Caminhos relativos: ${pathsUniq.length}`);
  pathsUniq.forEach((p) => console.log(`  ${p}`));

  console.log("");

  // 3) Procurar a base URL — pegar o trecho do contexto contendo "api.sunweg"
  console.log("Trechos contendo 'api.sunweg':");
  const idx = body.toLowerCase().indexOf("api.sunweg");
  if (idx > 0) {
    console.log(body.substring(Math.max(0, idx - 100), Math.min(body.length, idx + 200)));
  }
  console.log("");

  // 4) Procurar "autenticar"
  console.log("Trechos contendo 'autenticar':");
  let pos = 0;
  let count = 0;
  while ((pos = body.toLowerCase().indexOf("autenticar", pos)) > 0 && count < 5) {
    console.log(`\n--- match #${count + 1} pos ${pos} ---`);
    console.log(body.substring(Math.max(0, pos - 80), Math.min(body.length, pos + 200)));
    pos += 10;
    count++;
  }

  // 5) Procurar "login"
  console.log("\n\nTrechos contendo 'usuario/login' OU '/login':");
  let pos2 = 0;
  let count2 = 0;
  while ((pos2 = body.indexOf("/login", pos2)) > 0 && count2 < 5) {
    console.log(`\n--- /login match #${count2 + 1} pos ${pos2} ---`);
    console.log(body.substring(Math.max(0, pos2 - 80), Math.min(body.length, pos2 + 200)));
    pos2 += 6;
    count2++;
  }
}

main().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});

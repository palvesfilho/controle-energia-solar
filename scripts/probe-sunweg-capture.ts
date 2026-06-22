/**
 * Abre Chrome em sun.weg.net e fica capturando TODAS as requests por 3 min.
 * VOCÊ loga manualmente — o script só observa.
 *
 * Executa: npx tsx scripts/probe-sunweg-capture.ts
 */

import "dotenv/config";
import { chromium, type Request } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

interface CapturedReq {
  url: string;
  method: string;
  postData: string | null;
  headers: Record<string, string>;
  responseStatus?: number;
  responseBody?: string;
}

async function main() {
  console.log("=== Sunweg Browser Capture ===\n");
  console.log("Vou abrir o Chrome. VOCÊ faz o login manualmente.\n");
  console.log("O script captura TODAS as requests por 3 minutos\n");

  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });

  const page = await ctx.newPage();

  const capturedReqs: CapturedReq[] = [];

  page.on("request", (req: Request) => {
    const url = req.url();
    // Capturar tudo que NÃO seja asset estático
    if (
      url.endsWith(".png") ||
      url.endsWith(".jpg") ||
      url.endsWith(".svg") ||
      url.endsWith(".woff") ||
      url.endsWith(".woff2") ||
      url.endsWith(".ttf") ||
      url.endsWith(".css") ||
      url.endsWith(".ico")
    ) {
      return;
    }
    // Capturar XHR/fetch + POSTs + URLs com /api/ /v1/ /v2/ ou api.
    if (
      req.method() !== "GET" ||
      url.includes("/api/") ||
      url.includes("/v1/") ||
      url.includes("/v2/") ||
      url.includes("api.")
    ) {
      capturedReqs.push({
        url,
        method: req.method(),
        postData: req.postData(),
        headers: req.headers(),
      });
    }
  });

  page.on("response", async (res) => {
    const url = res.url();
    const idx = capturedReqs.findIndex((r) => r.url === url && !r.responseStatus);
    if (idx >= 0) {
      capturedReqs[idx].responseStatus = res.status();
      try {
        const bodyText = await res.text();
        capturedReqs[idx].responseBody = bodyText.slice(0, 3000);
      } catch {
        /* binário */
      }
    }
  });

  await page.goto("https://sun.weg.net/sign-in", { waitUntil: "domcontentloaded", timeout: 60000 });

  console.log("Página carregada — FAÇA O LOGIN AGORA na janela do Chrome.");
  console.log("O script vai capturar tudo por 180 segundos…\n");

  // Espera 3 minutos OU até a página fechar
  const deadline = Date.now() + 180_000;
  let alive = true;
  page.on("close", () => {
    alive = false;
  });
  while (Date.now() < deadline && alive) {
    await page.waitForTimeout(1000).catch(() => {
      alive = false;
    });
    if (capturedReqs.length > 0 && capturedReqs.length % 5 === 0) {
      // log periódico
    }
  }

  console.log(`\n\n=== ${capturedReqs.length} requests capturadas ===\n`);

  // Filtrar as mais interessantes (não-GET ou que vão pra api.sunweg ou similar)
  const interesting = capturedReqs.filter(
    (r) =>
      r.method !== "GET" ||
      r.url.includes("api.sunweg") ||
      r.url.includes("autenticacao") ||
      r.url.includes("login") ||
      r.url.includes("usuario") ||
      r.url.includes("planta")
  );

  console.log(`${interesting.length} interessantes:\n`);
  for (const r of interesting) {
    console.log(`\n${r.method} ${r.url}`);
    console.log(`  status: ${r.responseStatus ?? "?"}`);
    if (r.postData) {
      console.log(`  body: ${r.postData.slice(0, 1500)}`);
    }
    if (r.responseBody) {
      console.log(`  response (head): ${r.responseBody.slice(0, 400)}`);
    }
  }

  // Salvar
  const outFile = path.resolve("scripts/_sunweg-capture.json");
  fs.writeFileSync(outFile, JSON.stringify(capturedReqs, null, 2));
  console.log(`\nSalvo capture completo em: ${outFile}`);

  await page.waitForTimeout(3000).catch(() => {});
  await browser.close().catch(() => {});
}

main().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});

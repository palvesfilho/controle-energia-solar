/**
 * Captura via browser real: abre o sunweg.net no Chrome do sistema,
 * loga e intercepta TODAS as requests pra api.sunweg.net.
 *
 * Executa: npx tsx scripts/probe-sunweg-browser.ts
 * Requer: playwright-core (já instalado) + Chrome em C:/Program Files/Google/Chrome
 */

import "dotenv/config";
import { chromium, type Request } from "playwright-core";
import fs from "node:fs";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const USER = process.env.SUNWEG_USER_ACCOUNT!;
const PASSWORD = process.env.SUNWEG_USER_PASSWORD!;

if (!USER || !PASSWORD) {
  console.error("Defina SUNWEG_USER_ACCOUNT / SUNWEG_USER_PASSWORD no .env");
  process.exit(1);
}

interface CapturedReq {
  url: string;
  method: string;
  postData: string | null;
  headers: Record<string, string>;
  responseStatus?: number;
  responseBody?: string;
}

async function main() {
  console.log("=== Sunweg Browser Probe ===\n");
  console.log(`Chrome: ${CHROME_PATH}`);
  console.log(`User: ${USER}\n`);

  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: false, // visível pra resolver Turnstile/captcha se aparecer
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });

  const page = await ctx.newPage();

  const capturedReqs: CapturedReq[] = [];

  // Interceptar TODAS as requests POST + qualquer URL de api/sun.weg/sunweg
  page.on("request", (req: Request) => {
    const url = req.url();
    const interesting =
      url.includes("api.sunweg.net") ||
      url.includes("api.weg.net") ||
      url.includes("sun.weg.net/v2/") ||
      url.includes("sun.weg.net/api/") ||
      (req.method() === "POST" && (url.includes("weg.net") || url.includes("sunweg")));
    if (interesting) {
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
    const interesting =
      url.includes("api.sunweg.net") ||
      url.includes("api.weg.net") ||
      url.includes("sun.weg.net/v2/") ||
      url.includes("sun.weg.net/api/") ||
      url.includes("/autenticacao") ||
      url.includes("/login");
    if (interesting) {
      const idx = capturedReqs.findIndex((r) => r.url === url && !r.responseStatus);
      if (idx >= 0) {
        capturedReqs[idx].responseStatus = res.status();
        try {
          capturedReqs[idx].responseBody = (await res.text()).slice(0, 2000);
        } catch {
          /* binário */
        }
      }
    }
  });

  // Tentar /sign-in primeiro (Angular default), depois fallback pra raiz
  const loginRoutes = ["https://sun.weg.net/sign-in", "https://sun.weg.net/", "https://sunweg.net/sign-in", "https://sunweg.net/"];
  let landed = false;
  for (const url of loginRoutes) {
    console.log(`1) Tentando ${url} …`);
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(3000);
      // Procurar input visível de senha
      const hasPass = await page.locator('input[type="password"]:visible').first().isVisible({ timeout: 5000 }).catch(() => false);
      if (hasPass) {
        console.log(`   ✓ Form de login renderizado em ${page.url()}`);
        landed = true;
        break;
      }
    } catch (e) {
      console.log(`   ✗ ${(e as Error).message.slice(0, 100)}`);
    }
  }

  if (!landed) {
    console.log("   ❌ Form de login não apareceu. Deixando 60s pra interação manual.");
    await page.waitForTimeout(60000);
  }

  console.log("2) Aguardando inputs ficarem visíveis …");
  const emailLoc = page.locator('input[type="email"]:visible, input[name="usuario"]:visible, input[formcontrolname="usuario"]:visible, input[formcontrolname="email"]:visible').first();
  const passLoc = page.locator('input[type="password"]:visible').first();

  try {
    await emailLoc.waitFor({ state: "visible", timeout: 30000 });
    await passLoc.waitFor({ state: "visible", timeout: 10000 });
  } catch (e) {
    console.log(`   ❌ inputs não ficaram visíveis: ${(e as Error).message.slice(0, 150)}`);
    console.log("   Esperando 60s pra interação manual…");
    await page.waitForTimeout(60000);
  }

  console.log("3) Preenchendo credenciais …");
  await emailLoc.fill(USER);
  await passLoc.fill(PASSWORD);
  await page.waitForTimeout(1500);

  console.log("4) Clicando em Entrar …");
  const submitLoc = page.locator('button[type="submit"]:visible, button:has-text("Entrar"):visible, button:has-text("Login"):visible, button:has-text("Acessar"):visible').first();
  await submitLoc.click({ timeout: 10000 }).catch(async () => {
    console.log("   submit não clicado — tentando Enter");
    await passLoc.press("Enter").catch(() => {});
  });

  console.log("\n5) Aguardando 25s para capturar requests pós-login …");
  await page.waitForTimeout(25000);

  console.log(`\n\n=== ${capturedReqs.length} requests pra api.sunweg.net capturadas ===\n`);
  for (const r of capturedReqs) {
    console.log(`\n${r.method} ${r.url}`);
    console.log(`  status: ${r.responseStatus ?? "?"}`);
    console.log(`  headers: ${JSON.stringify(r.headers, null, 2).slice(0, 800)}`);
    if (r.postData) {
      console.log(`  body: ${r.postData.slice(0, 1500)}`);
    }
    if (r.responseBody) {
      console.log(`  response: ${r.responseBody.slice(0, 800)}`);
    }
  }

  fs.writeFileSync("/tmp/sunweg-browser-capture.json", JSON.stringify(capturedReqs, null, 2));
  console.log(`\n\nSalvo em /tmp/sunweg-browser-capture.json`);

  console.log("\nFechando navegador em 5s …");
  await page.waitForTimeout(5000);
  await browser.close();
}

main().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});

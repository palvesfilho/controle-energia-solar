/**
 * Pegar a sitekey real do reCAPTCHA do Sunweg + entender o body do signIn.
 */

import "dotenv/config";

const MAIN_JS = "https://sunweg.net/main.3a1fe58c4f3e737d.js";
const SCRIPTS_JS = "https://sunweg.net/scripts.97d6a72b40bb23d0.js";

async function fetchTxt(u: string) {
  return await (await fetch(u, { cache: "no-store" })).text();
}

async function main() {
  // 1) Buscar sitekey real (Google reCAPTCHA tem prefixo 6L + ~38 chars válidos)
  for (const url of [MAIN_JS, SCRIPTS_JS]) {
    const body = await fetchTxt(url);
    console.log(`\n=== ${url} (${body.length} bytes) ===`);
    const matches = Array.from(body.matchAll(/(?:^|[^A-Za-z0-9_])(6L[A-Za-z0-9_-]{38})(?=[^A-Za-z0-9_]|$)/g)).map(
      (m) => m[1]
    );
    console.log(`sitekeys 6L+38: ${[...new Set(matches)].join(", ") || "nenhuma"}`);

    // procurar "site_key" / "siteKey" / "sitekey" + valor
    const skVar = Array.from(body.matchAll(/site_?[Kk]ey["':\s]*[:=]\s*["']([^"']+)["']/g)).map((m) => m[1]);
    console.log(`site_key vars: ${[...new Set(skVar)].join(", ") || "nenhuma"}`);

    // ng2recaptcha provider
    const ngVal = Array.from(body.matchAll(/recaptcha-v3-site-key["'\)\]]*,\s*useValue:\s*["']([^"']+)["']/g)).map(
      (m) => m[1]
    );
    console.log(`provider useValue v3: ${ngVal.join(", ") || "nenhuma"}`);
  }

  // 2) Procurar o LoginComponent — onde signIn é chamado com body
  const body = await fetchTxt(MAIN_JS);
  console.log("\n\n=== LoginComponent: chamadas a .signIn(...) ===");
  let pos = 0;
  let n = 0;
  while ((pos = body.indexOf(".signIn(", pos)) > 0 && n < 5) {
    console.log(`\n#${n + 1} pos ${pos}`);
    console.log(body.substring(Math.max(0, pos - 500), Math.min(body.length, pos + 500)));
    pos += 8;
    n++;
  }

  // 3) procurar "execute(" no contexto de login
  console.log("\n\n=== execute(...) no bundle ===");
  let p2 = 0;
  let n2 = 0;
  while ((p2 = body.indexOf(".execute(", p2)) > 0 && n2 < 10) {
    const snippet = body.substring(Math.max(0, p2 - 150), Math.min(body.length, p2 + 300));
    if (snippet.includes("recaptcha") || snippet.includes("captcha") || snippet.includes("login")) {
      console.log(`\n#${n2 + 1} pos ${p2}`);
      console.log(snippet);
      n2++;
    }
    p2 += 9;
  }
}

main().catch(console.error);

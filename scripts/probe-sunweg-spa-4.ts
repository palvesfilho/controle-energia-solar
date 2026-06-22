/**
 * Achar o LoginComponent no bundle: que campos exatamente são enviados no
 * payload do signIn? Procurando captcha/turnstile.
 */

import "dotenv/config";

const MAIN_JS = "https://sunweg.net/main.3a1fe58c4f3e737d.js";

async function main() {
  const body = await (await fetch(MAIN_JS, { cache: "no-store" })).text();
  console.log(`Bundle: ${body.length} bytes\n`);

  // Procurar referências a turnstile e captcha
  console.log("=== TURNSTILE / CAPTCHA ===");
  for (const kw of ["turnstile", "captcha", "Turnstile", "cf-turnstile", "Captcha"]) {
    let pos = 0;
    let n = 0;
    while ((pos = body.indexOf(kw, pos)) > 0 && n < 4) {
      console.log(`\n${kw} #${n + 1} pos ${pos}`);
      console.log(body.substring(Math.max(0, pos - 100), Math.min(body.length, pos + 250)));
      pos += kw.length;
      n++;
    }
  }

  // Procurar onde 'signIn' é chamado (com parametros)
  console.log("\n\n=== CHAMADAS DE signIn() ===");
  let pos = 0;
  let n = 0;
  while ((pos = body.indexOf(".signIn(", pos)) > 0 && n < 6) {
    console.log(`\nsignIn() #${n + 1} pos ${pos}`);
    console.log(body.substring(Math.max(0, pos - 300), Math.min(body.length, pos + 300)));
    pos += 8;
    n++;
  }

  // Procurar "tipoUsuario", "idioma", "lang", "language", "tipoLogin"
  console.log("\n\n=== CAMPOS EXTRAS no payload? ===");
  for (const kw of ["tipoUsuario", "tipoLogin", "lang:", "language:", "idioma:", "captchaToken", "turnstileToken", "recaptcha"]) {
    const count = (body.match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
    console.log(`  "${kw}": ${count} ocorrências`);
  }
}

main().catch(console.error);

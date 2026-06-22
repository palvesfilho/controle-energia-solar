/**
 * Achar onloadTurnstileCallback + sitekey no main bundle.
 */

import "dotenv/config";

const MAIN_JS = "https://sunweg.net/main.3a1fe58c4f3e737d.js";

async function main() {
  const body = await (await fetch(MAIN_JS, { cache: "no-store" })).text();

  for (const kw of [
    "onloadTurnstileCallback",
    "TurnstileCallback",
    "0x4A",
    "0x4",
    "turnstile",
    "cf-turnstile",
    "sitekey",
    "site_key",
    "captchaResponse",
    "captcha_response",
    "captchaToken",
    "captcha_token",
    "cf_token",
    "cfToken",
  ]) {
    let pos = 0;
    let n = 0;
    while ((pos = body.indexOf(kw, pos)) > 0 && n < 4) {
      console.log(`\n[${kw}] #${n + 1} pos ${pos}`);
      console.log(body.substring(Math.max(0, pos - 200), Math.min(body.length, pos + 300)));
      pos += kw.length;
      n++;
    }
  }
}

main().catch(console.error);

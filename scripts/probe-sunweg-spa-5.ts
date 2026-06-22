/**
 * Achar onde o LoginComponent envia o body, e se contém reCAPTCHA token.
 */

import "dotenv/config";

const MAIN_JS = "https://sunweg.net/main.3a1fe58c4f3e737d.js";

async function main() {
  const body = await (await fetch(MAIN_JS, { cache: "no-store" })).text();

  // signIn (sem parênteses) - chamadas
  console.log("=== signIn (qq forma) ===");
  let pos = 0;
  let n = 0;
  while ((pos = body.indexOf("signIn", pos)) > 0 && n < 10) {
    console.log(`\nsignIn #${n + 1} pos ${pos}`);
    console.log(body.substring(Math.max(0, pos - 200), Math.min(body.length, pos + 300)));
    pos += 6;
    n++;
  }

  // reCaptcha
  console.log("\n\n=== execute / token reCAPTCHA (até 8) ===");
  let p2 = 0;
  let n2 = 0;
  while ((p2 = body.indexOf("recaptcha", p2)) > 0 && n2 < 8) {
    console.log(`\nrecaptcha #${n2 + 1} pos ${p2}`);
    console.log(body.substring(Math.max(0, p2 - 100), Math.min(body.length, p2 + 200)));
    p2 += 9;
    n2++;
  }

  // V3 site key
  console.log("\n\n=== sitekey ===");
  const skMatches = body.match(/6L[0-9A-Za-z_-]{38,42}/g);
  console.log(`Possíveis sitekeys: ${skMatches?.slice(0, 5) || "nenhuma"}`);

  // grecaptcha.execute
  console.log("\n\n=== grecaptcha.execute (até 5) ===");
  let p3 = 0;
  let n3 = 0;
  while ((p3 = body.indexOf("grecaptcha", p3)) > 0 && n3 < 5) {
    console.log(`\ngrecaptcha #${n3 + 1} pos ${p3}`);
    console.log(body.substring(Math.max(0, p3 - 100), Math.min(body.length, p3 + 300)));
    p3 += 10;
    n3++;
  }
}

main().catch(console.error);

/**
 * Olhar fundo no bundle pra entender o que o signIn manda no body.
 */

import "dotenv/config";

const MAIN_JS = "https://sunweg.net/main.3a1fe58c4f3e737d.js";

async function main() {
  const body = await (await fetch(MAIN_JS, { cache: "no-store" })).text();
  console.log(`Bundle: ${body.length} bytes\n`);

  // Procurar contexto em torno de "/login/autenticacao"
  const target = "/login/autenticacao";
  const idx = body.indexOf(target);
  console.log(`--- contexto em torno de "${target}" (idx=${idx}) ---`);
  console.log(body.substring(Math.max(0, idx - 600), Math.min(body.length, idx + 800)));

  // Procurar "signIn"
  console.log("\n\n--- contexto signIn ---");
  let pos = 0;
  let n = 0;
  while ((pos = body.indexOf("signIn", pos)) > 0 && n < 5) {
    console.log(`\nmatch #${n + 1} pos ${pos}`);
    console.log(body.substring(Math.max(0, pos - 100), Math.min(body.length, pos + 400)));
    pos += 6;
    n++;
  }

  // Procurar uso de MD5 ou bcrypt nos imports/strings
  console.log("\n\n--- procurando hash ---");
  for (const kw of ["md5", "sha256", "bcrypt", "CryptoJS", "crypto-js", "encrypt", "Hash"]) {
    const count = (body.match(new RegExp(kw, "gi")) || []).length;
    console.log(`  ${kw}: ${count} ocorrências`);
  }

  // Procurar contexto onde 'senha' é manipulada antes do post
  console.log("\n\n--- contexto 'senha' (até 5) ---");
  let pos2 = 0;
  let n2 = 0;
  while ((pos2 = body.indexOf("senha", pos2)) > 0 && n2 < 8) {
    const snippet = body.substring(Math.max(0, pos2 - 60), Math.min(body.length, pos2 + 120));
    if (snippet.includes("senha:") || snippet.includes(".senha") || snippet.includes('"senha"')) {
      console.log(`\nsenha #${n2 + 1} pos ${pos2}`);
      console.log(snippet);
      n2++;
    }
    pos2 += 5;
  }
}

main().catch((e) => console.error(e));

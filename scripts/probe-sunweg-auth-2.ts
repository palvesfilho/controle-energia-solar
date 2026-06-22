/**
 * Tentativa única de login após pausa, com headers idênticos ao navegador.
 */

import "dotenv/config";

const BASE = "https://api.sunweg.net/v2";

async function tryLogin(usuario: string, senha: string, label: string) {
  console.log(`\n--- ${label} ---`);
  console.log(`usuario=${usuario}  senha=${senha.replace(/./g, "*")}`);
  const res = await fetch(`${BASE}/login/autenticacao`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Origin: "https://sunweg.net",
      Referer: "https://sunweg.net/",
    },
    body: JSON.stringify({ usuario, senha }),
    cache: "no-store",
  });
  const text = await res.text();
  console.log(`HTTP ${res.status}`);
  console.log(`Body: ${text.slice(0, 400)}`);
}

async function main() {
  console.log("Pausa de 15s antes de testar (evita rate-limit residual)…");
  await new Promise((r) => setTimeout(r, 15000));

  await tryLogin("gabriel@mercopampa.com", "Panificomallet@123", "email .com");
  await new Promise((r) => setTimeout(r, 3000));
  await tryLogin("gabriel@mercopampa.com.br", "Panificomallet@123", "email .com.br (controle)");
}

main().catch(console.error);

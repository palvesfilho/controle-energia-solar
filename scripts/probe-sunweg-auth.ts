/**
 * Fase 0.4 — autenticar contra api.sunweg.net e listar plantas.
 * Executa: npx tsx scripts/probe-sunweg-auth.ts
 */

import "dotenv/config";
import fs from "node:fs";

const BASE = "https://api.sunweg.net/v2";
const USER = process.env.SUNWEG_USER_ACCOUNT!;
const PASSWORD = process.env.SUNWEG_USER_PASSWORD!;

if (!USER || !PASSWORD) {
  console.error("Defina SUNWEG_USER_ACCOUNT/SUNWEG_USER_PASSWORD no .env");
  process.exit(1);
}

async function main() {
  console.log("=== Sunweg Auth Probe ===\n");

  // 1) Login
  console.log("1) POST /v2/login/autenticacao");
  const loginBodies = [
    { usuario: USER, senha: PASSWORD },
    { email: USER, senha: PASSWORD },
    { login: USER, senha: PASSWORD },
    { usuario: USER, password: PASSWORD },
  ];

  let token: string | null = null;
  let usuarioObj: unknown = null;
  let loginShape: unknown = null;

  for (const body of loginBodies) {
    console.log(`   tentando body=${JSON.stringify(body)}`);
    const res = await fetch(`${BASE}/login/autenticacao`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0",
        Origin: "https://sunweg.net",
        Referer: "https://sunweg.net/",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const text = await res.text();
    console.log(`   HTTP ${res.status} - ${text.slice(0, 300)}`);
    try {
      const j = JSON.parse(text);
      if (j.token || j.success) {
        token = j.token;
        usuarioObj = j.usuario;
        loginShape = j;
        console.log(`   ✅ Login OK!`);
        break;
      }
    } catch {
      /* não-JSON */
    }
    console.log("");
  }

  if (!token) {
    console.log("\n❌ Não conseguiu logar.");
    return;
  }

  console.log(`\nToken (primeiros 30): ${token.substring(0, 30)}...`);
  console.log(`Usuario obj: ${JSON.stringify(usuarioObj).slice(0, 300)}\n`);

  // Salvar shape do login pra referência
  fs.writeFileSync("/tmp/sunweg-login.json", JSON.stringify(loginShape, null, 2));

  const authHeaders = {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    "X-Auth-Token": token, // backup, alguns Sunweg usam isso
    "User-Agent": "Mozilla/5.0",
    Origin: "https://sunweg.net",
    Referer: "https://sunweg.net/",
  };

  // 2) Tentar listar plantas em endpoints comuns
  const plantaCandidates = [
    "/plant/list",
    "/planta/list",
    "/planta",
    "/usuario/plantas",
    "/usuario/planta",
    "/plant",
    "/plants",
    "/dashboard/plantas",
    "/dashboard/plants",
    "/dashboard/lista-plantas",
    "/dashboard/listaplantas",
  ];

  for (const path of plantaCandidates) {
    const url = `${BASE}${path}`;
    try {
      const r = await fetch(url, { headers: authHeaders, cache: "no-store" });
      const t = await r.text();
      const ct = r.headers.get("content-type") || "";
      const isJson = ct.includes("json");
      console.log(`GET ${path} → HTTP ${r.status} (${ct.slice(0, 30)})`);
      if (r.ok && isJson) {
        console.log(`   ✅ ${t.slice(0, 600)}`);
      } else {
        console.log(`   ${t.slice(0, 200)}`);
      }
    } catch (e) {
      console.log(`GET ${path} → ✗ ${(e as Error).message}`);
    }
  }
}

main().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});

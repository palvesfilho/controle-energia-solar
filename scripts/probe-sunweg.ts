/**
 * Probe Sunweg API — descobrir base URL, endpoint de login e formato do token.
 *
 * Sunweg não publica API pública oficial; vamos sondar endpoints conhecidos do
 * portal sunweg.net / api.sunweg.net.
 *
 * Executa: npx tsx scripts/probe-sunweg.ts
 */

import "dotenv/config";

const USER = process.env.SUNWEG_USER_ACCOUNT!;
const PASSWORD = process.env.SUNWEG_USER_PASSWORD!;

if (!USER || !PASSWORD) {
  console.error("Defina SUNWEG_USER_ACCOUNT e SUNWEG_USER_PASSWORD no .env");
  process.exit(1);
}

console.log("=== Sunweg Probe ===");
console.log(`User: ${USER}`);
console.log("");

// Lista de candidatos a base URL e endpoints de login a testar.
// Ordem: começa pelo mais provável (api.sunweg.net).
const candidates: Array<{ baseUrl: string; path: string; body: object; method: "POST"; headers?: Record<string, string> }> = [
  {
    baseUrl: "https://api.sunweg.net",
    path: "/v2/api/usuario/autenticar",
    method: "POST",
    body: { usuario: USER, senha: PASSWORD },
    headers: { "Content-Type": "application/json" },
  },
  {
    baseUrl: "https://api.sunweg.net",
    path: "/api/v2/usuario/autenticar",
    method: "POST",
    body: { usuario: USER, senha: PASSWORD },
    headers: { "Content-Type": "application/json" },
  },
  {
    baseUrl: "https://api.sunweg.net",
    path: "/v2/usuario/autenticar",
    method: "POST",
    body: { usuario: USER, senha: PASSWORD },
    headers: { "Content-Type": "application/json" },
  },
  {
    baseUrl: "https://api.sunweg.net",
    path: "/v2/login",
    method: "POST",
    body: { email: USER, password: PASSWORD },
    headers: { "Content-Type": "application/json" },
  },
  {
    baseUrl: "https://api.sunweg.net",
    path: "/api/login",
    method: "POST",
    body: { email: USER, password: PASSWORD },
    headers: { "Content-Type": "application/json" },
  },
  {
    baseUrl: "https://sunweg.net",
    path: "/api/v2/usuario/autenticar",
    method: "POST",
    body: { usuario: USER, senha: PASSWORD },
    headers: { "Content-Type": "application/json" },
  },
  {
    baseUrl: "https://www.sunweg.net",
    path: "/api/v2/usuario/autenticar",
    method: "POST",
    body: { usuario: USER, senha: PASSWORD },
    headers: { "Content-Type": "application/json" },
  },
];

async function tryEndpoint(c: (typeof candidates)[number]) {
  const url = `${c.baseUrl}${c.path}`;
  try {
    const res = await fetch(url, {
      method: c.method,
      headers: {
        ...c.headers,
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; sunweg-probe/0.1)",
      },
      body: JSON.stringify(c.body),
      cache: "no-store",
    });

    const text = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* não-JSON */
    }

    return {
      ok: res.ok,
      status: res.status,
      contentType: res.headers.get("content-type") || "",
      bodyPreview: text.slice(0, 400),
      bodyParsed: json,
    };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

async function main() {
  for (const c of candidates) {
    const url = `${c.baseUrl}${c.path}`;
    console.log(`→ ${c.method} ${url}`);
    console.log(`  body: ${JSON.stringify(c.body)}`);
    const r = await tryEndpoint(c);
    if ("error" in r) {
      console.log(`  ❌ ${r.error}`);
    } else {
      console.log(`  HTTP ${r.status}  (${r.contentType})`);
      console.log(`  Body: ${r.bodyPreview.replace(/\n/g, " ")}`);
      // Detectar sucesso por keywords comuns
      const preview = r.bodyPreview.toLowerCase();
      if (
        r.ok &&
        (preview.includes("token") ||
          preview.includes("success") ||
          preview.includes("sucesso") ||
          preview.includes("autorizado"))
      ) {
        console.log(`  ✅ Possível sucesso — investigar resposta`);
      }
    }
    console.log("");
  }

  console.log("=== Probe concluído ===");
}

main().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});

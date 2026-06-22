/**
 * Diagnóstico: faz UMA request pra /api/debug-auth com o cookie atual
 * e printa o que o servidor recebeu e o que auth()/currentUser() conseguiram.
 *
 * Uso:
 *   $env:SWEEP_COOKIE="..."; npx tsx scripts/debug-auth.ts
 */
import "dotenv/config";

const BASE_URL = process.env.SWEEP_BASE_URL || "http://localhost:3000";
const COOKIE = process.env.SWEEP_COOKIE || "";
const COOKIE_HEADER = process.env.SWEEP_COOKIE_HEADER || "";

async function main() {
  const finalCookieHeader = COOKIE_HEADER || (COOKIE ? `__session=${COOKIE}` : "");
  console.log(`Cookie header: ${finalCookieHeader.length} chars (${COOKIE_HEADER ? "FULL_HEADER" : "SESSION_ONLY"})`);
  const headers: Record<string, string> = {
    "Origin": BASE_URL,
    "Referer": BASE_URL + "/",
  };
  if (finalCookieHeader) headers["Cookie"] = finalCookieHeader;

  const res = await fetch(BASE_URL + "/api/debug-auth", { headers });
  console.log(`Status: ${res.status}`);
  const json = await res.json();
  console.log(JSON.stringify(json, null, 2));
}

main().catch(console.error);

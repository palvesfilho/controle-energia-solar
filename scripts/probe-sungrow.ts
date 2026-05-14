/**
 * Sonda quais combinações de (gateway × endpoint × headers) o appkey aceita.
 */
import "dotenv/config";

const APP_KEY = process.env.SUNGROW_APP_KEY!;
const ACCESS_KEY = process.env.SUNGROW_ACCESS_KEY_VALUE!;
const USER = process.env.SUNGROW_USER_ACCOUNT!;
const PASS = process.env.SUNGROW_USER_PASSWORD!;

const GATEWAYS = [
  "https://gateway.isolarcloud.com",
  "https://gateway.isolarcloud.com.hk",
  "https://gateway.isolarcloud.eu",
  "https://gateway.isolarcloud.com.cn",
  "https://gateway.isolarcloud.us",
];

const ENDPOINTS = ["/openapi/login", "/v1/userService/login"];

const HEADER_VARIANTS: { name: string; headers: Record<string, string> }[] = [
  {
    name: "json+x-access-key+sys_code",
    headers: {
      "Content-Type": "application/json;charset=UTF-8",
      "x-access-key": ACCESS_KEY,
      "sys_code": "901",
    },
  },
  {
    name: "json+x-access-key only",
    headers: {
      "Content-Type": "application/json;charset=UTF-8",
      "x-access-key": ACCESS_KEY,
    },
  },
  {
    name: "json only (no x-access-key)",
    headers: { "Content-Type": "application/json" },
  },
];

async function probe(gw: string, ep: string, h: { name: string; headers: Record<string, string> }) {
  try {
    const res = await fetch(`${gw}${ep}`, {
      method: "POST",
      headers: h.headers,
      body: JSON.stringify({
        appkey: APP_KEY,
        user_account: USER,
        user_password: PASS,
        lang: "_pt_BR",
        sys_code: "901",
      }),
    });
    const text = await res.text();
    let body: { result_code?: unknown; result_msg?: unknown } = {};
    try { body = JSON.parse(text); } catch { /* not json */ }
    const code = body.result_code ?? `(http ${res.status})`;
    const msg = body.result_msg ?? text.substring(0, 80);
    return { code, msg };
  } catch (err) {
    return { code: "FETCH_ERR", msg: err instanceof Error ? err.message : String(err) };
  }
}

async function main() {
  console.log(`Testando ${GATEWAYS.length}x${ENDPOINTS.length}x${HEADER_VARIANTS.length} = ${GATEWAYS.length * ENDPOINTS.length * HEADER_VARIANTS.length} combinacoes\n`);
  const winners: string[] = [];
  for (const gw of GATEWAYS) {
    for (const ep of ENDPOINTS) {
      for (const h of HEADER_VARIANTS) {
        const { code, msg } = await probe(gw, ep, h);
        const tag = `${gw}${ep} [${h.name}]`;
        const isWin = code === "1" || code === 1;
        const isInteresting = isWin || (code !== "E00000" && code !== "FETCH_ERR" && !String(msg).includes("Cannot POST"));
        if (isWin) winners.push(tag);
        if (isInteresting) console.log(`✅ ${tag}\n   code=${code} msg=${msg}`);
        else console.log(`   ${tag} → ${code}`);
      }
    }
  }
  console.log(`\n=== ${winners.length} combinacoes funcionaram ===`);
  winners.forEach((w) => console.log(w));
}

main().catch(console.error);

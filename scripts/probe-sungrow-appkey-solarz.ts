/**
 * Sonda o appkey usado pelo SolarZ (EB0821A010589B52D895A7AF567EC38A)
 * em 4 combinações:
 *   1. cluster .com   v1 (sem x-access-key)
 *   2. cluster .com.hk v1 (sem x-access-key)
 *   3. cluster .com.hk v2 (com nosso x-access-key atual)
 *   4. cluster .com   v2 (com nosso x-access-key atual)
 *
 * Pra cada combinação que loga, tenta o endpoint que falha hoje:
 *   /v1/powerStationService/getPsReport
 */
import "dotenv/config";

const SOLARZ_APPKEY = "EB0821A010589B52D895A7AF567EC38A";
const SOLARZ_ACCESS_KEY = "n3qzghxqzgqhunfctx5ji2dm33qt393u";
const USER = process.env.SUNGROW_USER_ACCOUNT!;
const PASS = process.env.SUNGROW_USER_PASSWORD!;
const OUR_ACCESS_KEY = process.env.SUNGROW_ACCESS_KEY_VALUE!;

interface Combo {
  name: string;
  base: string;
  headers: Record<string, string>;
}

const combos: Combo[] = [
  {
    name: "1) .com.hk v2 (SolarZ appkey + SolarZ access-key)",
    base: "https://gateway.isolarcloud.com.hk",
    headers: {
      "Content-Type": "application/json;charset=UTF-8",
      "x-access-key": SOLARZ_ACCESS_KEY,
      "sys_code": "901",
    },
  },
  {
    name: "2) .com    v2 (SolarZ appkey + SolarZ access-key)",
    base: "https://gateway.isolarcloud.com",
    headers: {
      "Content-Type": "application/json;charset=UTF-8",
      "x-access-key": SOLARZ_ACCESS_KEY,
      "sys_code": "901",
    },
  },
  {
    name: "3) .com.hk v1 (SolarZ appkey, sem x-access-key)",
    base: "https://gateway.isolarcloud.com.hk",
    headers: { "Content-Type": "application/json;charset=UTF-8" },
  },
  {
    name: "4) .com    v1 (SolarZ appkey, sem x-access-key)",
    base: "https://gateway.isolarcloud.com",
    headers: { "Content-Type": "application/json;charset=UTF-8" },
  },
];

async function tryCombo(c: Combo) {
  console.log(`\n=== ${c.name} ===`);
  // Tenta /openapi/login primeiro, depois /v1/userService/login (legacy v1)
  for (const loginPath of ["/openapi/login", "/v1/userService/login"]) {
    try {
      const res = await fetch(c.base + loginPath, {
        method: "POST",
        headers: c.headers,
        body: JSON.stringify({
          appkey: SOLARZ_APPKEY,
          user_account: USER,
          user_password: PASS,
          lang: "_pt_BR",
          sys_code: "901",
        }),
      });
      const body = await res.json();
      const code = body.result_code;
      const msg = body.result_msg ?? "";
      console.log(`  ${loginPath} → http=${res.status} code=${code} msg=${msg}`);
      if (code === "1" || code === 1) {
        const token = body.result_data?.token;
        console.log(`  ✅ login OK → token=${String(token).substring(0, 16)}...`);
        // Tenta o endpoint que falha hoje
        const reportRes = await fetch(c.base + "/v1/powerStationService/getPsReport", {
          method: "POST",
          headers: c.headers,
          body: JSON.stringify({
            appkey: SOLARZ_APPKEY,
            token,
            ps_id: "1835379",
            report_type: "1",
            date_type: "2",
            date_id: "202604",
            start_date: "20260401",
            end_date: "20260430",
          }),
        });
        const reportBody = await reportRes.json();
        console.log(
          `  → getPsReport: code=${reportBody.result_code} msg=${reportBody.result_msg ?? ""} ` +
            `dataLen=${reportBody.result_data?.data_list?.length ?? "n/a"}`,
        );
        return; // achou caminho, não testa o segundo loginPath
      }
    } catch (e) {
      console.log(`  ${loginPath} → ERRO ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

async function main() {
  console.log(`Testando appkey do SolarZ: ${SOLARZ_APPKEY}`);
  console.log(`Usuário: ${USER}`);
  for (const c of combos) await tryCombo(c);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});

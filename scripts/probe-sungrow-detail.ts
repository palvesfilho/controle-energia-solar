/** Quick test do endpoint correto /openapi/getPowerStationDetail */
import "dotenv/config";

const APPKEY = process.env.SUNGROW_APP_KEY!;
const ACCESS = process.env.SUNGROW_ACCESS_KEY_VALUE!;
const USER = process.env.SUNGROW_USER_ACCOUNT!;
const PASS = process.env.SUNGROW_USER_PASSWORD!;
const BASE = process.env.SUNGROW_BASE_URL || "https://gateway.isolarcloud.com.hk";
const headers = { "Content-Type": "application/json;charset=UTF-8", "x-access-key": ACCESS, sys_code: "901" };

async function main() {
  const lo = await fetch(`${BASE}/openapi/login`, {
    method: "POST", headers,
    body: JSON.stringify({ appkey: APPKEY, user_account: USER, user_password: PASS, lang: "_pt_BR", sys_code: "901" }),
  });
  const tok = (await lo.json()).result_data.token;

  const r = await fetch(`${BASE}/openapi/getPowerStationDetail`, {
    method: "POST", headers,
    body: JSON.stringify({ appkey: APPKEY, token: tok, sys_code: "901", lang: "_pt_BR", ps_id: "1835379" }),
  });
  const body = await r.json();
  console.log(JSON.stringify(body, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });

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

  let page = 1;
  const matches: any[] = [];
  while (true) {
    const r = await fetch(`${BASE}/openapi/getPowerStationList`, {
      method: "POST", headers,
      body: JSON.stringify({ appkey: APPKEY, token: tok, sys_code: "901", lang: "_pt_BR", curPage: page, size: 100 }),
    });
    const body = await r.json();
    if (body.result_code !== "1" && body.result_code !== 1) {
      console.log("erro:", body);
      break;
    }
    const list = body.result_data?.pageList ?? [];
    for (const p of list) {
      const nm = String(p.ps_name || "").toUpperCase();
      if (nm.includes("OTHAVIO") || nm.includes("CECHIM") || nm.includes("MORALES") || nm.includes("OTAVIO")) {
        matches.push(p);
      }
    }
    if (list.length < 100) break;
    page++;
  }

  console.log(`achados: ${matches.length}`);
  for (const m of matches) {
    console.log(JSON.stringify({
      ps_id: m.ps_id,
      ps_name: m.ps_name,
      ps_short_name: m.ps_short_name,
      install_date: m.install_date,
      ps_status: m.ps_status,
      capacidade: m.total_capcity || m.total_capacity || m.design_capacity,
      total_energy: m.total_energy,
    }));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

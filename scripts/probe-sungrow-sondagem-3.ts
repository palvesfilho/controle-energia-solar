/**
 * Sondagem 3: por que MinuteData retorna {}?
 * - testar fuso UTC vs Brasília
 * - testar point id sem prefixo "p" (24 vs p24)
 * - testar dia/horário com geração confirmada (consultar getStationDetail today_energy)
 * - testar endpoints de fallback que podem retornar série temporal
 */
import "dotenv/config";

const APPKEY = process.env.SUNGROW_APP_KEY!;
const ACCESS = process.env.SUNGROW_ACCESS_KEY_VALUE!;
const USER = process.env.SUNGROW_USER_ACCOUNT!;
const PASS = process.env.SUNGROW_USER_PASSWORD!;
const BASE = process.env.SUNGROW_BASE_URL || "https://gateway.isolarcloud.com.hk";

const PS_KEY = "1835379_1_1_1";
const PS_ID = "1835379";

const headers = {
  "Content-Type": "application/json;charset=UTF-8",
  "x-access-key": ACCESS,
  sys_code: "901",
};

async function login(): Promise<string> {
  const r = await fetch(`${BASE}/openapi/login`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      appkey: APPKEY,
      user_account: USER,
      user_password: PASS,
      lang: "_pt_BR",
      sys_code: "901",
    }),
  });
  const b = await r.json();
  if (b.result_code !== "1" && b.result_code !== 1) throw new Error("login: " + JSON.stringify(b));
  return b.result_data.token;
}

async function call(token: string, path: string, extra: Record<string, unknown>) {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ appkey: APPKEY, token, sys_code: "901", lang: "_pt_BR", ...extra }),
  });
  return r.json();
}

const pad = (n: number) => String(n).padStart(2, "0");
function ts(y: number, m: number, d: number, h: number, mi: number, s: number) {
  return `${y}${pad(m)}${pad(d)}${pad(h)}${pad(mi)}${pad(s)}`;
}

async function main() {
  const token = await login();
  console.log("Login OK\n");

  // ----- 0. Confirmar via getStationDetail que a planta gerou ontem
  console.log("========== 0. getStationDetail ==========");
  const detail = await call(token, "/openapi/getStationDetail", { ps_id: PS_ID });
  const data = detail.result_data;
  console.log(`today_energy=${JSON.stringify(data?.today_energy)}`);
  console.log(`month_energy=${JSON.stringify(data?.month_energy)}`);
  console.log(`year_energy=${JSON.stringify(data?.year_energy)}`);
  console.log(`total_energy=${JSON.stringify(data?.total_energy)}`);
  console.log(`curr_power=${JSON.stringify(data?.curr_power)}`);
  console.log(`ps_status=${data?.ps_status}`);

  // ----- 1. Testar fuso UTC: 30/abr 16:00-18:00 UTC = 13h-15h Brasília (pico solar)
  console.log("\n========== 1. UTC 30/abr 16h-18h (pico solar BRT) ==========");
  let r = await call(token, "/openapi/getDevicePointMinuteDataList", {
    ps_key_list: [PS_KEY],
    points: "p24",
    start_time_stamp: ts(2026, 4, 30, 16, 0, 0),
    end_time_stamp: ts(2026, 4, 30, 18, 0, 0),
  });
  console.log(`code=${r.result_code} data=${JSON.stringify(r.result_data).substring(0, 500)}`);

  // ----- 2. Tentar point_id sem "p" (só "24")
  console.log("\n========== 2. point sem prefixo (\"24\") ==========");
  r = await call(token, "/openapi/getDevicePointMinuteDataList", {
    ps_key_list: [PS_KEY],
    points: "24",
    start_time_stamp: ts(2026, 4, 30, 16, 0, 0),
    end_time_stamp: ts(2026, 4, 30, 18, 0, 0),
  });
  console.log(`code=${r.result_code} data=${JSON.stringify(r.result_data).substring(0, 500)}`);

  // ----- 3. Tentar com sn_list em vez de ps_key_list
  console.log("\n========== 3. com sn_list ==========");
  r = await call(token, "/openapi/getDevicePointMinuteDataList", {
    sn_list: ["A25B2803478"],
    points: "p24",
    start_time_stamp: ts(2026, 4, 30, 16, 0, 0),
    end_time_stamp: ts(2026, 4, 30, 18, 0, 0),
  });
  console.log(`code=${r.result_code} data=${JSON.stringify(r.result_data).substring(0, 500)}`);

  // ----- 4. Tentar getDeviceMinuteRealTimeData (endpoint similar)
  console.log("\n========== 4. endpoints alternativos pra serie temporal ==========");
  const altEndpoints = [
    "/openapi/getOpenPointInfo",
    "/openapi/getOpenPointInfoByPS",
    "/openapi/getDeviceFiveMinuteData",
    "/openapi/getDeviceMinuteData",
    "/openapi/getDevicePointInfo",
    "/openapi/getOpenAccessKeyByAppKey",
    "/openapi/queryDevicePointDataDay",
    "/openapi/getKpiInfo",
    "/openapi/getPowerStationData",
  ];
  for (const ep of altEndpoints) {
    const x = await call(token, ep, {
      ps_id: PS_ID,
      ps_key_list: [PS_KEY],
      points: "p24",
      start_time_stamp: ts(2026, 4, 30, 16, 0, 0),
      end_time_stamp: ts(2026, 4, 30, 18, 0, 0),
    });
    console.log(`  ${ep.padEnd(48)} code=${String(x.result_code).padEnd(6)} msg=${(x.result_msg ?? "").substring(0, 60)}`);
  }

  // ----- 5. Tentar sem "p" + sn_list combinação
  console.log("\n========== 5. dia anterior 29/abr janela 13h-15h BRT (16h-18h UTC) ==========");
  r = await call(token, "/openapi/getDevicePointMinuteDataList", {
    ps_key_list: [PS_KEY],
    points: "p24",
    start_time_stamp: ts(2026, 4, 29, 16, 0, 0),
    end_time_stamp: ts(2026, 4, 29, 18, 0, 0),
  });
  console.log(`code=${r.result_code} data=${JSON.stringify(r.result_data).substring(0, 500)}`);

  // ----- 6. Testar com TODOS os points em janela curta
  console.log("\n========== 6. todos points juntos, 30 min ==========");
  r = await call(token, "/openapi/getDevicePointMinuteDataList", {
    ps_key_list: [PS_KEY],
    points: "p1,p2,p13,p14,p24,p83,p88",
    start_time_stamp: ts(2026, 4, 30, 16, 0, 0),
    end_time_stamp: ts(2026, 4, 30, 16, 30, 0),
  });
  console.log(`code=${r.result_code} data=${JSON.stringify(r.result_data).substring(0, 1000)}`);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});

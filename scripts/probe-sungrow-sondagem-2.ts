/**
 * Sondagem 2: refinamentos
 * - getDevicePointMinuteDataList: testar variações de payload pra fazer retornar dados (não {})
 * - bissecionar janela máxima entre 2h e 4h (2h vira a partir de qual mm:ss?)
 * - identificar qual point é "kWh diário" comparando entre real-time e MinuteData histórico
 */
import "dotenv/config";

const APPKEY = process.env.SUNGROW_APP_KEY!;
const ACCESS = process.env.SUNGROW_ACCESS_KEY_VALUE!;
const USER = process.env.SUNGROW_USER_ACCOUNT!;
const PASS = process.env.SUNGROW_USER_PASSWORD!;
const BASE = process.env.SUNGROW_BASE_URL || "https://gateway.isolarcloud.com.hk";

const PS_KEY = "1835379_1_1_1";
const DEVICE_TYPE = 1;

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
  console.log("Login OK");

  // ----- 1. Variações de payload pra getDevicePointMinuteDataList
  console.log("\n========== 1. Tentar payload variations (janela 2h, p24) ==========");
  const startTs = ts(2026, 4, 30, 12, 0, 0);
  const endTs = ts(2026, 4, 30, 14, 0, 0);

  const variations: Array<[string, Record<string, unknown>]> = [
    ["points string + ps_key_list", { ps_key_list: [PS_KEY], points: "p24", start_time_stamp: startTs, end_time_stamp: endTs }],
    ["points array + ps_key_list", { ps_key_list: [PS_KEY], points: ["p24"], start_time_stamp: startTs, end_time_stamp: endTs }],
    ["point_id_list + ps_key_list", { ps_key_list: [PS_KEY], point_id_list: ["p24"], start_time_stamp: startTs, end_time_stamp: endTs }],
    ["sn_list + points string", { sn_list: ["A25B2803478"], points: "p24", start_time_stamp: startTs, end_time_stamp: endTs }],
    ["sn_list + point_id_list", { sn_list: ["A25B2803478"], point_id_list: ["p24"], start_time_stamp: startTs, end_time_stamp: endTs }],
    ["+device_type", { device_type: DEVICE_TYPE, ps_key_list: [PS_KEY], points: "p24", start_time_stamp: startTs, end_time_stamp: endTs }],
    ["+device_type + point_id_list", { device_type: DEVICE_TYPE, ps_key_list: [PS_KEY], point_id_list: ["p24"], start_time_stamp: startTs, end_time_stamp: endTs }],
    ["points multiplos", { ps_key_list: [PS_KEY], points: "p1,p24,p83,p2", start_time_stamp: startTs, end_time_stamp: endTs }],
    ["query_type=1", { ps_key_list: [PS_KEY], points: "p24", query_type: 1, start_time_stamp: startTs, end_time_stamp: endTs }],
    ["MinuteDataList alternativo", { ps_key_list: [PS_KEY], points: "p24", begin_time: startTs, end_time: endTs }],
  ];

  for (const [label, payload] of variations) {
    const r = await call(token, "/openapi/getDevicePointMinuteDataList", payload);
    const sz = JSON.stringify(r.result_data ?? {}).length;
    const preview = JSON.stringify(r.result_data ?? {}).substring(0, 250);
    console.log(`  code=${String(r.result_code).padEnd(6)} size=${String(sz).padEnd(5)} ${label.padEnd(36)} → ${preview}`);
  }

  // ----- 2. Bisseção fina da janela: 2h00 ✅, 4h00 ❌
  console.log("\n========== 2. Bisseção janela (2h..4h, p24) ==========");
  const candidates = [
    ["2h00", 2 * 60],
    ["2h30", 2 * 60 + 30],
    ["2h45", 2 * 60 + 45],
    ["2h59", 2 * 60 + 59],
    ["3h00", 3 * 60],
    ["3h01", 3 * 60 + 1],
    ["3h15", 3 * 60 + 15],
    ["3h30", 3 * 60 + 30],
    ["4h00", 4 * 60],
  ] as const;
  for (const [label, totMin] of candidates) {
    const eh = 12 + Math.floor(totMin / 60);
    const em = totMin % 60;
    const e = ts(2026, 4, 30, eh, em, 0);
    const r = await call(token, "/openapi/getDevicePointMinuteDataList", {
      ps_key_list: [PS_KEY],
      points: "p24",
      start_time_stamp: ts(2026, 4, 30, 12, 0, 0),
      end_time_stamp: e,
    });
    const ok = r.result_code === "1" || r.result_code === 1;
    console.log(`  ${ok ? "✅" : "❌"} ${label} → code=${r.result_code} ${ok ? "" : r.result_msg}`);
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});

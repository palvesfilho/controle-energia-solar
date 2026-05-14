/**
 * Sondagem focada — antes de refatorar getDailyGeneration/getRangeTotal:
 *
 * 1. Payload completo de getDeviceRealTimeData e getPVInverterRealTimeData
 *    (descobrir todos os points retornados sem filtro)
 * 2. Bisseção da janela máxima do getDevicePointMinuteDataList
 *    (msg "the query time interval exceeds the maximum" — quanto exatamente?)
 * 3. Identificar qual point representa "kWh diário acumulado" do inversor
 */
import "dotenv/config";

const APPKEY = process.env.SUNGROW_APP_KEY!;
const ACCESS = process.env.SUNGROW_ACCESS_KEY_VALUE!;
const USER = process.env.SUNGROW_USER_ACCOUNT!;
const PASS = process.env.SUNGROW_USER_PASSWORD!;
const BASE = process.env.SUNGROW_BASE_URL || "https://gateway.isolarcloud.com.hk";

const PS_ID = "1835379";
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

// timestamp YYYYMMDDHHmmss em UTC-3 (Brasil) — datas de "ontem" pra ter dados reais
function tsBrasil(year: number, month: number, day: number, hour: number, min: number, sec: number) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}${pad(month)}${pad(day)}${pad(hour)}${pad(min)}${pad(sec)}`;
}

async function main() {
  const token = await login();
  console.log(`Login OK: ${token.substring(0, 20)}...`);

  // --- 1. getDeviceRealTimeData SEM filtro de points → ver tudo que vem
  console.log("\n========== 1a. getDeviceRealTimeData (sem point_id_list) ==========");
  const rtNoFilter = await call(token, "/openapi/getDeviceRealTimeData", {
    device_type: DEVICE_TYPE,
    ps_key_list: [PS_KEY],
  });
  console.log(`code=${rtNoFilter.result_code} msg=${rtNoFilter.result_msg}`);
  if (rtNoFilter.result_data?.device_point_list?.[0]) {
    const dp = rtNoFilter.result_data.device_point_list[0].device_point;
    const points = Object.keys(dp).filter((k) => /^p\d+$/i.test(k));
    console.log(`Points retornados (${points.length}):`, points.slice(0, 60).join(", "), points.length > 60 ? "..." : "");
    console.log(`Sample device_point:`, JSON.stringify(dp, null, 2).substring(0, 2000));
  }

  // --- 1b. getPVInverterRealTimeData (sem filtro)
  console.log("\n========== 1b. getPVInverterRealTimeData ==========");
  const pvRt = await call(token, "/openapi/getPVInverterRealTimeData", {
    ps_key_list: [PS_KEY],
  });
  console.log(`code=${pvRt.result_code} msg=${pvRt.result_msg}`);
  if (pvRt.result_data?.device_point_list?.[0]) {
    const dp = pvRt.result_data.device_point_list[0].device_point;
    const points = Object.keys(dp).filter((k) => /^p\d+$/i.test(k));
    console.log(`Points retornados (${points.length}):`, points.slice(0, 60).join(", "), points.length > 60 ? "..." : "");
    console.log(`device_point bruto:`, JSON.stringify(dp, null, 2).substring(0, 4000));
  }

  // --- 2. Bisseção da janela do getDevicePointMinuteDataList
  // Hoje é 2026-05-01. Vamos usar 2026-04-30 (ontem) que teve dia inteiro de geração.
  // Janela: testar 5min, 15min, 30min, 1h, 2h, 4h, 8h, 12h
  console.log("\n========== 2. Bisseção janela getDevicePointMinuteDataList ==========");
  const baseDate = { y: 2026, m: 4, d: 30 };
  const startHour = 12; // meio-dia, certeza de geração
  const startTs = tsBrasil(baseDate.y, baseDate.m, baseDate.d, startHour, 0, 0);

  // ponto p83 normalmente é energia diária no inversor Sungrow; tentar com p24 também
  const tryPoints = "p24";

  const windows: Array<{ label: string; minutes: number }> = [
    { label: "5min", minutes: 5 },
    { label: "15min", minutes: 15 },
    { label: "30min", minutes: 30 },
    { label: "1h", minutes: 60 },
    { label: "2h", minutes: 120 },
    { label: "4h", minutes: 240 },
    { label: "6h", minutes: 360 },
    { label: "8h", minutes: 480 },
    { label: "12h", minutes: 720 },
    { label: "24h", minutes: 1440 },
  ];

  for (const w of windows) {
    const total = baseDate.d * 24 * 60 + startHour * 60 + w.minutes;
    const endDay = baseDate.d + Math.floor(total / (24 * 60)) - baseDate.d; // simplificado
    const remaining = startHour * 60 + w.minutes;
    const endHour = Math.floor(remaining / 60);
    const endMin = remaining % 60;
    const endTs = tsBrasil(
      baseDate.y,
      baseDate.m,
      baseDate.d + (endHour >= 24 ? 1 : 0),
      endHour >= 24 ? endHour - 24 : endHour,
      endMin,
      0,
    );
    const r = await call(token, "/openapi/getDevicePointMinuteDataList", {
      ps_key_list: [PS_KEY],
      points: tryPoints,
      start_time_stamp: startTs,
      end_time_stamp: endTs,
    });
    const ok = r.result_code === "1" || r.result_code === 1;
    const dataKeys = r.result_data ? Object.keys(r.result_data).slice(0, 5) : [];
    const sampleLen = Array.isArray(r.result_data) ? r.result_data.length : (Array.isArray(r.result_data?.[PS_KEY]) ? r.result_data[PS_KEY].length : "?");
    console.log(`  ${ok ? "✅" : "❌"} window=${w.label.padEnd(6)} [${startTs}..${endTs}] code=${String(r.result_code).padEnd(6)} msg=${(r.result_msg ?? "").substring(0, 60)} keys=${JSON.stringify(dataKeys)} sample_len=${sampleLen}`);

    // primeiro sucesso: imprime payload pra entender formato
    if (ok && r.result_data) {
      console.log(`    DATA SAMPLE:`, JSON.stringify(r.result_data).substring(0, 1500));
    }
  }

  // --- 3. Tentar também getDevicePointMinuteDataList com OUTROS points (p1=power, p83=daily energy)
  console.log("\n========== 3. Quais points o MinuteData aceita? ==========");
  for (const point of ["p1", "p2", "p24", "p83", "p11", "p99", "p13", "p82", "p153"]) {
    const r = await call(token, "/openapi/getDevicePointMinuteDataList", {
      ps_key_list: [PS_KEY],
      points: point,
      start_time_stamp: tsBrasil(baseDate.y, baseDate.m, baseDate.d, 12, 0, 0),
      end_time_stamp: tsBrasil(baseDate.y, baseDate.m, baseDate.d, 12, 5, 0), // janela de 5 min
    });
    const ok = r.result_code === "1" || r.result_code === 1;
    const samp = ok && r.result_data ? JSON.stringify(r.result_data).substring(0, 200) : "";
    console.log(`  ${ok ? "✅" : "❌"} ${point.padEnd(5)} code=${String(r.result_code).padEnd(6)} ${samp}`);
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});

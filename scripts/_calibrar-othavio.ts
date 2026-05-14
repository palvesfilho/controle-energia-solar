/**
 * Calibração Sungrow — planta 1522536 (OTHAVIO CECCIM, 9.23 kWp).
 *
 * Faz a coleta canônica:
 * - 6 chamadas de 3h cobrindo 8h–00h UTC (= 5h–21h BRT) do dia 2026-04-30
 * - subamostra a cada 30 min → 32 amostras
 * - integra p1 (W) × 0.5h ÷ 1000 = kWh do dia (unidade conhecida)
 * - calcula delta(p2) do dia (último menos primeiro)
 * - Compara → fator de calibração de p2
 */
import "dotenv/config";

const APPKEY = process.env.SUNGROW_APP_KEY!;
const ACCESS = process.env.SUNGROW_ACCESS_KEY_VALUE!;
const USER = process.env.SUNGROW_USER_ACCOUNT!;
const PASS = process.env.SUNGROW_USER_PASSWORD!;
const BASE = process.env.SUNGROW_BASE_URL || "https://gateway.isolarcloud.com.hk";

const PS_ID = "1522536";
const headers = { "Content-Type": "application/json;charset=UTF-8", "x-access-key": ACCESS, sys_code: "901" };

async function login(): Promise<string> {
  const r = await fetch(`${BASE}/openapi/login`, {
    method: "POST", headers,
    body: JSON.stringify({ appkey: APPKEY, user_account: USER, user_password: PASS, lang: "_pt_BR", sys_code: "901" }),
  });
  const b = await r.json();
  if (b.result_code !== "1" && b.result_code !== 1) throw new Error("login: " + JSON.stringify(b));
  return b.result_data.token;
}

async function call(token: string, path: string, extra: Record<string, unknown>) {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST", headers,
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

  // 1. Listar inversores da planta
  const dl = await call(token, "/openapi/getDeviceList", { ps_id: PS_ID, curPage: 1, size: 50 });
  const devices = (dl.result_data?.pageList ?? []) as Array<any>;
  const inverters = devices.filter((d) => d.device_type === 1);
  console.log(`Inversores: ${inverters.length}`);
  for (const inv of inverters) {
    console.log(`  ps_key=${inv.ps_key} sn=${inv.device_sn ?? inv.sn} model=${inv.device_model ?? "-"} name=${inv.device_name}`);
  }
  if (inverters.length === 0) {
    console.log("Sem inversores. Devices brutos:", JSON.stringify(devices.slice(0, 3), null, 2));
    return;
  }

  // 2. Coletar samples de um dia: 30/abr/2026 (5h-21h BRT = 8h-00h UTC)
  const target = { y: 2026, m: 4, d: 30 };
  console.log(`\nDia alvo: ${target.y}-${pad(target.m)}-${pad(target.d)} (5h-21h BRT = 8h-00h UTC)`);

  const slices: Array<[number, number]> = [
    [8, 11], [11, 14], [14, 17], [17, 20], [20, 23], [23, 24], // 6 chamadas, última só 1h pra fechar 8h-00h
  ];

  type Sample = { time_stamp: string; p1: number | null; p2: number | null };

  for (const inv of inverters) {
    console.log(`\n--- Inversor ${inv.ps_key} (${inv.device_name}) ---`);
    const allSamples: Sample[] = [];
    for (const [h0, h1] of slices) {
      const startTs = ts(target.y, target.m, target.d, h0, 0, 0);
      const endTs = h1 === 24
        ? ts(target.y, target.m, target.d + 1, 0, 0, 0)
        : ts(target.y, target.m, target.d, h1, 0, 0);
      const r = await call(token, "/openapi/getDevicePointMinuteDataList", {
        ps_key_list: [inv.ps_key],
        points: "p1,p2",
        start_time_stamp: startTs,
        end_time_stamp: endTs,
      });
      const list = (r.result_data?.[inv.ps_key] ?? []) as Array<Record<string, string>>;
      console.log(`  ${pad(h0)}-${pad(h1)}h UTC: ${list.length} samples`);
      for (const s of list) {
        allSamples.push({
          time_stamp: s.time_stamp,
          p1: s.p1 != null ? parseFloat(s.p1) : null,
          p2: s.p2 != null ? parseFloat(s.p2) : null,
        });
      }
    }

    // Subamostragem a cada 30 min — pega timestamps :00 e :30
    const subsampled = allSamples.filter((s) => {
      const mm = s.time_stamp.substring(10, 12);
      return mm === "00" || mm === "30";
    });
    console.log(`Total samples 5min: ${allSamples.length}; subsamplados 30min: ${subsampled.length}`);

    // Integração p1 (W) × 0.5h / 1000 = kWh
    let totalKwh_p1 = 0;
    for (const s of subsampled) {
      if (s.p1 != null) totalKwh_p1 += s.p1 * 0.5 / 1000;
    }

    // Delta p2 (último com valor − primeiro com valor)
    const validP2 = allSamples.filter((s) => s.p2 != null);
    const deltaP2 = validP2.length >= 2 ? validP2[validP2.length - 1].p2! - validP2[0].p2! : 0;

    console.log(`\n  Σ(p1 × 0.5h / 1000) = ${totalKwh_p1.toFixed(2)} kWh  (32 samples ideais)`);
    console.log(`  Δ(p2) do dia        = ${deltaP2.toFixed(2)}  (unit indeterminada)`);
    console.log(`  Razão Δp2 / kWh_p1  = ${totalKwh_p1 > 0 ? (deltaP2 / totalKwh_p1).toFixed(2) : "?"}  ← fator de p2`);

    // imprimir alguns samples pra debug
    console.log(`\n  primeiros 5 samples subsamplados:`);
    for (const s of subsampled.slice(0, 5)) console.log(`    ${s.time_stamp} p1=${s.p1} p2=${s.p2}`);
    console.log(`  últimos 5 samples subsamplados:`);
    for (const s of subsampled.slice(-5)) console.log(`    ${s.time_stamp} p1=${s.p1} p2=${s.p2}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

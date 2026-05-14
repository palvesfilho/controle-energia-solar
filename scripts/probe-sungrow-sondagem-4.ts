/**
 * Sondagem 4 — fechamento:
 * (a) confirmar getStationDetail (parametro correto, payload completo)
 * (b) detectar qual point é "daily energy" — observar comportamento ao virar 00h UTC
 *     comparando samples 23:50→00:10 UTC do dia 30/abr→1/mai
 * (c) cobrir intervalo total de um dia em 8 chamadas de 3h e somar pra validar
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

  // ----- (a) getStationDetail com variações
  console.log("========== (a) getStationDetail variações ==========");
  for (const [label, payload] of [
    ["ps_id string", { ps_id: PS_ID }],
    ["ps_id num", { ps_id: Number(PS_ID) }],
    ["ps_id_list", { ps_id_list: [PS_ID] }],
    ["ps_id + sn", { ps_id: PS_ID, sn: "A25B2803478" }],
  ] as const) {
    const r = await call(token, "/openapi/getStationDetail", payload);
    const d = r.result_data;
    const has = d && (d.today_energy !== undefined || d.curr_power !== undefined);
    console.log(`  ${has ? "✅" : "❌"} ${label.padEnd(20)} code=${r.result_code} ${has ? "" : `data=${JSON.stringify(d).substring(0, 200)}`}`);
    if (has) {
      console.log(`    today_energy=${JSON.stringify(d.today_energy)}`);
      console.log(`    month_energy=${JSON.stringify(d.month_energy)}`);
      console.log(`    year_energy=${JSON.stringify(d.year_energy)}`);
      console.log(`    total_energy=${JSON.stringify(d.total_energy)}`);
      console.log(`    curr_power=${JSON.stringify(d.curr_power)}`);
    }
  }

  // ----- (b) Detectar qual point zera à 00h UTC
  // Janela 23:00 UTC dia 30 → 02:00 UTC dia 1 (3h, dentro do limite — esperar... 3h é o max)
  // Vou pegar 22:30→01:30 (3h) pra cobrir transição
  console.log("\n========== (b) Transição 22:30 UTC 30/abr → 01:30 UTC 1/mai ==========");
  const r = await call(token, "/openapi/getDevicePointMinuteDataList", {
    ps_key_list: [PS_KEY],
    points: "p1,p2,p14,p24,p83,p88",
    start_time_stamp: ts(2026, 4, 30, 22, 30, 0),
    end_time_stamp: ts(2026, 5, 1, 1, 30, 0),
  });
  console.log(`code=${r.result_code} msg=${r.result_msg ?? ""}`);
  if (r.result_data && r.result_data[PS_KEY]) {
    const arr = r.result_data[PS_KEY] as Array<Record<string, string>>;
    console.log(`samples: ${arr.length}`);
    // imprimir só samples próximos da virada
    const sample = (filterFn: (t: string) => boolean) => arr.filter((s) => filterFn(s.time_stamp));
    const transit = arr.filter((s) => {
      const t = s.time_stamp;
      return t >= "20260430233000" && t <= "20260501003000";
    });
    console.log(`transição (23:30→00:30 UTC):`);
    for (const s of transit) {
      console.log(`  ${s.time_stamp}  p1=${s.p1 ?? "-"} p2=${s.p2 ?? "-"} p14=${s.p14 ?? "-"} p24=${s.p24 ?? "-"} p83=${s.p83 ?? "-"} p88=${s.p88 ?? "-"}`);
    }
    // first/last full
    if (arr.length) {
      console.log(`primeiro: ${JSON.stringify(arr[0])}`);
      console.log(`ultimo:   ${JSON.stringify(arr[arr.length - 1])}`);
    }
  } else {
    console.log(`data: ${JSON.stringify(r.result_data).substring(0, 300)}`);
  }

  // ----- (c) Cobertura completa de 1 dia 30/abr — 8 chamadas de 3h
  console.log("\n========== (c) Dia 30/abr completo (8 × 3h em UTC) ==========");
  const slices: Array<[number, number]> = [
    [0, 3], [3, 6], [6, 9], [9, 12], [12, 15], [15, 18], [18, 21], [21, 24],
  ];
  let firstP2: number | null = null;
  let lastP2: number | null = null;
  let totalSamples = 0;
  for (const [hStart, hEnd] of slices) {
    const startTs = ts(2026, 4, 30, hStart, 0, 0);
    const endTs = hEnd === 24 ? ts(2026, 5, 1, 0, 0, 0) : ts(2026, 4, 30, hEnd, 0, 0);
    const x = await call(token, "/openapi/getDevicePointMinuteDataList", {
      ps_key_list: [PS_KEY],
      points: "p1,p2",
      start_time_stamp: startTs,
      end_time_stamp: endTs,
    });
    const list = (x.result_data?.[PS_KEY] ?? []) as Array<Record<string, string>>;
    totalSamples += list.length;
    if (list.length) {
      const f = parseFloat(list[0].p2);
      const l = parseFloat(list[list.length - 1].p2);
      if (firstP2 == null) firstP2 = f;
      lastP2 = l;
      console.log(`  ${hStart}h-${hEnd}h UTC: ${list.length} samples, p2=${f}→${l} (Δ=${(l - f).toFixed(1)})`);
    } else {
      console.log(`  ${hStart}h-${hEnd}h UTC: 0 samples`);
    }
  }
  console.log(`Total samples: ${totalSamples}, p2 do dia inteiro: ${firstP2} → ${lastP2} (Δ=${lastP2 != null && firstP2 != null ? (lastP2 - firstP2).toFixed(1) : "?"})`);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});

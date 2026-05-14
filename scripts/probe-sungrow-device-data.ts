/**
 * Sonda endpoints device-level que aceitam ps_key_list / sn_list:
 * 1. getDeviceList → pega ps_key/sn
 * 2. tenta endpoints de leitura (real-time + histórico) com nosso appkey
 *    e o do SolarZ pra comparar.
 */
import "dotenv/config";

const APPKEYS = {
  nosso: { appkey: "31EEEBBC37A7952FB57F2C6619B62737", access: "26x6b65qe21e8zbfixa483jiy3da9ajf" },
  solarz: { appkey: "EB0821A010589B52D895A7AF567EC38A", access: "n3qzghxqzgqhunfctx5ji2dm33qt393u" },
};
const BASE = "https://gateway.isolarcloud.com.hk";

function headers(accessKey: string) {
  return {
    "Content-Type": "application/json;charset=UTF-8",
    "x-access-key": accessKey,
    "sys_code": "901",
  };
}

async function login(appkey: string, accessKey: string) {
  const res = await fetch(BASE + "/openapi/login", {
    method: "POST",
    headers: headers(accessKey),
    body: JSON.stringify({
      appkey,
      user_account: process.env.SUNGROW_USER_ACCOUNT,
      user_password: process.env.SUNGROW_USER_PASSWORD,
      lang: "_pt_BR",
      sys_code: "901",
    }),
  });
  const body = await res.json();
  if (body.result_code !== "1" && body.result_code !== 1) {
    throw new Error("login: " + JSON.stringify(body));
  }
  return body.result_data.token as string;
}

async function call(appkey: string, accessKey: string, token: string, path: string, extra: Record<string, unknown>) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: headers(accessKey),
    body: JSON.stringify({ appkey, token, ...extra }),
  });
  return res.json();
}

function tag(body: any) {
  const c = body.result_code;
  const m = body.result_msg ?? "";
  if (c === "1" || c === 1) return "✅";
  if (String(m).toLowerCase().includes("unauthorized")) return "🔒";
  if (String(m).toLowerCase().includes("missing")) return "⚠️";
  return "❌";
}

async function probeWithKey(name: string, kp: { appkey: string; access: string }) {
  console.log(`\n========== Login com ${name} ==========`);
  const token = await login(kp.appkey, kp.access);
  console.log(`OK: ${token.substring(0, 16)}...`);

  // 1. Lista devices da primeira planta
  const devList = await call(kp.appkey, kp.access, token, "/openapi/getDeviceList", {
    ps_id: "1835379",
    curPage: 1,
    size: 50,
  });
  console.log(`getDeviceList: ${tag(devList)} code=${devList.result_code}`);
  const devices = devList.result_data?.pageList ?? [];
  console.log(`  devices=${devices.length}`);
  if (devices.length === 0) return;
  const first = devices[0];
  console.log(`  first device:`, JSON.stringify({
    ps_key: first.ps_key,
    sn: first.sn ?? first.device_sn,
    type: first.device_type,
    name: first.device_name,
  }));

  const psKey = first.ps_key ?? `${first.ps_id}_${first.device_type}_${first.device_code}`;
  const sn = first.sn ?? first.device_sn;

  // 2. Testar endpoints device-level
  const endpoints: Array<[string, Record<string, unknown>]> = [
    ["/openapi/getDeviceRealTimeData", { device_type: first.device_type, point_id_list: ["p24"], ps_key_list: [psKey] }],
    ["/openapi/getPVInverterRealTimeData", { ps_key_list: [psKey] }],
    ["/openapi/getDeviceModelList", {}],
    ["/openapi/getDeviceMeasurePoints", { device_type: first.device_type }],
    ["/openapi/queryDeviceList", { ps_id: "1835379", curPage: 1, size: 10 }],
    ["/openapi/queryMutiPointDataList", { ps_key_list: [psKey], points: "p24,p83" }],
    ["/openapi/getDevicePointMinuteDataList", { ps_key_list: [psKey], points: "p24", start_time_stamp: "20260430000000", end_time_stamp: "20260430235959" }],
    ["/openapi/getDevicePointDayDataList", { ps_key_list: [psKey], points: "p24", start_time_stamp: "20260401", end_time_stamp: "20260430" }],
    ["/openapi/getDevicePointMonthDataList", { ps_key_list: [psKey], points: "p24", start_time_stamp: "202601", end_time_stamp: "202612" }],
    ["/openapi/getDevicePointYearDataList", { ps_key_list: [psKey], points: "p24", start_time_stamp: "2026", end_time_stamp: "2026" }],
    ["/openapi/getDevicePointAttribute", { device_type: first.device_type }],
  ];

  for (const [path, payload] of endpoints) {
    try {
      const body = await call(kp.appkey, kp.access, token, path, payload);
      const t = tag(body);
      const dataStr = body.result_data ? JSON.stringify(body.result_data).substring(0, 120) : "";
      console.log(`  ${t} ${path.padEnd(50)} code=${String(body.result_code).padEnd(8)} msg=${(body.result_msg ?? "").substring(0, 50)} ${dataStr ? "data=" + dataStr : ""}`);
    } catch (e) {
      console.log(`  💥 ${path} → ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

async function main() {
  await probeWithKey("APPKEY_NOSSO", APPKEYS.nosso);
  await probeWithKey("APPKEY_SOLARZ", APPKEYS.solarz);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});

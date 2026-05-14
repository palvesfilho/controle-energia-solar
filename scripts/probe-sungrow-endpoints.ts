/**
 * Faz login e tenta vários nomes de endpoint para descobrir os corretos
 * no /openapi/ do gateway HK.
 */
import "dotenv/config";

const BASE = "https://gateway.isolarcloud.com.hk";
const APP_KEY = process.env.SUNGROW_APP_KEY!;
const ACCESS_KEY = process.env.SUNGROW_ACCESS_KEY_VALUE!;
const USER = process.env.SUNGROW_USER_ACCOUNT!;
const PASS = process.env.SUNGROW_USER_PASSWORD!;

const headers = {
  "Content-Type": "application/json;charset=UTF-8",
  "x-access-key": ACCESS_KEY,
  "sys_code": "901",
};

async function call(endpoint: string, body: Record<string, unknown>) {
  const res = await fetch(`${BASE}${endpoint}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ appkey: APP_KEY, sys_code: "901", lang: "_pt_BR", ...body }),
  });
  const text = await res.text();
  let parsed: { result_code?: unknown; result_msg?: unknown; result_data?: unknown } = {};
  try { parsed = JSON.parse(text); } catch { /* */ }
  return { status: res.status, code: parsed.result_code, msg: parsed.result_msg, data: parsed.result_data, raw: text };
}

async function main() {
  // 1. Login
  console.log("== Login ==");
  const login = await call("/openapi/login", { user_account: USER, user_password: PASS });
  console.log(`  code=${login.code} msg=${login.msg}`);
  if (login.code !== "1" && login.code !== 1) return;
  // @ts-expect-error result_data shape
  const token = login.data?.token;
  // @ts-expect-error
  const userId = login.data?.user_id;
  console.log(`  token=${String(token).substring(0, 20)}... user_id=${userId}\n`);

  // Helper: try a list of endpoints, report each
  async function tryEndpoints(label: string, endpoints: string[], extraParams: Record<string, unknown> = {}) {
    console.log(`== ${label} ==`);
    for (const ep of endpoints) {
      const r = await call(ep, { token, ...extraParams });
      const codeStr = r.code === "1" || r.code === 1 ? "✅ OK" : `❌ ${r.code}`;
      console.log(`  ${ep} → ${codeStr} ${r.msg ?? ""}`);
      if (r.code === "1" || r.code === 1) {
        const dataPreview = JSON.stringify(r.data).substring(0, 200);
        console.log(`      data: ${dataPreview}`);
      }
    }
    console.log("");
  }

  // 2. List stations
  const list = await call("/openapi/getPowerStationList", { token, curPage: 1, size: 5 });
  // @ts-expect-error
  const stations = list.data?.pageList ?? [];
  const sample = stations[0];
  console.log(`Total: ${stations.length}, sample ps_id: ${sample?.ps_id}\n`);
  console.log("Sample station keys:", Object.keys(sample || {}).join(", "), "\n");
  if (!sample) return;

  // 3. Detail
  await tryEndpoints("Detalhe da planta", [
    "/openapi/getPowerStationDetail",
    "/openapi/getPsDetail",
    "/openapi/getPowerStationInfo",
  ], { ps_id: sample.ps_id });

  // 4. Report (daily energy) — Sungrow OpenAPI v2 commonly uses ps_key + getKpi*
  const now = new Date();
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const start = `${yyyymm}01`;
  const end = `${yyyymm}28`;
  // Need to fetch detail to get ps_key
  const detail = await call("/openapi/getPowerStationDetail", { token, ps_id: sample.ps_id });
  // @ts-expect-error
  const psKey = detail.data?.ps_key;
  console.log(`(usando ps_key=${psKey})\n`);

  await tryEndpoints("Relatorio (energia diaria)", [
    "/openapi/getPowerStationKpi",
    "/openapi/queryPowerStationKpi",
    "/openapi/queryPowerStationKpiList",
    "/openapi/getPowerStationKpiList",
    "/openapi/getPowerStationKpiPriceInfo",
    "/openapi/getMutilPowerStationKpi",
    "/openapi/getPowerStationDayKpiList",
    "/openapi/getKpiInfoForApp",
    "/openapi/queryDeviceListForApp",
    "/openapi/queryMutiPointDataList",
    "/openapi/getOpenPointInfo",
    "/openapi/getDevicePointAttribute",
    "/openapi/queryPowerStationCurveDataChart",
    "/openapi/getPowerStationStatistics",
    "/openapi/queryPVStationKpiPriceInfo",
  ], { ps_id: sample.ps_id, ps_id_list: [sample.ps_id], ps_key: psKey, ps_key_list: psKey ? [psKey] : undefined, date_id: yyyymm, date_type: "2", query_type: "1", report_type: "1", start_time_stamp: start, end_time_stamp: end });

  // 5. Devices
  await tryEndpoints("Lista dispositivos", [
    "/openapi/getDeviceList",
    "/openapi/getDevList",
    "/openapi/queryDeviceList",
    "/openapi/getPsDeviceList",
  ], { ps_id: sample.ps_id, curPage: 1, size: 20 });

  // 6. Fault/alarms
  await tryEndpoints("Falhas/alarmes", [
    "/openapi/getDeviceFaultAlarmListByPsKey",
    "/openapi/getDeviceListAlarmList",
    "/openapi/queryDeviceListForAlarm",
    "/openapi/getDeviceListAlertWarnInfo",
    "/openapi/getRealTimeAlarmListByDeviceList",
    "/openapi/getMutilDeviceListByPs",
    "/openapi/queryFaultRealTimeAlarmList",
    "/openapi/getDeviceFaultListByPs",
    "/openapi/getMessageContent",
    "/openapi/queryRealTimeAlarm",
  ], { ps_id: sample.ps_id, ps_id_list: [sample.ps_id], ps_key: psKey, ps_key_list: psKey ? [psKey] : undefined, curPage: 1, size: 10, query_type: "1" });
}

main().catch(console.error);

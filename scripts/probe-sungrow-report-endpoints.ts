/**
 * Sonda endpoints OpenAPI v2 que possam retornar geração diária/mensal,
 * usando o appkey do SolarZ (que já confirmamos que loga OK).
 */
import "dotenv/config";

const APPKEY = "EB0821A010589B52D895A7AF567EC38A";
const ACCESS_KEY = "n3qzghxqzgqhunfctx5ji2dm33qt393u";
const BASE = "https://gateway.isolarcloud.com.hk";
const HEADERS = {
  "Content-Type": "application/json;charset=UTF-8",
  "x-access-key": ACCESS_KEY,
  "sys_code": "901",
};

async function login() {
  const res = await fetch(BASE + "/openapi/login", {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({
      appkey: APPKEY,
      user_account: process.env.SUNGROW_USER_ACCOUNT,
      user_password: process.env.SUNGROW_USER_PASSWORD,
      lang: "_pt_BR",
      sys_code: "901",
    }),
  });
  const body = await res.json();
  if (body.result_code !== "1" && body.result_code !== 1) {
    throw new Error("login falhou: " + JSON.stringify(body));
  }
  return body.result_data.token as string;
}

async function probe(token: string, path: string, payload: Record<string, unknown>) {
  try {
    const res = await fetch(BASE + path, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ appkey: APPKEY, token, ...payload }),
    });
    const body = await res.json();
    const code = body.result_code;
    const msg = body.result_msg ?? "";
    const hasData = body.result_data != null && JSON.stringify(body.result_data).length > 4;
    const tag =
      code === "1" || code === 1
        ? "✅"
        : msg.toLowerCase().includes("unauthorized")
          ? "🔒"
          : msg.toLowerCase().includes("not exist") || msg.toLowerCase().includes("does not exist")
            ? "❓"
            : "⚠️";
    console.log(`${tag} ${path.padEnd(58)} code=${String(code).padEnd(8)} ${msg}${hasData ? " [data!]" : ""}`);
  } catch (e) {
    console.log(`💥 ${path} → ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function main() {
  console.log("Login...");
  const token = await login();
  console.log(`OK: ${token.substring(0, 16)}...\n`);

  const psId = "1835379";
  const ymd = "20260430";
  const ym = "202604";

  // Rotas candidatas pra geração diária / mensal
  const candidates: Array<[string, Record<string, unknown>]> = [
    // OpenAPI v2 (caminho /openapi/...)
    ["/openapi/getStationRealKpi", { ps_id: psId }],
    ["/openapi/getKpiStationDay", { ps_id: psId, date_id: ym }],
    ["/openapi/getKpiStationMonth", { ps_id: psId, date_id: "2026" }],
    ["/openapi/getKpiStationYear", { ps_id: psId }],
    ["/openapi/getPsReport", { ps_id: psId, report_type: "1", date_type: "2", date_id: ym, start_date: ymd.substring(0, 6) + "01", end_date: ymd }],
    ["/openapi/getHouseholdStoragePsReport", { ps_id: psId, date_type: "2", date_id: ym }],
    ["/openapi/queryPowerStationInfo", { ps_id: psId }],
    ["/openapi/getStationEnergyInfo", { ps_id: psId, date_type: "2", date_id: ym }],
    ["/openapi/getStationEnergy", { ps_id: psId, date_type: "2", date_id: ym }],
    ["/openapi/getEnergyByPsId", { ps_id: psId, date_type: "2", date_id: ym }],
    ["/openapi/getStationDayReport", { ps_id: psId, date_id: ym }],
    ["/openapi/getStationMonthReport", { ps_id: psId, date_id: "2026" }],
    ["/openapi/getStationYearReport", { ps_id: psId }],
    ["/openapi/getDayPowerByPsId", { ps_id: psId, date_id: ymd }],
    ["/openapi/getDeviceRealTimeData", { ps_id: psId }],
    ["/openapi/getReportData", { ps_id: psId, date_type: "2", date_id: ym }],
    ["/openapi/getPowerStationData", { ps_id: psId, date_type: "2", date_id: ym }],
    ["/openapi/getPsKpiInfo", { ps_id: psId }],
    ["/openapi/getPowerChartDayData", { ps_id: psId, date_id: ymd }],

    // alguns conhecidos do iSolarCloud
    ["/openapi/getPVInverterRealTimeData", { ps_id: psId }],
    ["/openapi/getPowerStationForHousehold", { ps_id: psId }],
    ["/openapi/queryDeviceListForApp", { ps_id: psId }],
  ];

  for (const [path, payload] of candidates) {
    await probe(token, path, payload);
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});

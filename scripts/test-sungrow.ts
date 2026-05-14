/**
 * Script de teste - Sungrow iSolarCloud API
 * Executa: npx tsx scripts/test-sungrow.ts
 */

import "dotenv/config";

const SUNGROW_BASE_URL = process.env.SUNGROW_BASE_URL || "https://gateway.isolarcloud.com";

async function main() {
  console.log("=== Teste Sungrow iSolarCloud ===\n");
  console.log(`Base URL: ${SUNGROW_BASE_URL}`);
  console.log(`App Key: ${process.env.SUNGROW_APP_KEY?.substring(0, 8)}...`);
  console.log(`User: ${process.env.SUNGROW_USER_ACCOUNT}`);
  console.log("");

  const accessKey = process.env.SUNGROW_ACCESS_KEY_VALUE!;
  const sysCode = process.env.SUNGROW_SYS_CODE || "901";
  const baseHeaders = {
    "Content-Type": "application/json;charset=UTF-8",
    "x-access-key": accessKey,
    "sys_code": sysCode,
  };
  console.log(`Access Key: ${accessKey?.substring(0, 8)}...`);
  console.log(`Sys Code: ${sysCode}`);
  console.log("");

  // 1. Login
  console.log("1) Fazendo login (/openapi/login)...");
  const loginRes = await fetch(`${SUNGROW_BASE_URL}/openapi/login`, {
    method: "POST",
    headers: baseHeaders,
    body: JSON.stringify({
      appkey: process.env.SUNGROW_APP_KEY,
      user_account: process.env.SUNGROW_USER_ACCOUNT,
      user_password: process.env.SUNGROW_USER_PASSWORD,
      lang: "_pt_BR",
      sys_code: sysCode,
    }),
  });

  const loginBody = await loginRes.json();
  console.log(`   HTTP Status: ${loginRes.status}`);
  console.log(`   result_code: ${loginBody.result_code}`);
  console.log(`   result_msg: ${loginBody.result_msg || "(vazio)"}`);

  if (loginBody.result_code !== "1" && loginBody.result_code !== 1) {
    console.log("\n   ❌ Login falhou!");
    console.log("   Resposta completa:", JSON.stringify(loginBody, null, 2));
    return;
  }

  const token = loginBody.result_data?.token;
  const userId = loginBody.result_data?.user_id;
  console.log(`   ✅ Login OK! user_id: ${userId}`);
  console.log(`   Token: ${token?.substring(0, 20)}...`);
  console.log("");

  // 2. Listar plantas
  console.log("2) Listando plantas...");
  const stationsRes = await fetch(`${SUNGROW_BASE_URL}/v1/powerStationService/getPsList`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      appkey: process.env.SUNGROW_APP_KEY,
      token,
      curPage: 1,
      size: 20,
    }),
  });

  const stationsBody = await stationsRes.json();
  console.log(`   result_code: ${stationsBody.result_code}`);

  if (stationsBody.result_code !== "1" && stationsBody.result_code !== 1) {
    console.log("   ❌ Falha ao listar plantas!");
    console.log("   Resposta:", JSON.stringify(stationsBody, null, 2));
    return;
  }

  const stations = stationsBody.result_data?.pageList || [];
  const total = stationsBody.result_data?.rowCount || 0;
  console.log(`   ✅ Total de plantas: ${total}`);
  console.log("");

  if (stations.length === 0) {
    console.log("   Nenhuma planta encontrada.");
    return;
  }

  // Mostrar primeiras 5 plantas
  console.log("   Primeiras plantas:");
  for (const s of stations.slice(0, 5)) {
    console.log(`   - [${s.ps_id}] ${s.ps_name} | Capacidade: ${s.design_capacity || s.installed_capacity || "?"} kWp | Status: ${s.ps_status}`);
  }
  console.log("");

  // 3. Pegar detalhes da primeira planta
  const testStation = stations[0];
  console.log(`3) Detalhes da planta: ${testStation.ps_name} (ps_id: ${testStation.ps_id})...`);

  const detailRes = await fetch(`${SUNGROW_BASE_URL}/v1/powerStationService/getPsDetail`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      appkey: process.env.SUNGROW_APP_KEY,
      token,
      ps_id: testStation.ps_id,
    }),
  });

  const detailBody = await detailRes.json();

  if (detailBody.result_code === "1" || detailBody.result_code === 1) {
    const d = detailBody.result_data;
    console.log(`   ✅ Detalhes obtidos!`);
    console.log(`   Nome: ${d.ps_name}`);
    console.log(`   Capacidade: ${d.design_capacity || d.installed_capacity} kWp`);
    console.log(`   Energia hoje: ${d.today_energy} kWh`);
    console.log(`   Energia mes: ${d.month_energy} kWh`);
    console.log(`   Energia ano: ${d.year_energy} kWh`);
    console.log(`   Energia total: ${d.total_energy} kWh`);
    console.log(`   Potencia atual: ${d.curr_power} W`);
    console.log(`   Status: ${d.ps_status}`);
  } else {
    console.log("   ❌ Falha ao obter detalhes!");
    console.log("   Resposta:", JSON.stringify(detailBody, null, 2));
  }
  console.log("");

  // 4. Geração diária do mês atual
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const lastDay = new Date(year, month, 0).getDate();
  const startDate = `${year}${String(month).padStart(2, "0")}01`;
  const endDate = `${year}${String(month).padStart(2, "0")}${String(lastDay).padStart(2, "0")}`;

  console.log(`4) Geracao diaria de ${String(month).padStart(2, "0")}/${year} para ps_id: ${testStation.ps_id}...`);

  const dailyRes = await fetch(`${SUNGROW_BASE_URL}/v1/powerStationService/getPsReport`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      appkey: process.env.SUNGROW_APP_KEY,
      token,
      ps_id: testStation.ps_id,
      report_type: "1",
      date_type: "2",
      date_id: `${year}${String(month).padStart(2, "0")}`,
      start_date: startDate,
      end_date: endDate,
    }),
  });

  const dailyBody = await dailyRes.json();

  if (dailyBody.result_code === "1" || dailyBody.result_code === 1) {
    const days = dailyBody.result_data?.data_list || [];
    console.log(`   ✅ ${days.length} dias de dados`);
    if (days.length > 0) {
      console.log("   Ultimos 5 dias:");
      for (const d of days.slice(-5)) {
        console.log(`   - ${d.date_id}: ${d.energy ?? 0} kWh`);
      }
    }
  } else {
    console.log("   ❌ Falha ao obter geracao diaria!");
    console.log("   result_code:", dailyBody.result_code);
    console.log("   result_msg:", dailyBody.result_msg);
    // Mostrar resposta completa para debug
    console.log("   Resposta:", JSON.stringify(dailyBody, null, 2));
  }

  console.log("\n=== Teste concluido ===");
}

main().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});

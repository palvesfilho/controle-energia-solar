/**
 * Script de teste completo - Huawei FusionSolar
 * Executa: npx tsx scripts/test-huawei.ts
 */

import "dotenv/config";

const BASE_URL = process.env.HUAWEI_BASE_URL || "https://la5.fusionsolar.huawei.com";
const THIRD_DATA = `${BASE_URL}/thirdData`;

let xsrfToken = "";

async function login() {
  console.log("1) Fazendo login...");
  console.log(`   URL: ${BASE_URL}`);
  console.log(`   User: ${process.env.HUAWEI_USERNAME}`);

  const res = await fetch(`${THIRD_DATA}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userName: process.env.HUAWEI_USERNAME,
      systemCode: process.env.HUAWEI_PASSWORD,
    }),
  });

  console.log(`   HTTP Status: ${res.status}`);

  // Extrair XSRF-TOKEN do cookie
  const setCookie = res.headers.get("set-cookie") || "";
  const xsrfMatch = setCookie.match(/XSRF-TOKEN=([^;]+)/);

  const body = await res.json();
  console.log(`   failCode: ${body.failCode}`);
  console.log(`   success: ${body.success}`);
  console.log(`   message: ${body.message || "(vazio)"}`);

  if (xsrfMatch) {
    xsrfToken = xsrfMatch[1];
    console.log(`   XSRF-TOKEN: ${xsrfToken.substring(0, 20)}...`);
  } else if (body.data && typeof body.data === "string") {
    xsrfToken = body.data;
    console.log(`   Token (body): ${xsrfToken.substring(0, 20)}...`);
  } else {
    // Tentar todos os headers
    console.log("\n   Headers da resposta:");
    res.headers.forEach((value, key) => {
      console.log(`   ${key}: ${value}`);
    });

    if (body.data) {
      console.log(`\n   body.data:`, JSON.stringify(body.data).substring(0, 200));
    }
  }

  if (body.failCode === 0 || body.success === true) {
    console.log("   ✅ Login OK!");
    return true;
  } else {
    console.log("   ❌ Login falhou!");
    console.log("   Resposta completa:", JSON.stringify(body, null, 2));
    return false;
  }
}

async function apiFetch(endpoint: string, body: Record<string, unknown> = {}) {
  const res = await fetch(`${THIRD_DATA}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "XSRF-TOKEN": xsrfToken,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }

  return res.json();
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║          TESTE COMPLETO - HUAWEI FUSIONSOLAR                ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  // 1. Login
  const loggedIn = await login();
  if (!loggedIn || !xsrfToken) {
    console.log("\n⛔ Nao foi possivel continuar sem login.");
    return;
  }
  console.log("");

  // 2. Listar plantas
  console.log("2) Listando plantas...");
  try {
    const stationsBody = await apiFetch("/getStationList", { pageNo: 1, pageSize: 100 });

    if (stationsBody.failCode !== 0 && stationsBody.success !== true) {
      console.log("   ❌ Falha ao listar plantas!");
      console.log("   Resposta:", JSON.stringify(stationsBody, null, 2));
      return;
    }

    const stations = stationsBody.data?.list || [];
    const total = stationsBody.data?.total || 0;
    console.log(`   ✅ Total de plantas: ${total}`);

    if (stations.length === 0) {
      console.log("   Nenhuma planta encontrada.");
      return;
    }

    console.log("\n   Primeiras plantas:");
    for (const s of stations.slice(0, 5)) {
      console.log(`   - [${s.stationCode}] ${s.stationName} | ${s.capacity ? (s.capacity / 1000).toFixed(2) + " kWp" : "?"} | ${s.stationAddr || ""}`);
    }
    console.log("");

    // 3. KPIs em tempo real da primeira planta
    const testStation = stations[0];
    console.log(`3) KPIs tempo real: ${testStation.stationName} (${testStation.stationCode})...`);

    const kpiBody = await apiFetch("/getStationRealKpi", {
      stationCodes: testStation.stationCode,
    });

    if (kpiBody.data && kpiBody.data.length > 0) {
      const kpi = kpiBody.data[0];
      const d = kpi.dataItemMap || {};
      const healthMap: Record<number, string> = { 1: "DESCONECTADO", 2: "FALHA", 3: "NORMAL" };

      console.log("   ✅ KPIs obtidos!");
      console.log(`   Status:          ${healthMap[d.real_health_state] || d.real_health_state}`);
      console.log(`   Energia hoje:    ${d.day_power ?? 0} kWh`);
      console.log(`   Energia mes:     ${d.month_power ?? 0} kWh`);
      console.log(`   Energia ano:     ${d.year_power ?? 0} kWh`);
      console.log(`   Energia total:   ${d.total_power ?? 0} kWh`);
      console.log(`   Capacidade:      ${d.installed_capacity ?? 0} kWp`);
    } else {
      console.log("   ⚠️ Sem dados de KPI");
      console.log("   Resposta:", JSON.stringify(kpiBody, null, 2).substring(0, 500));
    }
    console.log("");

    // 4. Geração diária do mês atual
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const collectTime = new Date(year, month - 1, 1, 0, 0, 0).getTime();

    console.log(`4) Geracao diaria ${String(month).padStart(2, "0")}/${year}...`);

    const dailyBody = await apiFetch("/getKpiStationDay", {
      stationCodes: testStation.stationCode,
      collectTime,
    });

    if (dailyBody.data && dailyBody.data.length > 0) {
      const meses = ["", "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
        "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

      console.log(`\n   📅 ${meses[month]} ${year}:`);
      console.log("     Dia   |  Geracao (kWh)");
      console.log("     ------|---------------");

      let totalMes = 0;
      let diasComDados = 0;

      for (const item of dailyBody.data) {
        const date = new Date(item.collectTime);
        const dia = String(date.getDate()).padStart(2, "0");
        const kWh = item.dataItemMap?.inverter_power ?? 0;
        if (kWh > 0) {
          totalMes += kWh;
          diasComDados++;
          const bar = "█".repeat(Math.min(Math.round(kWh / 5), 30));
          console.log(`     ${dia}    | ${kWh.toFixed(2).padStart(8)} ${bar}`);
        }
      }

      console.log(`     ------|---------------`);
      console.log(`     TOTAL | ${totalMes.toFixed(2).padStart(8)} kWh (${diasComDados} dias)`);
      if (diasComDados > 0) {
        console.log(`     MEDIA | ${(totalMes / diasComDados).toFixed(2).padStart(8)} kWh/dia`);
      }
    } else {
      console.log("   ⚠️ Sem dados diarios");
      console.log("   Resposta:", JSON.stringify(dailyBody, null, 2).substring(0, 500));
    }
    console.log("");

    // 5. Geração mensal do ano
    console.log(`5) Geracao mensal ${year}...`);
    const monthlyCollectTime = new Date(year, 0, 1, 0, 0, 0).getTime();

    const monthlyBody = await apiFetch("/getKpiStationMonth", {
      stationCodes: testStation.stationCode,
      collectTime: monthlyCollectTime,
    });

    if (monthlyBody.data && monthlyBody.data.length > 0) {
      const mesesLabel = ["", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
        "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

      console.log("     Mes   |  Geracao (kWh)");
      console.log("     ------|---------------");

      let totalAno = 0;
      for (const item of monthlyBody.data) {
        const date = new Date(item.collectTime);
        const m = date.getMonth() + 1;
        const kWh = item.dataItemMap?.inverter_power ?? 0;
        if (kWh > 0) {
          totalAno += kWh;
          const bar = "█".repeat(Math.min(Math.round(kWh / 50), 30));
          console.log(`     ${mesesLabel[m].padEnd(5)} | ${kWh.toFixed(2).padStart(10)} ${bar}`);
        }
      }
      console.log(`     ------|---------------`);
      console.log(`     TOTAL | ${totalAno.toFixed(2).padStart(10)} kWh`);
    } else {
      console.log("   ⚠️ Sem dados mensais");
      console.log("   Resposta:", JSON.stringify(monthlyBody, null, 2).substring(0, 500));
    }

    // Resumo
    console.log("\n\n╔══════════════════════════════════════════════════════════════╗");
    console.log("║  RESULTADO: Integracao Huawei FusionSolar                   ║");
    console.log("╠══════════════════════════════════════════════════════════════╣");
    console.log(`║  Planta:    ${testStation.stationName.substring(0, 47).padEnd(47)} ║`);
    console.log(`║  Code:      ${testStation.stationCode.padEnd(47)} ║`);
    console.log(`║  Total:     ${String(total).padEnd(47)} plantas na conta ║`);
    console.log(`║  Para usar: cadastrar cliente com:                          ║`);
    console.log(`║    plataformaMonitoramento = "HUAWEI"                       ║`);
    console.log(`║    monitoramentoPlantId    = "${testStation.stationCode}"    ║`);
    console.log("╚══════════════════════════════════════════════════════════════╝");

  } catch (err) {
    console.log("   ❌ Erro:", err instanceof Error ? err.message : err);
  }
}

main().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});

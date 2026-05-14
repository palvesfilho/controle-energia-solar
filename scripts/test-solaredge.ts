/**
 * Script de teste - SolarEdge Monitoring API
 * Executa: npx tsx scripts/test-solaredge.ts
 */

import "dotenv/config";

const BASE_URL = "https://monitoringapi.solaredge.com";
const API_KEY = process.env.SOLAREDGE_API_KEY;

async function main() {
  console.log("=== Teste SolarEdge Monitoring API ===\n");
  console.log(`API Key: ${API_KEY?.substring(0, 8)}...`);
  console.log("");

  if (!API_KEY) {
    console.log("❌ SOLAREDGE_API_KEY nao definida no .env");
    return;
  }

  // 1. Listar sites
  console.log("1) Listando sites...");
  const sitesRes = await fetch(
    `${BASE_URL}/sites/list?api_key=${API_KEY}&size=20`,
    { headers: { Accept: "application/json" } }
  );

  console.log(`   HTTP Status: ${sitesRes.status}`);

  if (!sitesRes.ok) {
    const errText = await sitesRes.text();
    console.log(`   ❌ Falha! Resposta: ${errText}`);
    return;
  }

  const sitesBody = await sitesRes.json();
  const sites = sitesBody.sites?.site || [];
  const total = sitesBody.sites?.count || 0;
  console.log(`   ✅ Total de sites: ${total}`);
  console.log("");

  if (sites.length === 0) {
    console.log("   Nenhum site encontrado.");
    return;
  }

  // Mostrar primeiros 5 sites
  console.log("   Sites encontrados:");
  for (const s of sites.slice(0, 5)) {
    console.log(`   - [${s.id}] ${s.name} | ${s.peakPower} kWp | Status: ${s.status} | ${s.location?.city || ""}, ${s.location?.state || ""}`);
  }
  console.log("");

  // 2. Overview do primeiro site
  const testSite = sites[0];
  console.log(`2) Overview do site: ${testSite.name} (siteId: ${testSite.id})...`);

  const overviewRes = await fetch(
    `${BASE_URL}/site/${testSite.id}/overview?api_key=${API_KEY}`,
    { headers: { Accept: "application/json" } }
  );

  if (overviewRes.ok) {
    const overviewBody = await overviewRes.json();
    const ov = overviewBody.overview;
    console.log(`   ✅ Overview obtido!`);
    console.log(`   Potencia atual: ${ov.currentPower?.power ?? 0} W`);
    console.log(`   Energia hoje: ${((ov.lastDayData?.energy ?? 0) / 1000).toFixed(2)} kWh`);
    console.log(`   Energia mes: ${((ov.lastMonthData?.energy ?? 0) / 1000).toFixed(2)} kWh`);
    console.log(`   Energia ano: ${((ov.lastYearData?.energy ?? 0) / 1000).toFixed(2)} kWh`);
    console.log(`   Energia total (lifetime): ${((ov.lifeTimeData?.energy ?? 0) / 1000).toFixed(2)} kWh`);
    console.log(`   Ultima atualizacao: ${ov.lastUpdateTime}`);
  } else {
    console.log(`   ❌ Falha: HTTP ${overviewRes.status}`);
    const errText = await overviewRes.text();
    console.log(`   Resposta: ${errText}`);
  }
  console.log("");

  // 3. Geração diária do mês atual
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  console.log(`3) Geracao diaria de ${String(month).padStart(2, "0")}/${year} para siteId: ${testSite.id}...`);

  const energyRes = await fetch(
    `${BASE_URL}/site/${testSite.id}/energy?api_key=${API_KEY}&timeUnit=DAY&startDate=${startDate}&endDate=${endDate}`,
    { headers: { Accept: "application/json" } }
  );

  if (energyRes.ok) {
    const energyBody = await energyRes.json();
    const values = energyBody.energy?.values || [];
    const withData = values.filter((v: { value: number | null }) => v.value != null && v.value > 0);
    console.log(`   ✅ ${withData.length} dias com geracao`);
    if (withData.length > 0) {
      console.log("   Ultimos 5 dias com dados:");
      for (const v of withData.slice(-5)) {
        console.log(`   - ${v.date}: ${(v.value / 1000).toFixed(2)} kWh`);
      }
    }
  } else {
    console.log(`   ❌ Falha: HTTP ${energyRes.status}`);
    const errText = await energyRes.text();
    console.log(`   Resposta: ${errText}`);
  }

  console.log("\n=== Teste concluido ===");
}

main().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});

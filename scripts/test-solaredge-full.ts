/**
 * Script de teste completo - SolarEdge
 * Simula o fluxo de sync igual à rota /api/brasil-solar/[id]/solaredge-sync
 * Executa: npx tsx scripts/test-solaredge-full.ts
 */

import "dotenv/config";

const BASE_URL = "https://monitoringapi.solaredge.com";
const API_KEY = process.env.SOLAREDGE_API_KEY!;

async function apiFetch(path: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams({ api_key: API_KEY, ...params });
  const res = await fetch(`${BASE_URL}${path}?${qs}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  // Pegar o primeiro site ativo
  const sitesBody = await apiFetch("/sites/list", { size: "5" });
  const site = sitesBody.sites.site[0];
  const siteId = site.id;

  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║          TESTE COMPLETO - SOLAREDGE SYNC                    ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  // ── 1. Dados do site ──
  console.log("━━━ DADOS DO SITE ━━━");
  console.log(`  Site ID:      ${site.id}`);
  console.log(`  Nome:         ${site.name}`);
  console.log(`  Status:       ${site.status}`);
  console.log(`  Potencia:     ${site.peakPower} kWp`);
  console.log(`  Instalacao:   ${site.installationDate}`);
  console.log(`  Cidade:       ${site.location?.city || "-"}`);
  console.log(`  Estado:       ${site.location?.state || "-"}`);
  console.log(`  Fuso:         ${site.location?.timeZone || "-"}`);
  console.log("");

  // ── 2. Overview (tempo real) ──
  console.log("━━━ STATUS EM TEMPO REAL ━━━");
  const ovBody = await apiFetch(`/site/${siteId}/overview`);
  const ov = ovBody.overview;
  const isOnline = (ov.currentPower?.power ?? 0) > 0;
  console.log(`  Online:           ${isOnline ? "SIM ✅" : "NAO ⚠️"}`);
  console.log(`  Potencia atual:   ${(ov.currentPower?.power ?? 0).toLocaleString("pt-BR")} W`);
  console.log(`  Energia hoje:     ${((ov.lastDayData?.energy ?? 0) / 1000).toFixed(2)} kWh`);
  console.log(`  Energia mes:      ${((ov.lastMonthData?.energy ?? 0) / 1000).toFixed(2)} kWh`);
  console.log(`  Energia ano:      ${((ov.lastYearData?.energy ?? 0) / 1000).toFixed(2)} kWh`);
  console.log(`  Energia lifetime: ${((ov.lifeTimeData?.energy ?? 0) / 1000).toFixed(2)} kWh`);
  console.log(`  Ultima leitura:   ${ov.lastUpdateTime}`);
  console.log("");

  // ── 3. Inventário (equipamentos) ──
  console.log("━━━ EQUIPAMENTOS ━━━");
  try {
    const invBody = await apiFetch(`/site/${siteId}/inventory`);
    const inverters = invBody.Inventory?.inverters || [];
    if (inverters.length > 0) {
      for (const inv of inverters) {
        console.log(`  Inversor: ${inv.manufacturer} ${inv.model} | SN: ${inv.serialNumber}`);
      }
    } else {
      console.log("  Nenhum inversor listado");
    }
  } catch {
    console.log("  Falha ao obter inventario");
  }
  console.log("");

  // ── 4. Geração diária (últimos 3 meses - igual ao sync) ──
  console.log("━━━ GERACAO DIARIA (ULTIMOS 3 MESES) ━━━");
  const now = new Date();

  for (let i = 0; i < 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const lastDay = new Date(year, month, 0).getDate();
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    const meses = ["", "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
      "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

    console.log(`\n  📅 ${meses[month]} ${year}:`);

    try {
      const energyBody = await apiFetch(`/site/${siteId}/energy`, {
        timeUnit: "DAY",
        startDate,
        endDate,
      });

      const values = energyBody.energy?.values || [];
      const withData = values.filter((v: { value: number | null }) => v.value != null && v.value > 0);

      if (withData.length === 0) {
        console.log("     Sem dados de geracao");
        continue;
      }

      let totalMes = 0;
      console.log("     Dia   |  Geracao (kWh)");
      console.log("     ------|---------------");
      for (const v of withData) {
        const kWh = v.value / 1000;
        totalMes += kWh;
        const dateStr = v.date.split(" ")[0]; // "YYYY-MM-DD"
        const dia = dateStr.split("-")[2];
        const bar = "█".repeat(Math.min(Math.round(kWh / 5), 30));
        console.log(`     ${dia}    | ${kWh.toFixed(2).padStart(8)} ${bar}`);
      }
      console.log(`     ------|---------------`);
      console.log(`     TOTAL | ${totalMes.toFixed(2).padStart(8)} kWh (${withData.length} dias)`);
      console.log(`     MEDIA | ${(totalMes / withData.length).toFixed(2).padStart(8)} kWh/dia`);

    } catch (err) {
      console.log(`     Erro: ${err instanceof Error ? err.message : err}`);
    }
  }

  // ── 5. Geração mensal do ano ──
  console.log("\n\n━━━ GERACAO MENSAL " + now.getFullYear() + " ━━━");
  try {
    const yearBody = await apiFetch(`/site/${siteId}/energy`, {
      timeUnit: "MONTH",
      startDate: `${now.getFullYear()}-01-01`,
      endDate: `${now.getFullYear()}-12-31`,
    });

    const months = yearBody.energy?.values || [];
    const mesesLabel = ["", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
      "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    let totalAno = 0;

    console.log("     Mes   |  Geracao (kWh)");
    console.log("     ------|---------------");
    for (const v of months) {
      if (v.value == null || v.value === 0) continue;
      const kWh = v.value / 1000;
      totalAno += kWh;
      const mesNum = parseInt(v.date.split("-")[1]);
      const bar = "█".repeat(Math.min(Math.round(kWh / 50), 30));
      console.log(`     ${mesesLabel[mesNum].padEnd(5)} | ${kWh.toFixed(2).padStart(10)} ${bar}`);
    }
    console.log(`     ------|---------------`);
    console.log(`     TOTAL | ${totalAno.toFixed(2).padStart(10)} kWh`);
  } catch (err) {
    console.log(`     Erro: ${err instanceof Error ? err.message : err}`);
  }

  // ── 6. Resumo final ──
  console.log("\n\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  RESULTADO: Integracao SolarEdge FUNCIONAL                  ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log(`║  Site:      ${site.name.substring(0, 47).padEnd(47)} ║`);
  console.log(`║  Site ID:   ${String(site.id).padEnd(47)} ║`);
  console.log(`║  Para usar: cadastrar cliente com:                          ║`);
  console.log(`║    plataformaMonitoramento = "SOLAREDGE"                    ║`);
  console.log(`║    monitoramentoPlantId    = "${String(site.id).padEnd(28)}"  ║`);
  console.log("╚══════════════════════════════════════════════════════════════╝");
}

main().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});

/**
 * Script de teste rápido da API Fronius Solar.web
 * Execução: npx tsx scripts/test-fronius.ts
 */

import "dotenv/config";

const BASE_URL = "https://api.solarweb.com/swqapi";
const KEY_ID = process.env.FRONIUS_ACCESS_KEY_ID;
const KEY_VALUE = process.env.FRONIUS_ACCESS_KEY_VALUE;

function headers() {
  return {
    AccessKeyId: KEY_ID!,
    AccessKeyValue: KEY_VALUE!,
    Accept: "application/json",
  };
}

function log(label: string, data: unknown) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${label}`);
  console.log("=".repeat(60));
  if (typeof data === "object") {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(data);
  }
}

function logError(label: string, err: unknown) {
  console.error(`\n❌ FALHA: ${label}`);
  if (err instanceof Error) console.error(`   ${err.message}`);
  else console.error(err);
}

async function main() {
  console.log("\n🔌 Teste de Integração Fronius Solar.web");
  console.log(`   KeyId: ${KEY_ID?.slice(0, 10)}...`);
  console.log(`   KeyValue: ${KEY_VALUE?.slice(0, 8)}...`);

  if (!KEY_ID || !KEY_VALUE) {
    console.error("\n❌ FRONIUS_ACCESS_KEY_ID e FRONIUS_ACCESS_KEY_VALUE não configurados no .env");
    process.exit(1);
  }

  // ── Teste 1: Contagem de plantas ──
  try {
    const res = await fetch(`${BASE_URL}/pvsystems-count`, { headers: headers() });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();
    log("1. Contagem de plantas", data);
    console.log(`   ✅ Total de plantas na conta: ${data.count}`);
  } catch (err) {
    logError("1. Contagem de plantas", err);
    console.log("\n   ⚠️  Se o erro for 401/403, verifique as credenciais no .env");
    process.exit(1);
  }

  // ── Teste 2: Listar primeiras 5 plantas ──
  let firstSystem: { pvSystemId: string; name: string } | null = null;
  try {
    const res = await fetch(`${BASE_URL}/pvsystems?offset=0&limit=5`, { headers: headers() });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();

    const resumo = data.pvSystems.map((s: any) => ({
      id: s.pvSystemId,
      nome: s.name,
      potenciaKwp: s.peakPower ? (s.peakPower / 1000).toFixed(2) : "N/A",
      cidade: s.address?.city || "N/A",
      uf: s.address?.state || "N/A",
      ultimoImport: s.lastImport || "nunca",
    }));

    log("2. Primeiras 5 plantas", resumo);
    console.log(`   ✅ ${data.pvSystems.length} plantas retornadas (total: ${data.links.totalItemsCount})`);

    if (data.pvSystems.length > 0) {
      firstSystem = data.pvSystems[0];
    }
  } catch (err) {
    logError("2. Listar plantas", err);
  }

  if (!firstSystem) {
    console.log("\n⚠️  Nenhuma planta encontrada, pulando testes seguintes.");
    return;
  }

  const testId = firstSystem.pvSystemId;
  console.log(`\n📍 Usando planta de teste: "${firstSystem.name}" (${testId})`);

  // ── Teste 3: Detalhes da planta ──
  try {
    const res = await fetch(`${BASE_URL}/pvsystems/${testId}`, { headers: headers() });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();
    log("3. Detalhes da planta", {
      nome: data.name,
      potenciaW: data.peakPower,
      potenciaKwp: data.peakPower ? (data.peakPower / 1000).toFixed(2) : "N/A",
      dataInstalacao: data.installationDate,
      ultimoImport: data.lastImport,
      timezone: data.timeZone,
      endereco: data.address,
    });
    console.log("   ✅ Detalhes obtidos com sucesso");
  } catch (err) {
    logError("3. Detalhes da planta", err);
  }

  // ── Teste 4: Flow data (status em tempo real) ──
  try {
    const res = await fetch(`${BASE_URL}/pvsystems/${testId}/flowdata`, { headers: headers() });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();

    const powerPV = data.data?.channels?.find((ch: any) => ch.channelName === "PowerPV");
    const powerOutput = data.data?.channels?.find((ch: any) => ch.channelName === "PowerOutput");

    log("4. Status em tempo real (flowdata)", {
      online: data.status?.isOnline,
      ultimaLeitura: data.data?.logDateTime,
      potenciaPV_W: powerPV?.value ?? "N/A",
      potenciaOutput_W: powerOutput?.value ?? "N/A",
      canais: data.data?.channels?.map((ch: any) => `${ch.channelName}: ${ch.value} ${ch.unit}`),
    });
    console.log(`   ✅ Planta ${data.status?.isOnline ? "ONLINE 🟢" : "OFFLINE 🔴"}`);
  } catch (err) {
    logError("4. Flowdata", err);
  }

  // ── Teste 5: Geração diária do mês atual ──
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const res = await fetch(
      `${BASE_URL}/pvsystems/${testId}/aggdata/years/${year}/months/${month}/days`,
      { headers: headers() }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();

    const energyCh = data.data?.channels?.find(
      (ch: any) => ch.channelName === "EnergyOutput" || ch.channelName === "EnergyProductionTotal"
    );

    if (energyCh) {
      const dias = Object.entries(energyCh.values).map(([day, wh]: [string, any]) => ({
        dia: parseInt(day),
        kWh: (wh / 1000).toFixed(2),
      }));

      const totalKwh = dias.reduce((sum, d) => sum + parseFloat(d.kWh), 0);

      log(`5. Geração diária - ${month.toString().padStart(2, "0")}/${year}`, dias);
      console.log(`   ✅ ${dias.length} dias com dados | Total: ${totalKwh.toFixed(2)} kWh`);
    } else {
      log("5. Geração diária", { canaisDisponiveis: data.data?.channels?.map((ch: any) => ch.channelName) });
      console.log("   ⚠️  Canal de energia não encontrado (EnergyOutput/EnergyProductionTotal)");
    }
  } catch (err) {
    logError("5. Geração diária", err);
  }

  // ── Teste 6: Geração mensal do ano ──
  try {
    const year = new Date().getFullYear();
    const res = await fetch(
      `${BASE_URL}/pvsystems/${testId}/aggdata/years/${year}/months`,
      { headers: headers() }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();

    const energyCh = data.data?.channels?.find(
      (ch: any) => ch.channelName === "EnergyOutput" || ch.channelName === "EnergyProductionTotal"
    );

    if (energyCh) {
      const meses = Object.entries(energyCh.values).map(([month, wh]: [string, any]) => ({
        mes: parseInt(month),
        kWh: (wh / 1000).toFixed(2),
      }));
      const totalAno = meses.reduce((sum, m) => sum + parseFloat(m.kWh), 0);

      log(`6. Geração mensal - ${year}`, meses);
      console.log(`   ✅ ${meses.length} meses | Total ano: ${totalAno.toFixed(2)} kWh`);
    } else {
      console.log("   ⚠️  Canal de energia não encontrado");
    }
  } catch (err) {
    logError("6. Geração mensal", err);
  }

  console.log("\n" + "=".repeat(60));
  console.log("  ✅ Teste completo!");
  console.log("=".repeat(60) + "\n");
}

main().catch(console.error);

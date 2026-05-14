/** Smoke-test contra planta com 2 inversores — Zuleika 1741002. */
import "dotenv/config";
import { getDailySamples, getDailyGeneration } from "../src/lib/sungrow";

const PS_ID = "1741002";

async function main() {
  console.log("=== getDailySamples 2026-04-30 (2 inversores) ===");
  const samples = await getDailySamples(PS_ID, 2026, 4, 30);
  let totalKwhFromSamples = 0;
  for (const inv of samples) {
    const validP1 = inv.samples.filter((s) => s.p1 != null && s.p1 > 0);
    const lastP1 = validP1.length > 0 ? validP1[validP1.length - 1].p1! : 0;
    const kwh = lastP1 / 1000;
    totalKwhFromSamples += kwh;
    console.log(`Inversor ${inv.psKey} (${inv.deviceName}): ${inv.samples.length} samples, último p1=${lastP1} → ${kwh.toFixed(2)} kWh`);
  }
  console.log(`Soma manual dos 2 inversores: ${totalKwhFromSamples.toFixed(2)} kWh`);

  console.log("\n=== getDailyGeneration abril/2026 ===");
  const daily = await getDailyGeneration(PS_ID, 2026, 4);
  console.log(`Dias com geração: ${daily.length}`);
  let monthTotal = 0;
  for (const d of daily) {
    monthTotal += d.energyKwh;
    console.log(`  ${d.day}/04: ${d.energyKwh.toFixed(2)} kWh`);
  }
  console.log(`Total: ${monthTotal.toFixed(2)} kWh`);

  // Confere: soma manual do 30/04 deve bater com o que veio em getDailyGeneration
  const dia30 = daily.find((d) => d.day === 30);
  console.log(`\nValidação 30/04: getDailySamples=${totalKwhFromSamples.toFixed(2)} vs getDailyGeneration=${dia30?.energyKwh.toFixed(2) ?? "?"}`);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });

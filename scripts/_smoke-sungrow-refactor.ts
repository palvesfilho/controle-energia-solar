/**
 * Smoke-test da refatoração Sungrow contra OTHAVIO CECCIM (ps_id=1522536).
 * Valores esperados:
 * - 30/04/2026: ~25,3 kWh (validado pelo usuário)
 */
import "dotenv/config";
import { getDailyGeneration, getMonthlyTotal, getRangeTotal, getDailySamples } from "../src/lib/sungrow";

const PS_ID = "1522536";

async function main() {
  console.log("=== getDailySamples 2026-04-30 ===");
  const samples = await getDailySamples(PS_ID, 2026, 4, 30);
  for (const inv of samples) {
    console.log(`Inversor ${inv.psKey} (${inv.deviceName}): ${inv.samples.length} samples`);
    if (inv.samples.length > 0) {
      const first = inv.samples[0];
      const last = inv.samples[inv.samples.length - 1];
      console.log(`  primeiro: ${first.timeStamp} p1=${first.p1} p2=${first.p2}`);
      console.log(`  último:   ${last.timeStamp} p1=${last.p1} p2=${last.p2}`);
    }
  }

  console.log("\n=== getDailyGeneration abril/2026 ===");
  const daily = await getDailyGeneration(PS_ID, 2026, 4);
  console.log(`Dias com geração: ${daily.length}`);
  for (const d of daily) {
    console.log(`  ${d.day}/04: ${d.energyKwh.toFixed(2)} kWh`);
  }

  console.log("\n=== getMonthlyTotal abril/2026 ===");
  const month = await getMonthlyTotal(PS_ID, 2026, 4);
  console.log(`Total: ${month.totalKwh.toFixed(2)} kWh em ${month.days} dias`);

  console.log("\n=== getRangeTotal 25/04 a 30/04 ===");
  const range = await getRangeTotal(PS_ID, new Date(Date.UTC(2026, 3, 25)), new Date(Date.UTC(2026, 4, 1)));
  console.log(`Range total: ${range.totalKwh.toFixed(2)} kWh em ${range.days} dias`);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });

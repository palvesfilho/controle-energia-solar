/**
 * Confirma se /v1/powerStationService/getPsReport ainda retorna E900
 * (Unauthorized access) com o appkey atual da Solve.
 */
import "dotenv/config";
import { getAllStations, getDailyGeneration, getActiveAlerts } from "../src/lib/sungrow";

async function main() {
  const all = await getAllStations();
  if (all.length === 0) {
    console.log("Nenhuma planta — abortando.");
    return;
  }
  const first = all[0];
  const psId = String(first.ps_id);
  console.log(`Planta de teste: [${psId}] ${first.ps_name}\n`);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  console.log(`== getDailyGeneration ${month}/${year} ==`);
  try {
    const days = await getDailyGeneration(psId, year, month);
    console.log(`OK — ${days.length} dias retornados`);
    if (days.length > 0) {
      console.log(`Primeiro: ${days[0].date.toISOString()} → ${days[0].energyKwh} kWh`);
    }
  } catch (e) {
    console.log(`FALHOU: ${e instanceof Error ? e.message : String(e)}`);
  }

  console.log(`\n== getActiveAlerts ==`);
  try {
    const alerts = await getActiveAlerts(psId);
    console.log(`OK — ${alerts.length} alertas`);
  } catch (e) {
    console.log(`FALHOU: ${e instanceof Error ? e.message : String(e)}`);
  }
}

main().catch((err) => {
  console.error("ERRO:", err);
  process.exit(1);
});

/**
 * Testa o cliente Sungrow do projeto end-to-end:
 * - login + getAllStations + getStationDetail + getPlantStatus
 */
import "dotenv/config";
import { getAllStations, getStationDetail, getPlantStatus, getStationCapacityKwp } from "../src/lib/sungrow";

async function main() {
  console.log("== getAllStations ==");
  const all = await getAllStations();
  console.log(`Total plantas: ${all.length}`);
  for (const s of all.slice(0, 5)) {
    const cap = getStationCapacityKwp(s);
    console.log(`  [${s.ps_id}] ${s.ps_name} | cap: ${cap.toFixed(1)} kWp | status: ${s.ps_status} | loc: ${s.ps_location ?? "-"}`);
  }
  if (all.length === 0) return;

  console.log("\n== getStationDetail (primeira planta) ==");
  const first = all[0];
  const detail = await getStationDetail(String(first.ps_id));
  console.log(`  design_capacity: ${detail.design_capacity}`);
  console.log(`  ps_key: ${detail.ps_key}`);

  console.log("\n== getPlantStatus (primeira planta) ==");
  const status = await getPlantStatus(String(first.ps_id));
  console.log(JSON.stringify(status, null, 2));
}

main().catch((err) => {
  console.error("ERRO:", err);
  process.exit(1);
});

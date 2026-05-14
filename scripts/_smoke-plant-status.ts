import "dotenv/config";
import { getPlantStatus } from "../src/lib/sungrow";

async function main() {
  for (const psId of ["1522536", "1741002"]) {
    console.log(`\n=== getPlantStatus(${psId}) ===`);
    const t0 = Date.now();
    const status = await getPlantStatus(psId);
    console.log(`tempo: ${Date.now() - t0}ms`);
    console.log(JSON.stringify(status, null, 2));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

/** Acha uma planta Sungrow com 2+ inversores pra validar a soma da refatoração. */
import "dotenv/config";
import { getAllStations, getDeviceList } from "../src/lib/sungrow";

async function main() {
  const stations = await getAllStations();
  console.log(`Total plantas: ${stations.length}`);

  const candidates: Array<{ psId: string; name: string; nInverters: number; devs: any[] }> = [];
  for (const s of stations) {
    const psId = String(s.ps_id);
    try {
      const devs = await getDeviceList(psId);
      const inverters = devs.filter((d) => Number((d as any).device_type ?? d.dev_type) === 1);
      if (inverters.length >= 2) {
        candidates.push({ psId, name: s.ps_name, nInverters: inverters.length, devs: inverters });
        console.log(`  📍 ${psId} ${s.ps_name}: ${inverters.length} inversores`);
        if (candidates.length >= 5) break;
      }
    } catch (e) {
      // ignora
    }
  }

  console.log(`\nCandidatos com 2+ inversores: ${candidates.length}`);
  if (candidates.length > 0) {
    const c = candidates[0];
    console.log(`\nPrimeiro candidato: ${c.psId} ${c.name}`);
    for (const inv of c.devs) {
      console.log(`  ps_key=${(inv as any).ps_key} sn=${(inv as any).device_sn} name=${(inv as any).device_name}`);
    }
  }
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });

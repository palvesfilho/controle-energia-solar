/**
 * Smoke-test da persistência de samples — usa Othavio (Sungrow ps=1522536)
 * mas precisa de uma Plant local pra associar. Cria uma plant temporária
 * de teste, persiste, lê de volta, depois remove a plant.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { persistDailySamples, readDailySamples } from "../src/lib/sungrow-persist";

async function main() {
  // Cria plant de teste
  const plant = await prisma.plant.create({
    data: { name: "_TESTE_SUNGROW_PERSIST_", inversorMarca: "Sungrow" },
  });
  console.log(`Plant temp criada: ${plant.id}`);

  try {
    console.log("\n=== persistDailySamples 2026-04-30 ===");
    const t0 = Date.now();
    const res = await persistDailySamples(plant.id, "1522536", 2026, 4, 30);
    console.log(`tempo: ${Date.now() - t0}ms`);
    console.log(JSON.stringify(res, null, 2));

    console.log("\n=== readDailySamples (relendo do DB) ===");
    const back = await readDailySamples(plant.id, new Date(Date.UTC(2026, 3, 30)));
    for (const inv of back) {
      console.log(`Inversor ${inv.psKey}: ${inv.samples.length} samples`);
      if (inv.samples.length) {
        console.log(`  primeiro: ${inv.samples[0].timeStamp} p1=${inv.samples[0].p1} p2=${inv.samples[0].p2}`);
        console.log(`  último:   ${inv.samples[inv.samples.length-1].timeStamp} p1=${inv.samples[inv.samples.length-1].p1}`);
      }
    }

    console.log("\n=== persistDailySamples (rerun — idempotente) ===");
    const res2 = await persistDailySamples(plant.id, "1522536", 2026, 4, 30);
    console.log(`samples upserted: ${res2.samplesUpserted} (esperado: igual ao 1º run)`);
    const count = await prisma.inverterSample.count({ where: { plantId: plant.id } });
    console.log(`total no DB pra essa plant: ${count} (esperado: ${res.samplesUpserted}, sem duplicar)`);
  } finally {
    // limpeza
    await prisma.inverterSample.deleteMany({ where: { plantId: plant.id } });
    await prisma.plant.delete({ where: { id: plant.id } });
    console.log("\n[limpeza] plant + samples removidos");
    await prisma.$disconnect();
  }
}

main().catch(async (e) => {
  console.error("FATAL:", e);
  await prisma.$disconnect();
  process.exit(1);
});

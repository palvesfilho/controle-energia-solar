import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { persistDailySamples } from "../src/lib/sungrow-persist";

async function main() {
  const client = await prisma.brasilSolarClient.findFirst({
    where: { monitoramentoPlantId: "1522536" },
    select: { id: true, nome: true, monitoramentoPlantId: true },
  });
  if (!client?.monitoramentoPlantId) {
    console.error("Othavio não encontrado");
    process.exit(1);
  }

  console.log(`Coletando 7 dias para ${client.nome} (${client.id})...`);
  const t0 = Date.now();
  let total = 0;
  for (let i = 1; i <= 7; i++) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const r = await persistDailySamples(
      client.id,
      client.monitoramentoPlantId,
      d.getUTCFullYear(),
      d.getUTCMonth() + 1,
      d.getUTCDate(),
    );
    total += r.samplesUpserted;
    console.log(`  ${d.toISOString().slice(0, 10)}: ${r.samplesUpserted} samples`);
  }
  console.log(`Total: ${total} samples em ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

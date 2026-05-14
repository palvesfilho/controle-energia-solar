import { prisma } from "../src/lib/prisma";

async function main() {
  // Sungrow + Plant vinculada
  const linked = await prisma.brasilSolarClient.findMany({
    where: {
      plataformaMonitoramento: "SUNGROW",
      plantId: { not: null },
      monitoramentoPlantId: { not: null },
    },
    select: {
      id: true,
      nome: true,
      monitoramentoPlantId: true,
      plant: {
        select: {
          id: true,
          name: true,
          consumerUnits: { select: { id: true }, take: 1 },
          rateioVersions: { select: { id: true, vigenteAPartirDe: true }, orderBy: { vigenteAPartirDe: "desc" }, take: 1 },
          reports: { select: { ano: true, mes: true, status: true }, orderBy: [{ ano: "desc" }, { mes: "desc" }], take: 3 },
        },
      },
    },
    take: 10,
  });

  console.log(`Sungrow + Plant vinculada: ${linked.length} clientes`);
  for (const c of linked) {
    const plant = c.plant!;
    const ucs = plant.consumerUnits.length;
    const hasRateio = plant.rateioVersions.length > 0;
    const reports = plant.reports.length;
    console.log(`  ${c.id.substring(0, 10)}... ${c.nome.substring(0, 30).padEnd(30)} ps_id=${c.monitoramentoPlantId} UCs=${ucs} rateio=${hasRateio ? "✓" : "✗"} reports=${reports}`);
    if (plant.reports.length > 0) {
      console.log(`    último: ${plant.reports[0].ano}-${String(plant.reports[0].mes).padStart(2, "0")} (${plant.reports[0].status})`);
    }
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

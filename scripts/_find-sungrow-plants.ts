import { prisma } from "../src/lib/prisma";

async function main() {
  // Plants que tem inversorMarca Sungrow OU que tem alguma BSC vinculada Sungrow
  const plants = await prisma.plant.findMany({
    where: {
      OR: [
        { inversorMarca: { contains: "ungrow" } }, // case-sensitive: Sungrow
        { monitoringClients: { some: { plataformaMonitoramento: "SUNGROW" } } },
      ],
    },
    select: {
      id: true,
      name: true,
      inversorMarca: true,
      consumerUnits: { select: { id: true } },
      rateioVersions: { select: { id: true }, orderBy: { vigenteAPartirDe: "desc" }, take: 1 },
      reports: { select: { ano: true, mes: true, status: true }, orderBy: [{ ano: "desc" }, { mes: "desc" }], take: 1 },
      monitoringClients: { select: { id: true, nome: true, monitoramentoPlantId: true, plataformaMonitoramento: true } },
    },
    take: 20,
  });

  console.log(`Plants com Sungrow: ${plants.length}`);
  for (const p of plants) {
    const ucs = p.consumerUnits.length;
    const hasRateio = p.rateioVersions.length > 0;
    const lastReport = p.reports[0];
    const bscWithSungrow = p.monitoringClients.filter((b) => b.plataformaMonitoramento === "SUNGROW" && b.monitoramentoPlantId);
    console.log(`  ${p.id.substring(0, 10)}... ${p.name.substring(0, 35).padEnd(35)} marca=${p.inversorMarca?.substring(0, 10) ?? "-"} UCs=${ucs} rateio=${hasRateio ? "✓" : "✗"} lastReport=${lastReport ? `${lastReport.ano}-${String(lastReport.mes).padStart(2, "0")}` : "-"} BSCs=${bscWithSungrow.length}`);
    for (const b of bscWithSungrow) {
      console.log(`    BSC: ${b.nome} (ps_id=${b.monitoramentoPlantId})`);
    }
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

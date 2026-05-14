import { prisma } from "../src/lib/prisma";

async function main() {
  const plants = await prisma.plant.findMany({
    where: {
      reports: { some: {} },
    },
    select: {
      id: true,
      name: true,
      inversorMarca: true,
      consumerUnits: { select: { id: true } },
      monitoringClients: {
        select: { id: true, nome: true, plataformaMonitoramento: true, monitoramentoPlantId: true },
      },
      reports: {
        select: { id: true, ano: true, mes: true, status: true, valorBrutoGerador: true },
        orderBy: [{ ano: "desc" }, { mes: "desc" }],
        take: 2,
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 15,
  });

  console.log(`Plants com relatórios: ${plants.length}`);
  for (const p of plants) {
    const bscPlatforms = [...new Set(p.monitoringClients.map((b) => b.plataformaMonitoramento).filter(Boolean))].join(",");
    const last = p.reports[0];
    console.log(`  ${p.id.substring(0, 10)}... ${p.name.substring(0, 30).padEnd(30)} marca=${(p.inversorMarca ?? "-").substring(0, 12).padEnd(12)} UCs=${p.consumerUnits.length} BSCs=${p.monitoringClients.length} BSCmarcas=${bscPlatforms || "-"} último=${last ? `${last.ano}-${String(last.mes).padStart(2, "0")} (${last.status})` : "-"}`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

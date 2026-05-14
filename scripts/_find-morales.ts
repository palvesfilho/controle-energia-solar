import { prisma } from "../src/lib/prisma";

async function main() {
  // BSCs com Morales/Cechim
  const bscs = await prisma.brasilSolarClient.findMany({
    where: {
      OR: [
        { nome: { contains: "MORALES" } },
        { nome: { contains: "Morales" } },
        { nome: { contains: "morales" } },
        { nome: { contains: "CECHIM" } },
        { nome: { contains: "Cechim" } },
        { nome: { contains: "cechim" } },
      ],
    },
    include: {
      plant: { include: { consumerUnits: true, rateioVersions: true, reports: { take: 3 } } },
      proprietario: true,
    },
  });

  console.log(`BSCs encontrados: ${bscs.length}`);
  for (const b of bscs) {
    console.log(`\nID: ${b.id}`);
    console.log(`Nome: ${b.nome}`);
    console.log(`CPF: ${b.cpfCnpj}`);
    console.log(`Platform: ${b.plataformaMonitoramento} ps_id: ${b.monitoramentoPlantId}`);
    console.log(`plantId: ${b.plantId}`);
    console.log(`Plant: ${b.plant ? `${b.plant.name} (UCs=${b.plant.consumerUnits.length}, rateios=${b.plant.rateioVersions.length}, reports=${b.plant.reports.length})` : "NULL"}`);
    console.log(`Proprietário: ${b.proprietario?.nome ?? "-"}`);
    console.log(`createdAt=${b.createdAt.toISOString()} updatedAt=${b.updatedAt.toISOString()}`);
  }

  // Plants com Morales/Cechim
  const plants = await prisma.plant.findMany({
    where: {
      OR: [
        { name: { contains: "MORALES" } }, { name: { contains: "Morales" } }, { name: { contains: "morales" } },
        { name: { contains: "CECHIM" } }, { name: { contains: "Cechim" } }, { name: { contains: "cechim" } },
        { name: { contains: "OTHAVI" } }, { name: { contains: "Othavi" } }, { name: { contains: "othavi" } },
      ],
    },
    include: { consumerUnits: true, monitoringClients: true, rateioVersions: true, reports: true },
  });
  console.log(`\nPlants encontradas: ${plants.length}`);
  for (const p of plants) {
    console.log(`\n${p.id} ${p.name}`);
    console.log(`  marca=${p.inversorMarca ?? "-"} regra=${p.regraInstalacao ?? "-"}`);
    console.log(`  UCs (${p.consumerUnits.length}): ${p.consumerUnits.map((u) => u.codigoUc).join(", ")}`);
    console.log(`  BSCs (${p.monitoringClients.length}): ${p.monitoringClients.map((b) => b.nome).join(", ")}`);
    console.log(`  Rateios: ${p.rateioVersions.length}, Reports: ${p.reports.length}`);
  }

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

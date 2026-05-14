import { prisma } from "../src/lib/prisma";

async function main() {
  const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Plants criadas/atualizadas recentemente
  const plants = await prisma.plant.findMany({
    where: { OR: [{ createdAt: { gte: sevenDaysAgo } }, { updatedAt: { gte: sevenDaysAgo } }] },
    select: {
      id: true,
      name: true,
      inversorMarca: true,
      regraInstalacao: true,
      dataAssinaturaContrato: true,
      createdAt: true,
      updatedAt: true,
      consumerUnits: { select: { id: true, codigoUc: true } },
      rateioVersions: { select: { id: true, vigenteAPartirDe: true } },
      monitoringClients: { select: { id: true, nome: true, plataformaMonitoramento: true, monitoramentoPlantId: true } },
      reports: { select: { ano: true, mes: true, status: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });

  console.log(`=== Plants criadas/atualizadas nos últimos 7 dias: ${plants.length} ===`);
  for (const p of plants) {
    console.log(`\n${p.name} (${p.id})`);
    console.log(`  marca=${p.inversorMarca ?? "-"} regra=${p.regraInstalacao ?? "-"} assinatura=${p.dataAssinaturaContrato?.toISOString().slice(0, 10) ?? "-"}`);
    console.log(`  criada=${p.createdAt.toISOString().slice(0, 10)} atualizada=${p.updatedAt.toISOString().slice(0, 10)}`);
    console.log(`  UCs (${p.consumerUnits.length}): ${p.consumerUnits.map((u) => u.codigoUc).join(", ") || "-"}`);
    console.log(`  Rateios: ${p.rateioVersions.length} versões`);
    console.log(`  BSCs (${p.monitoringClients.length}): ${p.monitoringClients.map((b) => `${b.nome} [${b.plataformaMonitoramento}/${b.monitoramentoPlantId}]`).join(", ") || "-"}`);
    console.log(`  Relatórios: ${p.reports.length}`);
  }

  // BSCs criados/atualizados recentemente
  const bscs = await prisma.brasilSolarClient.findMany({
    where: { OR: [{ createdAt: { gte: sevenDaysAgo } }, { updatedAt: { gte: sevenDaysAgo } }] },
    select: {
      id: true,
      nome: true,
      plataformaMonitoramento: true,
      monitoramentoPlantId: true,
      plantId: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });
  console.log(`\n=== BSCs criados/atualizados nos últimos 7 dias: ${bscs.length} ===`);
  for (const b of bscs) {
    console.log(`  ${b.id.substring(0, 12)} ${b.nome} platform=${b.plataformaMonitoramento ?? "-"} ps_id=${b.monitoramentoPlantId ?? "-"} plantId=${b.plantId ? b.plantId.substring(0, 12) : "NULL"} updated=${b.updatedAt.toISOString().slice(0, 19)}`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

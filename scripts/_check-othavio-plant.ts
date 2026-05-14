import { prisma } from "../src/lib/prisma";

async function main() {
  const othavio = await prisma.brasilSolarClient.findFirst({
    where: { monitoramentoPlantId: "1522536" },
    select: {
      id: true,
      nome: true,
      plantId: true,
      plant: {
        select: {
          id: true,
          name: true,
          inversorMarca: true,
          regraInstalacao: true,
          dataAssinaturaContrato: true,
        },
      },
      monitoringLogs: { select: { id: true }, take: 1 },
    },
  });
  console.log(JSON.stringify(othavio, null, 2));
  if (othavio?.plantId) {
    const reports = await prisma.monthlyReport.findMany({
      where: { plantId: othavio.plantId },
      select: { id: true, ano: true, mes: true, status: true, valorTotal: true, valorBrutoGerador: true },
      orderBy: [{ ano: "desc" }, { mes: "desc" }],
      take: 6,
    });
    console.log("\nÚltimos relatórios:");
    console.log(JSON.stringify(reports, null, 2));
    const ucs = await prisma.consumerUnit.count({ where: { plantId: othavio.plantId } });
    console.log(`\nUCs vinculadas: ${ucs}`);
  } else {
    console.log("\nSem Plant vinculada — precisa vincular antes de gerar relatório.");
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

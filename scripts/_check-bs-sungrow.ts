import { prisma } from "../src/lib/prisma";

async function main() {
  const total = await prisma.brasilSolarClient.count({
    where: { plataformaMonitoramento: "SUNGROW" },
  });
  const withPsId = await prisma.brasilSolarClient.count({
    where: { plataformaMonitoramento: "SUNGROW", monitoramentoPlantId: { not: null } },
  });
  const sample = await prisma.brasilSolarClient.findMany({
    where: { plataformaMonitoramento: "SUNGROW", monitoramentoPlantId: { not: null } },
    select: { id: true, nome: true, monitoramentoPlantId: true },
    take: 5,
  });

  console.log(`Sungrow total: ${total}, com psId: ${withPsId}`);
  for (const s of sample) console.log(`  ${s.id} ${s.nome} → ps_id=${s.monitoramentoPlantId}`);
  await prisma.$disconnect();
}
main();

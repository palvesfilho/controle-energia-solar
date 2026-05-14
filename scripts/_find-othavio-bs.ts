import { prisma } from "../src/lib/prisma";

async function main() {
  const found = await prisma.brasilSolarClient.findFirst({
    where: { monitoramentoPlantId: "1522536" },
    select: { id: true, nome: true, monitoramentoPlantId: true, plataformaMonitoramento: true, potenciaInstalada: true },
  });
  console.log(JSON.stringify(found, null, 2));
  await prisma.$disconnect();
}
main();

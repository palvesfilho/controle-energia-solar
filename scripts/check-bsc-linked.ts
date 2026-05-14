import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const filled = await prisma.brasilSolarClient.findMany({
    where: { codigoUc: { not: null } },
    select: {
      id: true,
      nome: true,
      cpfCnpj: true,
      codigoUc: true,
      monitoramentoPlantId: true,
      plataformaMonitoramento: true,
      concessionaria: true,
      statusContrato: true,
      dataInstalacao: true,
      potenciaInstalada: true,
    },
  });
  const total = await prisma.brasilSolarClient.count();
  const ativos = await prisma.brasilSolarClient.count({ where: { statusContrato: "ATIVO" } });
  const comCodigoUc = await prisma.brasilSolarClient.count({ where: { codigoUc: { not: null } } });
  const comPlantId = await prisma.brasilSolarClient.count({ where: { monitoramentoPlantId: { not: null } } });
  console.log(JSON.stringify({ total, ativos, comCodigoUc, comPlantId, encontrados: filled.length, registros: filled }, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

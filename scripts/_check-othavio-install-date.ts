import { prisma } from "../src/lib/prisma";
async function main() {
  const c = await prisma.brasilSolarClient.findFirst({
    where: { monitoramentoPlantId: "1522536" },
    select: { id: true, nome: true, dataInstalacao: true },
  });
  console.log(JSON.stringify(c, null, 2));
  await prisma.$disconnect();
}
main();

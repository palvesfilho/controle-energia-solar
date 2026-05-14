import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

async function main() {
  const codigo = process.argv[2] ?? "3095464357";

  const uc = await p.consumerUnit.findFirst({
    where: { codigoUc: codigo },
    select: {
      id: true,
      nome: true,
      codigoUc: true,
      plantId: true,
      distribuidora: true,
      consumer: { select: { id: true, name: true } },
      plant: { select: { id: true, name: true } },
    },
  });
  console.log("ConsumerUnit:", uc ? JSON.stringify(uc, null, 2) : "NÃO encontrada");

  const bills = await p.consumerBill.count({
    where: { consumerUnit: { codigoUc: codigo } },
  });
  console.log(`ConsumerBills (faturas) cadastradas: ${bills}`);

  const bsClients = await p.brasilSolarClient.findMany({
    where: { codigoUc: codigo, active: true },
    select: {
      id: true,
      nome: true,
      proprietarioId: true,
      plantId: true,
      plataformaMonitoramento: true,
      monitoramentoPlantId: true,
      potenciaInstalada: true,
      investimento: true,
      proprietario: { select: { id: true, nome: true, codigoUc: true } },
    },
  });
  console.log(
    `BrasilSolarClient(s) com codigoUc=${codigo}:`,
    bsClients.length,
    JSON.stringify(bsClients, null, 2),
  );

  const proprietarios = await p.brasilSolarProprietario.findMany({
    where: { codigoUc: codigo },
    select: { id: true, nome: true, codigoUc: true },
  });
  console.log(
    `BrasilSolarProprietario(s) com codigoUc=${codigo}:`,
    proprietarios.length,
    JSON.stringify(proprietarios, null, 2),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());

import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

async function main() {
  const propId = process.argv[2] ?? "cmnxkne2m0005rxnrsi9o4k8s";
  const prop = await p.brasilSolarProprietario.findUnique({
    where: { id: propId },
    select: { id: true, nome: true },
  });
  const clients = await p.brasilSolarClient.findMany({
    where: { proprietarioId: propId, active: true },
    select: { id: true, nome: true, plantId: true, active: true },
  });
  const plantIds = [
    ...new Set(clients.map((c) => c.plantId).filter((x): x is string => !!x)),
  ];
  const ucs = await p.consumerUnit.findMany({
    where: plantIds.length > 0 ? { plantId: { in: plantIds } } : { id: "_none_" },
    select: { id: true, codigoUc: true, plantId: true, nome: true },
  });
  console.log("Proprietario:", JSON.stringify(prop, null, 2));
  console.log(
    "BrasilSolarClients (active):",
    clients.length,
    JSON.stringify(clients, null, 2),
  );
  console.log("PlantIds derivados:", plantIds);
  console.log("UCs encontradas:", ucs.length, JSON.stringify(ucs, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());

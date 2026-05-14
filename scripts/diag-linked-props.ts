import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

async function main() {
  const linked = await p.brasilSolarClient.findMany({
    where: {
      plantId: { not: null },
      active: true,
      proprietarioId: { not: null },
    },
    select: {
      id: true,
      nome: true,
      plantId: true,
      proprietarioId: true,
      proprietario: { select: { nome: true, id: true } },
    },
    take: 10,
  });
  console.log("BrasilSolarClients com plantId vinculado:", linked.length);
  for (const c of linked) {
    console.log(
      `  - ${c.proprietario?.nome} (${c.proprietarioId}) -> usina ${c.nome} (plantId=${c.plantId})`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());

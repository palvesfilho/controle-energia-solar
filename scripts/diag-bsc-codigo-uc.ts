import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

async function main() {
  const totais = await p.brasilSolarClient.count({ where: { active: true } });
  const comCodigoUc = await p.brasilSolarClient.count({
    where: { active: true, codigoUc: { not: null } },
  });
  const comPlantId = await p.brasilSolarClient.count({
    where: { active: true, plantId: { not: null } },
  });

  // Tenta auto-link: BSC com codigoUc que bate com ConsumerUnit.codigoUc
  const bscs = await p.brasilSolarClient.findMany({
    where: { active: true, codigoUc: { not: null }, plantId: null },
    select: { id: true, codigoUc: true, nome: true, proprietarioId: true },
  });
  const codigos = [
    ...new Set(bscs.map((b) => b.codigoUc).filter((x): x is string => !!x)),
  ];
  const ucs = await p.consumerUnit.findMany({
    where: { codigoUc: { in: codigos } },
    select: { id: true, codigoUc: true, plantId: true, nome: true },
  });

  console.log(`BrasilSolarClient ativos: ${totais}`);
  console.log(`  com codigoUc preenchido: ${comCodigoUc}`);
  console.log(`  com plantId vinculado:   ${comPlantId}`);
  console.log("");
  console.log(
    `Match potencial (codigoUc do BSC bate com ConsumerUnit.codigoUc): ${ucs.length}`,
  );
  console.log("Exemplos (até 10):");
  const matches = bscs
    .map((b) => {
      const uc = ucs.find((u) => u.codigoUc === b.codigoUc);
      return uc
        ? { bscNome: b.nome, codigo: b.codigoUc, ucPlantId: uc.plantId }
        : null;
    })
    .filter(Boolean)
    .slice(0, 10);
  for (const m of matches) console.log(" ", JSON.stringify(m));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());

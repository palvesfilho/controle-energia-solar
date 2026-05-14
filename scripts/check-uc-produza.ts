import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const plant = await prisma.plant.findFirst({
    where: { numeroUsina: "3095464357" },
    select: { id: true, name: true, numeroUsina: true, unidadeConsumidora: true },
  });
  console.log(`\nUsina: ${plant?.numeroUsina} — ${plant?.name}`);
  console.log(`  unidadeConsumidora (legacy): ${plant?.unidadeConsumidora}`);

  const ucs = await prisma.consumerUnit.findMany({
    where: { plantId: plant?.id },
    select: { id: true, codigoUc: true, nome: true, active: true },
  });
  console.log(`\nUCs vinculadas à ANTUNES: ${ucs.length}`);
  for (const u of ucs) {
    console.log(
      `  ${u.codigoUc} | ${u.nome} | ${u.active ? "ATIVA" : "inativa"}`,
    );
  }

  // UCs que estão no rateio vigente
  const rateio = await prisma.rateioVersion.findFirst({
    where: { plantId: plant?.id, status: "VIGENTE" },
    select: {
      items: {
        select: {
          consumerUnitId: true,
          percentual: true,
          consumerUnit: { select: { codigoUc: true, nome: true } },
        },
      },
    },
  });
  console.log(`\nUCs no rateio VIGENTE:`);
  for (const it of rateio?.items ?? []) {
    console.log(
      `  ${it.consumerUnit.codigoUc} | ${it.consumerUnit.nome} | ${it.percentual}%`,
    );
  }

  const noRateio = new Set(rateio?.items.map((i) => i.consumerUnitId) ?? []);
  const foraDoRateio = ucs.filter((u) => !noRateio.has(u.id));
  console.log(`\nUCs vinculadas mas FORA do rateio: ${foraDoRateio.length}`);
  for (const u of foraDoRateio) {
    console.log(`  ${u.codigoUc} | ${u.nome}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

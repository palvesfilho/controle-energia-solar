import { prisma } from "../src/lib/prisma";

async function main() {
  const codigoUc = "3095625622";

  // É UC geradora de alguma plant?
  const plantsComoGeradora = await prisma.plant.findMany({
    where: {
      OR: [
        { numeroUsina: codigoUc },
        { unidadeConsumidora: codigoUc },
        { codigoCliente: codigoUc },
      ],
    },
    select: { id: true, name: true, numeroUsina: true, regraInstalacao: true },
  });
  console.log(`Plants em que UC ${codigoUc} é geradora: ${plantsComoGeradora.length}`);
  for (const p of plantsComoGeradora) console.log(`  - ${p.name} (${p.numeroUsina}) ${p.regraInstalacao}`);

  // Como ConsumerUnit tem plantId direto?
  const uc = await prisma.consumerUnit.findUnique({
    where: { codigoUc },
    select: { id: true, nome: true, plantId: true, consumerId: true },
  });
  console.log(`\nConsumerUnit:`, uc);
  if (uc?.plantId) {
    const plantVinc = await prisma.plant.findUnique({
      where: { id: uc.plantId },
      select: { name: true, numeroUsina: true, regraInstalacao: true },
    });
    console.log(`Plant vinculada via consumerUnit.plantId:`, plantVinc);
  }

  // Em quais rateios ela aparece?
  const rateioItems = await prisma.rateioItem.findMany({
    where: { consumerUnitId: uc?.id },
    select: {
      percentual: true,
      version: {
        select: {
          plant: { select: { name: true, numeroUsina: true } },
          status: true,
          vigenteAPartirDe: true,
        },
      },
    },
  });
  console.log(`\nRateios em que UC participa: ${rateioItems.length}`);
  for (const r of rateioItems) {
    console.log(
      `  - ${r.version.plant.name} (${r.version.plant.numeroUsina}) | share=${r.percentual}% | status=${r.version.status} | desde ${r.version.vigenteAPartirDe.toISOString().slice(0, 10)}`,
    );
  }

  // Bills da UC com energia injetada (geração própria) e compensada
  const bills = await prisma.consumerBill.findMany({
    where: { consumerUnitId: uc?.id },
    select: {
      anoReferencia: true,
      mesReferencia: true,
      consumoKwh: true,
      energiaInjetada: true,
      energiaCompensada: true,
      energiaInjetadaMedidorKwh: true,
      consumoInstantaneoKwh: true,
      geracaoInversorKwh: true,
    },
    orderBy: [{ anoReferencia: "asc" }, { mesReferencia: "asc" }],
  });
  console.log(`\nBills da UC: ${bills.length}`);
  for (const b of bills) {
    console.log(
      `  ${b.anoReferencia}-${String(b.mesReferencia).padStart(2, "0")} | consumo=${b.consumoKwh ?? 0} | injetada(fatura)=${b.energiaInjetada ?? 0} | compensada=${b.energiaCompensada ?? 0} | injMedidor=${b.energiaInjetadaMedidorKwh ?? 0} | consInst=${b.consumoInstantaneoKwh ?? 0} | invKwh=${b.geracaoInversorKwh ?? 0}`,
    );
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

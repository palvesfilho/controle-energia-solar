import { prisma } from "../src/lib/prisma";

async function main() {
  const plants = await prisma.plant.findMany({
    where: {
      OR: [
        { numeroUsina: { contains: "4003476471" } },
        { name: { contains: "4003476471" } },
      ],
    },
    select: { id: true, name: true, numeroUsina: true },
  });
  console.log("Plants com 4003476471:", plants);

  for (const p of plants) {
    const ucs = await prisma.consumerUnit.findMany({
      where: { plantId: p.id },
      select: { id: true, codigoUc: true, nome: true },
    });
    console.log(`UCs da plant ${p.name} (${p.numeroUsina}):`, ucs);

    const billsPlant = await prisma.consumerBill.findMany({
      where: { plantId: p.id, anoReferencia: 2025, mesReferencia: 7 },
      orderBy: { syncedAt: "desc" },
      select: {
        id: true,
        consumerUnitId: true,
        energiaInjetadaMedidorKwh: true,
        energiaCompensada: true,
        consumoKwh: true,
        valorTotal: true,
        syncedAt: true,
        fonteConsulta: true,
        consumerUnit: { select: { codigoUc: true, nome: true } },
      },
    });
    console.log(`Bills jul/2025 da plant ${p.numeroUsina}:`, JSON.stringify(billsPlant, null, 2));

    // Bill específica da UC geradora (consumerUnitId == null indica fatura da plant em si)
    const billUcGeradora = await prisma.consumerBill.findFirst({
      where: { plantId: p.id, anoReferencia: 2025, mesReferencia: 7, consumerUnitId: null },
      orderBy: { syncedAt: "desc" },
    });
    console.log("Bill da UC geradora (consumerUnitId null):", JSON.stringify(billUcGeradora, null, 2));
  }
  return;
  const candidatas = await prisma.consumerUnit.findMany({
    where: { codigoUc: { contains: "4003476471" } },
    select: { id: true, codigoUc: true, nome: true, plantId: true },
  });
  console.log("Candidatas com 4003476471 no codigoUc:", candidatas);

  const aproximadas = await prisma.consumerUnit.findMany({
    where: { codigoUc: { contains: "476471" } },
    select: { id: true, codigoUc: true, nome: true, plantId: true },
  });
  console.log("Aproximadas (sufixo 476471):", aproximadas);

  const total = await prisma.consumerUnit.count();
  console.log("Total de UCs no banco:", total);
  const amostra = await prisma.consumerUnit.findMany({
    take: 8,
    select: { codigoUc: true, nome: true },
  });
  console.log("Amostra:", amostra);

  const uc = await prisma.consumerUnit.findFirst({
    where: { codigoUc: { contains: "4003476471" } },
    select: {
      id: true,
      codigoUc: true,
      nome: true,
      plantId: true,
      plant: { select: { id: true, name: true, numeroUsina: true } },
    },
  });
  console.log("UC:", JSON.stringify(uc, null, 2));
  if (!uc) return;

  const bills = await prisma.consumerBill.findMany({
    where: { consumerUnitId: uc.id, anoReferencia: 2025, mesReferencia: 7 },
    orderBy: { syncedAt: "desc" },
    select: {
      id: true,
      anoReferencia: true,
      mesReferencia: true,
      energiaInjetadaMedidorKwh: true,
      energiaCompensada: true,
      consumoKwh: true,
      valorTotal: true,
      syncedAt: true,
      plantId: true,
      origem: true,
    },
  });
  console.log("Bills da UC em jul/2025:", JSON.stringify(bills, null, 2));

  if (uc.plantId) {
    const billsPlant = await prisma.consumerBill.findMany({
      where: { plantId: uc.plantId, anoReferencia: 2025, mesReferencia: 7 },
      orderBy: { syncedAt: "desc" },
      select: {
        id: true,
        consumerUnitId: true,
        energiaInjetadaMedidorKwh: true,
        valorTotal: true,
        consumerUnit: { select: { codigoUc: true, nome: true } },
      },
    });
    console.log(
      "Bills da plant da UC em jul/2025 (todas UCs da plant):",
      JSON.stringify(billsPlant, null, 2),
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

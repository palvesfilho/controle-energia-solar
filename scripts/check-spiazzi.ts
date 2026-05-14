import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const bscs = await prisma.brasilSolarClient.findMany({
    where: { nome: { contains: "SPIAZZI" } },
    include: {
      proprietario: { select: { id: true, nome: true, cpfCnpj: true } },
      plant: {
        select: {
          id: true,
          name: true,
          numeroUsina: true,
          unidadeConsumidora: true,
          potenciaInstalada: true,
          consumerUnits: {
            select: { id: true, codigoUc: true, nome: true, distribuidora: true, active: true },
          },
          _count: { select: { consumerBills: true } },
        },
      },
    },
  });

  console.log(`BSCs com SPIAZZI: ${bscs.length}\n`);
  for (const b of bscs) {
    console.log(`BSC: ${b.nome}`);
    console.log(`  id=${b.id}`);
    console.log(`  proprietario=${b.proprietario ? `${b.proprietario.nome} (id=${b.proprietario.id})` : "NENHUM"}`);
    console.log(`  plataforma=${b.plataformaMonitoramento} plantId=${b.monitoramentoPlantId}`);
    console.log(`  potencia=${b.potenciaInstalada}kWp instalacao=${b.dataInstalacao?.toISOString().slice(0,10)}`);
    console.log(`  investimento=${b.investimento ?? "—"} geracaoEsperada=${b.geracaoMediaEsperada ?? "—"}`);
    console.log(`  codigoUc=${b.codigoUc ?? "—"} (no BSC)`);
    if (b.plant) {
      console.log(`  Plant vinculada: ${b.plant.name} (id=${b.plant.id})`);
      console.log(`    UC da usina: ${b.plant.unidadeConsumidora ?? "—"}  num=${b.plant.numeroUsina ?? "—"}`);
      console.log(`    bills=${b.plant._count.consumerBills} consumerUnits=${b.plant.consumerUnits.length}`);
      for (const uc of b.plant.consumerUnits) {
        console.log(`      UC: ${uc.codigoUc} | ${uc.nome} | ${uc.distribuidora} | active=${uc.active} | id=${uc.id}`);
      }
    } else {
      console.log(`  Plant vinculada: NENHUMA`);
    }
    console.log();
  }

  // Quantas ConsumerBills existem para esta Plant?
  for (const b of bscs) {
    if (!b.plant) continue;
    const recentBills = await prisma.consumerBill.findMany({
      where: { plantId: b.plant.id },
      select: { id: true, anoReferencia: true, mesReferencia: true, energiaCompensada: true, energiaInjetada: true, valorTotal: true, consumerUnitId: true, dataLeituraAnterior: true, dataLeituraAtual: true },
      orderBy: [{ anoReferencia: "desc" }, { mesReferencia: "desc" }],
      take: 6,
    });
    console.log(`Últimas faturas da Plant ${b.plant.name}:`);
    for (const f of recentBills) {
      console.log(`  ${f.anoReferencia}-${String(f.mesReferencia).padStart(2,"0")} cuId=${f.consumerUnitId} compensada=${f.energiaCompensada} injetada=${f.energiaInjetada} valor=${f.valorTotal} ciclo=${f.dataLeituraAnterior?.toISOString().slice(0,10)}→${f.dataLeituraAtual?.toISOString().slice(0,10)}`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });

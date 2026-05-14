/**
 * Lista UCs em rateio que têm bills com energiaInjetadaMedidorKwh > 0
 * (geração própria — descontada do cálculo de remuneração ao investidor).
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  const itemsVigentes = await prisma.rateioItem.findMany({
    where: { version: { status: "VIGENTE" } },
    select: {
      consumerUnitId: true,
      version: { select: { plant: { select: { name: true, numeroUsina: true } } } },
      consumerUnit: { select: { codigoUc: true, nome: true } },
    },
  });

  const ucIds = Array.from(new Set(itemsVigentes.map((i) => i.consumerUnitId)));
  console.log(`UCs em rateio VIGENTE: ${ucIds.length}\n`);

  const linhas: Array<{
    plant: string;
    uc: string;
    nome: string;
    bills: number;
    totalInj: number;
    totalComp: number;
    pctInj: number;
  }> = [];

  for (const ucId of ucIds) {
    const item = itemsVigentes.find((i) => i.consumerUnitId === ucId)!;
    const bills = await prisma.consumerBill.findMany({
      where: { consumerUnitId: ucId, energiaInjetadaMedidorKwh: { gt: 0 } },
      select: { energiaInjetadaMedidorKwh: true, energiaCompensada: true },
    });
    const totalInj = bills.reduce(
      (a, b) => a + (b.energiaInjetadaMedidorKwh ?? 0),
      0,
    );
    const allBills = await prisma.consumerBill.findMany({
      where: { consumerUnitId: ucId },
      select: { energiaCompensada: true },
    });
    const totalComp = allBills.reduce(
      (a, b) => a + (b.energiaCompensada ?? 0),
      0,
    );
    if (totalInj > 0) {
      linhas.push({
        plant: `${item.version.plant.name} (${item.version.plant.numeroUsina})`,
        uc: item.consumerUnit.codigoUc,
        nome: item.consumerUnit.nome,
        bills: bills.length,
        totalInj,
        totalComp,
        pctInj: totalComp > 0 ? (totalInj / totalComp) * 100 : 0,
      });
    }
  }

  if (linhas.length === 0) {
    console.log("Nenhuma UC em rateio tem geração própria registrada.");
  } else {
    linhas.sort((a, b) => b.totalInj - a.totalInj);
    console.log("Plant | UC | Nome | bills c/ inj | Σ injMed kWh | Σ comp kWh | % inj/comp");
    console.log("-".repeat(110));
    for (const l of linhas) {
      console.log(
        `${l.plant} | ${l.uc} | ${l.nome} | ${l.bills} | ${l.totalInj.toFixed(0)} | ${l.totalComp.toFixed(0)} | ${l.pctInj.toFixed(1)}%`,
      );
    }
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

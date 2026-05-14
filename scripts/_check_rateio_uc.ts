import { prisma } from "../src/lib/prisma";

const PLANT_ID = "4018f3bd-50bd-4ff9-87d4-d50b680e437b";

async function main() {
  const rateio = await prisma.rateioVersion.findFirst({
    where: { plantId: PLANT_ID, status: "VIGENTE" },
    include: {
      items: {
        include: { consumerUnit: { select: { codigoUc: true, nome: true } } },
      },
    },
  });
  console.log("Rateio VIGENTE:");
  for (const i of rateio?.items ?? []) {
    console.log(
      `  ${i.consumerUnit.codigoUc}  ${i.consumerUnit.nome}  ${i.percentual}%`,
    );
  }

  // Payables de origem abr e mai (com kwh por UC)
  for (const [a, m] of [[2025, 4], [2025, 5]] as const) {
    const ps = await prisma.investorPayable.findMany({
      where: {
        plantId: PLANT_ID,
        originatedByPlantBill: { anoReferencia: a, mesReferencia: m },
      },
      select: {
        kwhCompensadoBase: true,
        kwhCompensadoAjuste: true,
        kwhCreditoLegadoAbatido: true,
        valorBruto: true,
        consumerUnit: { select: { codigoUc: true, nome: true } },
      },
      orderBy: { consumerUnit: { codigoUc: "asc" } },
    });
    console.log(`\nPayables origem ${a}-${String(m).padStart(2, "0")}:`);
    for (const p of ps) {
      const kwhBruto = (p.kwhCompensadoBase ?? 0) + (p.kwhCompensadoAjuste ?? 0);
      console.log(
        `  ${p.consumerUnit?.codigoUc} ${p.consumerUnit?.nome?.slice(0, 35)}` +
        `  bruto=${kwhBruto.toFixed(2).padStart(8)}` +
        `  legado=${(p.kwhCreditoLegadoAbatido ?? 0).toFixed(2).padStart(8)}` +
        `  remun=${(kwhBruto - (p.kwhCreditoLegadoAbatido ?? 0)).toFixed(2).padStart(8)}` +
        `  R$=${p.valorBruto.toFixed(2).padStart(8)}`,
      );
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

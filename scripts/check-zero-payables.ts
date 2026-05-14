import { prisma } from "../src/lib/prisma";

const PLANT_ID = "c92bd286-6c47-4609-9edb-9443bc30cb77";

async function main() {
  const zeroPayables = await prisma.investorPayable.findMany({
    where: { plantId: PLANT_ID, kwhCompensadoBase: 0 },
    select: {
      id: true,
      anoReferencia: true,
      mesReferencia: true,
      kwhCompensadoBase: true,
      valorBruto: true,
      valorLiquido: true,
      status: true,
      consumerUnit: { select: { codigoUc: true, nome: true } },
    },
    orderBy: [{ anoReferencia: "asc" }, { mesReferencia: "asc" }],
  });

  console.log(`Payables da Sidinei com kwhCompensadoBase=0: ${zeroPayables.length}\n`);
  for (const p of zeroPayables) {
    console.log(
      `   ${p.anoReferencia}-${String(p.mesReferencia).padStart(2,"0")} | UC ${p.consumerUnit.codigoUc} (${p.consumerUnit.nome}) | R$${p.valorBruto} | ${p.status}`,
    );
  }

  // Total de payables da Sidinei
  const all = await prisma.investorPayable.count({ where: { plantId: PLANT_ID } });
  console.log(`\nTotal payables Sidinei: ${all}`);
  console.log(`Payables úteis (kWh > 0): ${all - zeroPayables.length}`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });

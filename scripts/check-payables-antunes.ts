import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const plant = await prisma.plant.findFirst({
    where: { numeroUsina: "3095464357" },
    select: { id: true, name: true },
  });
  if (!plant) {
    console.log("Usina ANTUNES não encontrada.");
    return;
  }

  const payables = await prisma.investorPayable.findMany({
    where: { plantId: plant.id },
    select: {
      id: true,
      anoReferencia: true,
      mesReferencia: true,
      status: true,
      kwhCompensadoBase: true,
      valorLiquido: true,
      consumerUnit: { select: { codigoUc: true } },
    },
    orderBy: [{ anoReferencia: "asc" }, { mesReferencia: "asc" }],
  });

  console.log(`\n=== InvestorPayables — ANTUNES (${plant.id}) ===`);
  console.log(`Total: ${payables.length}\n`);
  for (const p of payables) {
    console.log(
      `  ${p.anoReferencia}-${String(p.mesReferencia).padStart(2, "0")} UC ${p.consumerUnit.codigoUc} | ${p.status} | ${p.kwhCompensadoBase?.toFixed(2)} kWh | R$ ${p.valorLiquido?.toFixed(2)}`,
    );
  }

  const totalLiquido = payables.reduce((s, p) => s + (p.valorLiquido ?? 0), 0);
  console.log(`\nTotal líquido a pagar ao(s) investidor(es): R$ ${totalLiquido.toFixed(2)}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

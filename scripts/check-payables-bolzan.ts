import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const plant = await prisma.plant.findFirst({
    where: { numeroUsina: "4003503006" },
    select: {
      id: true,
      name: true,
      investors: {
        select: {
          sharePercent: true,
          valorKwhContrato: true,
          investor: {
            select: {
              id: true,
              user: { select: { name: true, email: true } },
            },
          },
        },
      },
    },
  });

  console.log(`\n=== ${plant?.name} ===`);
  console.log(`Investidores vinculados: ${plant?.investors.length ?? 0}`);
  for (const iv of plant?.investors ?? []) {
    console.log(
      `  ${iv.investor.user?.name ?? iv.investor.user?.email} | share=${iv.sharePercent}% | kWh=R$${iv.valorKwhContrato ?? "—"}`,
    );
  }

  const payables = await prisma.investorPayable.findMany({
    where: { plantId: plant?.id },
    select: {
      anoReferencia: true,
      mesReferencia: true,
      status: true,
      kwhCompensadoBase: true,
      valorLiquido: true,
      consumerUnit: { select: { codigoUc: true } },
    },
    orderBy: [{ anoReferencia: "asc" }, { mesReferencia: "asc" }],
  });

  console.log(`\nPayables: ${payables.length}`);
  for (const p of payables) {
    console.log(
      `  ${p.anoReferencia}-${String(p.mesReferencia).padStart(2, "0")} UC ${p.consumerUnit.codigoUc} | ${p.status} | ${p.kwhCompensadoBase?.toFixed(2)} kWh | R$ ${p.valorLiquido?.toFixed(2)}`,
    );
  }

  const total = payables.reduce((s, p) => s + (p.valorLiquido ?? 0), 0);
  console.log(`\nTotal: R$ ${total.toFixed(2)}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const plants = await prisma.plant.findMany({
    where: {
      OR: [
        { name: { contains: "sidinei" } },
        { name: { contains: "Sidinei" } },
        { name: { contains: "segatto" } },
        { name: { contains: "Segatto" } },
        {
          investors: {
            some: {
              investor: { user: { name: { contains: "Sidinei" } } },
            },
          },
        },
        {
          investors: {
            some: {
              investor: { user: { name: { contains: "Segatto" } } },
            },
          },
        },
      ],
    },
    select: {
      id: true,
      name: true,
      numeroUsina: true,
      active: true,
      investors: {
        select: {
          investor: { select: { user: { select: { name: true } } } },
        },
      },
    },
  });

  for (const p of plants) {
    console.log(`\n=== ${p.name} (Nº ${p.numeroUsina ?? "—"}) — active=${p.active}`);
    console.log(`   plantId: ${p.id}`);
    console.log(
      `   investidor(es): ${p.investors.map((i) => i.investor.user?.name).join(", ")}`,
    );

    const payables = await prisma.investorPayable.findMany({
      where: { plantId: p.id },
      select: {
        anoReferencia: true,
        mesReferencia: true,
        status: true,
        valorLiquido: true,
        valorRealPago: true,
        consumerUnit: { select: { codigoUc: true } },
      },
      orderBy: [{ anoReferencia: "asc" }, { mesReferencia: "asc" }],
    });

    if (payables.length === 0) {
      console.log("   (nenhuma payable ainda)");
      continue;
    }
    for (const pa of payables) {
      console.log(
        `   ${pa.anoReferencia}-${String(pa.mesReferencia).padStart(2, "0")} | ${pa.consumerUnit.codigoUc ?? "—"} | ${pa.status.padEnd(25)} | devido R$${pa.valorLiquido.toFixed(2)} | pago R$${pa.valorRealPago?.toFixed(2) ?? "—"}`,
      );
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

async function main() {
  const bills = await p.consumerBill.findMany({
    where: { consumerUnitId: "cmoaxxavp000ii22b61jr60r3" },
    select: {
      mesReferencia: true,
      anoReferencia: true,
      tarifaTE: true,
      tarifaTUSD: true,
      icms: true,
      pis: true,
      cofins: true,
      valorTotal: true,
      consumoKwh: true,
    },
    orderBy: [{ anoReferencia: "desc" }, { mesReferencia: "desc" }],
    take: 3,
  });
  for (const b of bills) {
    console.log(
      `${b.mesReferencia}/${b.anoReferencia}: TE=${b.tarifaTE} TUSD=${b.tarifaTUSD} icms=${b.icms} pis=${b.pis} cofins=${b.cofins} valor=${b.valorTotal} consumo=${b.consumoKwh}`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());

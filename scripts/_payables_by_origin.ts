import { prisma } from "../src/lib/prisma";

async function main() {
  const PLANT_ID = "4018f3bd-50bd-4ff9-87d4-d50b680e437b";

  const payables = await prisma.investorPayable.findMany({
    where: { plantId: PLANT_ID },
    select: {
      id: true,
      anoReferencia: true,
      mesReferencia: true,
      valorLiquido: true,
      kwhCompensadoBase: true,
      originatedByPlantBill: {
        select: { anoReferencia: true, mesReferencia: true },
      },
    },
  });

  // Agrupa por (origem.ano, origem.mes)
  const groups = new Map<
    string,
    { count: number; valor: number; kwh: number; consumerMonths: Set<string> }
  >();
  for (const p of payables) {
    const key = p.originatedByPlantBill
      ? `${p.originatedByPlantBill.anoReferencia}-${String(p.originatedByPlantBill.mesReferencia).padStart(2, "0")}`
      : "(sem origem)";
    const consumerKey = `${p.anoReferencia}-${String(p.mesReferencia).padStart(2, "0")}`;
    const cur = groups.get(key) ?? {
      count: 0,
      valor: 0,
      kwh: 0,
      consumerMonths: new Set<string>(),
    };
    cur.count += 1;
    cur.valor += p.valorLiquido ?? 0;
    cur.kwh += p.kwhCompensadoBase ?? 0;
    cur.consumerMonths.add(consumerKey);
    groups.set(key, cur);
  }

  const sorted = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  console.log(
    "MES_GERACAO   QTD   VALOR        KWH      CONSUMER_BILL_MONTHS",
  );
  for (const [k, v] of sorted) {
    console.log(
      `${k.padEnd(12)} ${String(v.count).padStart(3)}   R$ ${v.valor.toFixed(2).padStart(9)}  ${v.kwh.toFixed(0).padStart(6)}   ${[...v.consumerMonths].sort().join(", ")}`,
    );
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

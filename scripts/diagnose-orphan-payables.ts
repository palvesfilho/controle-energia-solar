import { prisma } from "../src/lib/prisma";

async function main() {
  const payables = await prisma.investorPayable.findMany({
    where: { originatedByPlantBillId: null },
    select: {
      id: true,
      anoReferencia: true,
      mesReferencia: true,
      consumerBillId: true,
      plant: { select: { name: true, numeroUsina: true } },
      consumerUnit: { select: { codigoUc: true, nome: true } },
    },
  });

  console.log(`Payables sem origem após backfill: ${payables.length}\n`);

  for (const p of payables) {
    console.log(
      `\n--- ${p.plant.name} | UC ${p.consumerUnit.codigoUc} (${p.consumerUnit.nome}) | ${p.anoReferencia}-${String(p.mesReferencia).padStart(2, "0")}`,
    );
    console.log(`   payableId: ${p.id}, consumerBillId: ${p.consumerBillId ?? "(null)"}`);

    // Tem ConsumerBill?
    let cb;
    if (p.consumerBillId) {
      cb = await prisma.consumerBill.findUnique({
        where: { id: p.consumerBillId },
        select: { dataLeituraAtual: true, anoReferencia: true, mesReferencia: true },
      });
    }
    if (!cb) {
      cb = await prisma.consumerBill.findFirst({
        where: {
          consumerUnitId: (await prisma.investorPayable.findUnique({
            where: { id: p.id }, select: { consumerUnitId: true },
          }))?.consumerUnitId,
          anoReferencia: p.anoReferencia,
          mesReferencia: p.mesReferencia,
        },
        orderBy: { syncedAt: "desc" },
        select: { dataLeituraAtual: true, anoReferencia: true, mesReferencia: true },
      });
    }
    console.log(`   ConsumerBill (UC consumidora): ${cb ? `ano=${cb.anoReferencia}-${cb.mesReferencia}, dataLeituraAtual=${cb.dataLeituraAtual?.toISOString().slice(0,10) ?? "(null)"}` : "(NÃO encontrada)"}`);

    // Quais faturas da UC geradora dessa usina existem?
    const plantId = (await prisma.investorPayable.findUnique({
      where: { id: p.id }, select: { plantId: true },
    }))?.plantId;
    if (plantId) {
      const plantBills = await prisma.consumerBill.findMany({
        where: { plantId, consumerUnitId: null },
        orderBy: [{ anoReferencia: "asc" }, { mesReferencia: "asc" }],
        select: { anoReferencia: true, mesReferencia: true, dataLeituraAtual: true },
      });
      console.log(`   Faturas da UC geradora dessa usina (${plantBills.length}):`);
      for (const pb of plantBills) {
        console.log(`      ${pb.anoReferencia}-${String(pb.mesReferencia).padStart(2,"0")} | leitura=${pb.dataLeituraAtual?.toISOString().slice(0,10) ?? "(null)"}`);
      }
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });

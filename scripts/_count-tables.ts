import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

(async () => {
  try {
    const counts = {
      User: await p.user.count(),
      Consumer: await p.consumer.count(),
      ConsumerUnit: await p.consumerUnit.count(),
      ConsumerBill: await p.consumerBill.count(),
      Plant: await p.plant.count(),
      Investor: await p.investor.count(),
      BrasilSolarClient: await p.brasilSolarClient.count(),
      BrasilSolarProprietario: await p.brasilSolarProprietario.count(),
      InvestorPayable: await p.investorPayable.count(),
    };
    console.log("COUNTS:", JSON.stringify(counts, null, 2));
  } catch (e: any) {
    console.error("ERRO:", e.message);
  }
  await p.$disconnect();
})();

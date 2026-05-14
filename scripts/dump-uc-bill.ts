import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const bill = await prisma.consumerBill.findFirst({
    where: {
      anoReferencia: 2026,
      mesReferencia: 4,
      consumerUnit: { codigoUc: "3090582291" },
    },
    include: {
      consumerUnit: true,
    },
  });

  if (!bill) {
    console.log("Nenhuma bill encontrada para UC 3090582291 em abr/2026");
    return;
  }

  console.log("===== ConsumerBill (abril/2026) =====");
  for (const [k, v] of Object.entries(bill)) {
    if (k === "consumerUnit") continue;
    console.log(`  ${k}: ${v instanceof Date ? v.toISOString() : JSON.stringify(v)}`);
  }

  console.log("\n===== ConsumerUnit =====");
  for (const [k, v] of Object.entries(bill.consumerUnit ?? {})) {
    console.log(`  ${k}: ${v instanceof Date ? v.toISOString() : JSON.stringify(v)}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());

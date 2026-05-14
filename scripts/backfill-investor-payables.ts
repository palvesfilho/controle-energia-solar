/**
 * Backfill de InvestorPayable a partir das ConsumerBill já existentes.
 *
 * Útil para popular o novo modelo de pagamento ao investidor sem reprocessar
 * as integrações (Infosimples/upload manual) — usa somente dados já gravados.
 *
 * Uso:
 *   npx tsx scripts/backfill-investor-payables.ts          # dry-run (só lista)
 *   npx tsx scripts/backfill-investor-payables.ts --apply  # executa
 */
import { prisma } from "../src/lib/prisma";
import { syncInvestorPayablesFromBill } from "../src/lib/investor-payables";

const APPLY = process.argv.includes("--apply");

async function main() {
  const bills = await prisma.consumerBill.findMany({
    where: {
      consumerUnitId: { not: null },
      energiaCompensada: { gt: 0 },
    },
    select: { id: true, anoReferencia: true, mesReferencia: true, consumerUnitId: true },
    orderBy: [{ anoReferencia: "asc" }, { mesReferencia: "asc" }],
  });

  console.log(`Encontradas ${bills.length} faturas com energia compensada > 0.`);
  if (bills.length === 0) return;

  if (!APPLY) {
    console.log("Dry-run — não vai gravar. Use --apply pra executar.");
    for (const b of bills.slice(0, 10)) {
      console.log(`  ${b.anoReferencia}/${String(b.mesReferencia).padStart(2, "0")} bill=${b.id} uc=${b.consumerUnitId}`);
    }
    if (bills.length > 10) console.log(`  ... (+${bills.length - 10})`);
    return;
  }

  let createdTotal = 0;
  let updatedTotal = 0;
  const skipReasons = new Map<string, number>();

  for (const b of bills) {
    const r = await syncInvestorPayablesFromBill(b.id);
    createdTotal += r.created;
    updatedTotal += r.updated;
    for (const s of r.skipped) skipReasons.set(s, (skipReasons.get(s) ?? 0) + 1);
  }

  console.log(`\nResultado:`);
  console.log(`  payables criados: ${createdTotal}`);
  console.log(`  payables atualizados: ${updatedTotal}`);
  if (skipReasons.size > 0) {
    console.log(`  skips:`);
    for (const [reason, count] of skipReasons) {
      console.log(`    - ${reason}: ${count}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

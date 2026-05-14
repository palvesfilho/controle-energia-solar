/**
 * Backfill: para cada InvestorPayable existente, identifica a fatura da UC
 * geradora cujo ciclo de leitura originou os créditos e popula
 * `originatedByPlantBillId`.
 *
 * Estratégia:
 *  - Pega o `consumerBillId` (já existe) — fatura da UC consumidora onde o
 *    crédito foi compensado.
 *  - Se não tiver consumerBillId, tenta achar pela tupla
 *    (consumerUnitId, anoReferencia, mesReferencia).
 *  - Chama resolvePlantBillOrigin pra achar a fatura da usina.
 *
 * Uso: `npx tsx scripts/backfill-payable-origin.ts [--apply] [--plant <id>]`
 */
import { prisma } from "../src/lib/prisma";
import { resolvePlantBillOrigin } from "../src/lib/payable-origin";

const APPLY = process.argv.includes("--apply");
const plantArgIdx = process.argv.indexOf("--plant");
const PLANT_FILTER = plantArgIdx >= 0 ? process.argv[plantArgIdx + 1] : null;

async function main() {
  const where = PLANT_FILTER ? { plantId: PLANT_FILTER } : {};
  const payables = await prisma.investorPayable.findMany({
    where: { ...where, originatedByPlantBillId: null },
    select: {
      id: true,
      plantId: true,
      consumerUnitId: true,
      anoReferencia: true,
      mesReferencia: true,
      consumerBillId: true,
    },
  });

  console.log(`Payables sem origem: ${payables.length}`);
  if (PLANT_FILTER) console.log(`(filtrado por plant ${PLANT_FILTER})`);

  let resolvidos = 0;
  let semOrigem = 0;
  const updates: Array<{ id: string; originId: string }> = [];

  for (const p of payables) {
    let consumerBill = p.consumerBillId
      ? await prisma.consumerBill.findUnique({
          where: { id: p.consumerBillId },
          select: { dataLeituraAtual: true, anoReferencia: true, mesReferencia: true },
        })
      : null;

    if (!consumerBill) {
      consumerBill = await prisma.consumerBill.findFirst({
        where: {
          consumerUnitId: p.consumerUnitId,
          anoReferencia: p.anoReferencia,
          mesReferencia: p.mesReferencia,
        },
        orderBy: { syncedAt: "desc" },
        select: { dataLeituraAtual: true, anoReferencia: true, mesReferencia: true },
      });
    }

    if (!consumerBill) {
      semOrigem++;
      continue;
    }

    const originId = await resolvePlantBillOrigin({
      plantId: p.plantId,
      consumerBill,
    });

    if (originId) {
      updates.push({ id: p.id, originId });
      resolvidos++;
    } else {
      semOrigem++;
    }
  }

  console.log(`Resolvidos: ${resolvidos}`);
  console.log(`Sem origem identificada: ${semOrigem}`);

  if (!APPLY) {
    console.log("\n(dry-run — passe --apply pra gravar)");
    if (updates.length > 0) {
      console.log("Exemplo de updates:");
      for (const u of updates.slice(0, 5)) {
        console.log(`  payable ${u.id} -> originatedByPlantBillId ${u.originId}`);
      }
    }
    return;
  }

  for (const u of updates) {
    await prisma.investorPayable.update({
      where: { id: u.id },
      data: { originatedByPlantBillId: u.originId },
    });
  }
  console.log(`\n${updates.length} payables atualizados.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

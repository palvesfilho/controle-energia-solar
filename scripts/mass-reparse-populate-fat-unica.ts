/**
 * Mass reparse + populate de todas as ConsumerBills cujas UCs estão em
 * FAT_UNICA_COMPENSADA_BANDEIRAS.
 *
 * Pra cada bill:
 *   - se tem pdfUrl e o arquivo existe no storage → reparse (preenche
 *     bandeira*CreditoValor e outros campos detalhados)
 *   - sempre roda populateBillingFromBill (recalcula valorCobranca etc.).
 *     Bills que já têm ConsumerUnitBilling com asaasChargeId são skipped
 *     dentro do próprio populateBillingFromBill.
 *
 * Uso:
 *   tsx scripts/mass-reparse-populate-fat-unica.ts          # dry-run (não escreve)
 *   tsx scripts/mass-reparse-populate-fat-unica.ts --apply  # aplica
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { parseFaturaPdf } from "../src/lib/fatura-pdf-parser";
import { readFromStorage } from "../src/lib/file-storage";
import { populateBillingFromBill } from "../src/lib/billing-populate";

const APPLY = process.argv.includes("--apply");
const REGRA = "FAT_UNICA_COMPENSADA_BANDEIRAS";

async function main() {
  const bills = await prisma.consumerBill.findMany({
    where: {
      consumerUnit: { regraRemuneracao: REGRA },
    },
    select: {
      id: true,
      pdfUrl: true,
      anoReferencia: true,
      mesReferencia: true,
      consumerUnit: { select: { codigoUc: true, nome: true } },
    },
    orderBy: [
      { consumerUnit: { nome: "asc" } },
      { anoReferencia: "asc" },
      { mesReferencia: "asc" },
    ],
  });

  console.log(`Modo: ${APPLY ? "APPLY (escreve)" : "DRY-RUN"}`);
  console.log(`Bills encontradas (UCs em ${REGRA}): ${bills.length}\n`);

  let comPdf = 0;
  let semPdf = 0;
  let reparseOk = 0;
  let reparseFalha = 0;
  let populateOk = 0;
  let populateSkipped = 0;
  let populateFalha = 0;

  for (const bill of bills) {
    const tag = `[${bill.consumerUnit?.codigoUc ?? "?"}] ${String(bill.mesReferencia).padStart(2, "0")}/${bill.anoReferencia}`;

    if (!APPLY) {
      console.log(`  (dry) ${tag}  pdf=${bill.pdfUrl ? "sim" : "não"}`);
      if (bill.pdfUrl) comPdf++; else semPdf++;
      continue;
    }

    // 1) Reparse se tem PDF
    if (bill.pdfUrl) {
      comPdf++;
      try {
        const file = await readFromStorage(bill.pdfUrl);
        if (!file) {
          console.log(`  ${tag}  ✗ PDF não está no storage (${bill.pdfUrl})`);
          reparseFalha++;
        } else {
          const parsed = await parseFaturaPdf(new Uint8Array(file.data));
          await prisma.consumerBill.update({
            where: { id: bill.id },
            data: { ...parsed.bill, syncedAt: new Date() },
          });
          reparseOk++;
        }
      } catch (e) {
        console.log(`  ${tag}  ✗ reparse: ${e instanceof Error ? e.message : e}`);
        reparseFalha++;
      }
    } else {
      semPdf++;
    }

    // 2) Populate
    try {
      const r = await populateBillingFromBill(bill.id);
      if (r.skipped) {
        populateSkipped++;
      } else {
        populateOk++;
      }
    } catch (e) {
      console.log(`  ${tag}  ✗ populate: ${e instanceof Error ? e.message : e}`);
      populateFalha++;
    }
  }

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log(`Resumo:`);
  console.log(`  bills com PDF      : ${comPdf}`);
  console.log(`  bills sem PDF      : ${semPdf}`);
  if (APPLY) {
    console.log(`  reparse OK         : ${reparseOk}`);
    console.log(`  reparse falhou     : ${reparseFalha}`);
    console.log(`  populate OK        : ${populateOk}`);
    console.log(`  populate skipped   : ${populateSkipped}  (já tem asaasChargeId ou bill sem UC)`);
    console.log(`  populate falhou    : ${populateFalha}`);
  } else {
    console.log(`\nDry-run concluído. Rode com --apply para escrever.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

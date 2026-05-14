/**
 * Repopula ConsumerUnitBilling para todas as bills INFOSIMPLES.
 * Rodado após reparse-infosimples-bills para sincronizar valorEconomia/valorCobranca.
 * Idempotente: bills sem mudança real recalculam os mesmos valores.
 */

import { prisma } from "../src/lib/prisma";
import { populateBillingFromBill } from "../src/lib/billing-populate";

async function main() {
  const bills = await prisma.consumerBill.findMany({
    where: { fonteConsulta: "INFOSIMPLES" },
    select: {
      id: true,
      anoReferencia: true,
      mesReferencia: true,
      consumerUnit: { select: { codigoUc: true } },
    },
  });
  console.log(`Repopulando ${bills.length} billings...`);

  let ok = 0, skipped = 0;
  for (const b of bills) {
    const pop = await populateBillingFromBill(b.id);
    if (pop.skipped) {
      skipped++;
      console.log(
        `  skip ${b.consumerUnit?.codigoUc} ${b.mesReferencia}/${b.anoReferencia}: ${pop.skipReason}`
      );
    } else {
      ok++;
      console.log(
        `  ok   ${b.consumerUnit?.codigoUc} ${b.mesReferencia}/${b.anoReferencia}: ` +
          `compensado=${pop.valorCompensado?.toFixed(2) ?? "-"} ` +
          `cobranca=${pop.valorCobranca?.toFixed(2) ?? "-"} ` +
          `economia=${pop.valorEconomia?.toFixed(2) ?? "-"}`
      );
    }
  }
  console.log("");
  console.log(`Resultado: ${ok} recalculados, ${skipped} preservados (já no Asaas).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

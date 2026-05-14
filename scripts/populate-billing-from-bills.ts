import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { populateBillingFromBill } from "../src/lib/billing-populate";

async function main() {
  const args = process.argv.slice(2);
  const anoArg = args.find((a) => a.startsWith("--ano="))?.split("=")[1];
  const mesArg = args.find((a) => a.startsWith("--mes="))?.split("=")[1];
  const ucArg = args.find((a) => a.startsWith("--uc="))?.split("=")[1];

  const where: Record<string, unknown> = { consumerUnitId: { not: null } };
  if (anoArg) where.anoReferencia = Number(anoArg);
  if (mesArg) where.mesReferencia = Number(mesArg);
  if (ucArg) where.consumerUnit = { codigoUc: ucArg };

  const bills = await prisma.consumerBill.findMany({
    where,
    select: {
      id: true,
      anoReferencia: true,
      mesReferencia: true,
      consumerUnit: { select: { nome: true, codigoUc: true } },
    },
    orderBy: [{ anoReferencia: "asc" }, { mesReferencia: "asc" }],
  });

  console.log(`Processando ${bills.length} bill(s)…\n`);
  let ok = 0;
  let skipped = 0;
  let failed = 0;
  for (const b of bills) {
    try {
      const r = await populateBillingFromBill(b.id);
      const tag = r.skipped ? "SKIP" : "OK";
      const label = `${r.skipped ? skipped++ && "" : ok++ && ""}${tag}`.replace("NaN", "");
      console.log(
        `[${tag}] ${b.consumerUnit?.nome} (${b.consumerUnit?.codigoUc}) ${String(b.mesReferencia).padStart(2, "0")}/${b.anoReferencia}`,
      );
      if (r.skipped) console.log(`      ${r.skipReason}`);
      else {
        console.log(
          `      valorFatura=${r.valorFatura}  valorCompensado=${r.valorCompensado?.toFixed(2)}  valorCobranca=${r.valorCobranca?.toFixed(2)}  valorEconomia=${r.valorEconomia?.toFixed(2)}  venc=${r.dataVencimento?.toISOString().slice(0, 10)}`,
        );
      }
      if (r.problemas.length) console.log(`      problemas: ${r.problemas.join(" | ")}`);
      // silences unused vars
      void label;
    } catch (e) {
      failed++;
      console.error(
        `[FAIL] ${b.consumerUnit?.nome} (${b.consumerUnit?.codigoUc}) ${b.mesReferencia}/${b.anoReferencia}: ${(e as Error).message}`,
      );
    }
  }
  console.log(`\nResumo: ok=${ok} skipped=${skipped} failed=${failed}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

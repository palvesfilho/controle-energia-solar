/**
 * Reprocessa InvestorPayable pra todas as ConsumerBill elegíveis
 * (consumerUnitId setado, energiaCompensada > 0).
 *
 * Uso:
 *   npx tsx scripts/reprocess-investor-payables.ts
 *   npx tsx scripts/reprocess-investor-payables.ts --plant=<numeroUsina>
 *   npx tsx scripts/reprocess-investor-payables.ts --dry
 *
 * Idempotente: o sync respeita status finais (PAGO etc) e atualiza os demais.
 */
import { PrismaClient } from "@prisma/client";
import { syncInvestorPayablesFromBill } from "../src/lib/investor-payables";

const prisma = new PrismaClient();

function parseArgs() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const plantArg = args.find((a) => a.startsWith("--plant="));
  const plantFilter = plantArg ? plantArg.slice("--plant=".length) : null;
  return { dry, plantFilter };
}

async function main() {
  const { dry, plantFilter } = parseArgs();

  let plantId: string | null = null;
  if (plantFilter) {
    const p = await prisma.plant.findFirst({
      where: { numeroUsina: plantFilter },
      select: { id: true, name: true, numeroUsina: true },
    });
    if (!p) {
      console.error(`Usina com numeroUsina=${plantFilter} não encontrada.`);
      process.exit(1);
    }
    plantId = p.id;
    console.log(`Filtro: usina ${p.numeroUsina} — ${p.name}`);
  }

  // UCs que estão em rateio VIGENTE. Só faz sentido reprocessar essas,
  // porque a função pula UCs sem rateio.
  const itemsVigentes = await prisma.rateioItem.findMany({
    where: {
      version: plantId
        ? { status: "VIGENTE", plantId }
        : { status: "VIGENTE" },
    },
    select: { consumerUnitId: true },
  });
  const ucIds = Array.from(new Set(itemsVigentes.map((i) => i.consumerUnitId)));
  console.log(`UCs em rateio VIGENTE: ${ucIds.length}`);
  if (ucIds.length === 0) {
    console.log("Nada a fazer.");
    await prisma.$disconnect();
    return;
  }

  const bills = await prisma.consumerBill.findMany({
    where: {
      consumerUnitId: { in: ucIds },
      energiaCompensada: { gt: 0 },
    },
    select: {
      id: true,
      anoReferencia: true,
      mesReferencia: true,
      energiaCompensada: true,
      consumerUnitId: true,
      consumerUnit: { select: { codigoUc: true, nome: true } },
    },
    orderBy: [{ anoReferencia: "asc" }, { mesReferencia: "asc" }],
  });
  console.log(`Faturas elegíveis (energiaCompensada > 0): ${bills.length}`);

  if (dry) {
    for (const b of bills) {
      console.log(
        `  [DRY] UC ${b.consumerUnit?.codigoUc} ${b.anoReferencia}-${String(b.mesReferencia).padStart(2, "0")} compensada=${b.energiaCompensada}`,
      );
    }
    await prisma.$disconnect();
    return;
  }

  let criadas = 0;
  let atualizadas = 0;
  let pulled = 0;
  const errosPorMotivo = new Map<string, number>();

  for (const b of bills) {
    try {
      const r = await syncInvestorPayablesFromBill(b.id);
      criadas += r.created;
      atualizadas += r.updated;
      pulled += r.skipped.length;
      for (const motivo of r.skipped) {
        errosPorMotivo.set(motivo, (errosPorMotivo.get(motivo) ?? 0) + 1);
      }
      if (r.created > 0 || r.updated > 0) {
        console.log(
          `  ✓ UC ${b.consumerUnit?.codigoUc} ${b.anoReferencia}-${String(b.mesReferencia).padStart(2, "0")} — criadas=${r.created} atualizadas=${r.updated}`,
        );
      }
    } catch (e) {
      console.error(
        `  ✗ UC ${b.consumerUnit?.codigoUc} ${b.anoReferencia}-${String(b.mesReferencia).padStart(2, "0")}:`,
        e instanceof Error ? e.message : e,
      );
    }
  }

  console.log(`\n=== RESULTADO ===`);
  console.log(`  Payables criadas:    ${criadas}`);
  console.log(`  Payables atualizadas:${atualizadas}`);
  console.log(`  Ocorrências de skip: ${pulled}`);
  if (errosPorMotivo.size > 0) {
    console.log(`\nMotivos de skip:`);
    for (const [m, c] of errosPorMotivo) {
      console.log(`  ${c}× — ${m}`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

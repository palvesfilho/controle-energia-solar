/**
 * Renomeia a regra de remuneração de "DESC_COMPENSADA_BANDEIRAS" para
 * "FAT_UNICA_COMPENSADA_BANDEIRAS" em todas as ConsumerUnits.
 *
 * Uso:
 *   tsx scripts/rename-regra-desc-to-fat-unica.ts           # dry-run
 *   tsx scripts/rename-regra-desc-to-fat-unica.ts --apply   # aplica
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const OLD = "DESC_COMPENSADA_BANDEIRAS";
const NEW = "FAT_UNICA_COMPENSADA_BANDEIRAS";
const APPLY = process.argv.includes("--apply");

async function main() {
  const afetadas = await prisma.consumerUnit.findMany({
    where: { regraRemuneracao: OLD },
    select: { codigoUc: true, nome: true, statusContrato: true },
    orderBy: { nome: "asc" },
  });

  console.log(`Modo: ${APPLY ? "APPLY (escreve)" : "DRY-RUN"}`);
  console.log(`UCs com regraRemuneracao = "${OLD}": ${afetadas.length}\n`);

  for (const u of afetadas) {
    console.log(
      `  ${u.codigoUc.padEnd(12)} ${u.nome.slice(0, 35).padEnd(35)} status=${u.statusContrato}`,
    );
  }

  if (afetadas.length === 0) {
    console.log("\nNada a fazer.");
    return;
  }
  if (!APPLY) {
    console.log("\nDry-run concluído. Rode com --apply para escrever.");
    return;
  }

  const result = await prisma.consumerUnit.updateMany({
    where: { regraRemuneracao: OLD },
    data: { regraRemuneracao: NEW },
  });
  console.log(`\n✓ ${result.count} UC(s) renomeadas para "${NEW}".`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

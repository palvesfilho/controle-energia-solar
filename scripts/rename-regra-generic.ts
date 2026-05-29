/**
 * Renomeia em massa a regraRemuneracao de UCs.
 *
 * Uso:
 *   tsx scripts/rename-regra-generic.ts <REGRA_ANTIGA> <REGRA_NOVA>            # dry-run
 *   tsx scripts/rename-regra-generic.ts <REGRA_ANTIGA> <REGRA_NOVA> --apply    # aplica
 *
 * Ex.:
 *   tsx scripts/rename-regra-generic.ts FATURA_UNICA_COMPENSADA_DOMMO FAT_UNICA_COMPENSADA_BANDEIRAS
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const OLD = process.argv[2];
const NEW = process.argv[3];
const APPLY = process.argv.includes("--apply");

async function main() {
  if (!OLD || !NEW) {
    console.error("Uso: tsx scripts/rename-regra-generic.ts <OLD> <NEW> [--apply]");
    process.exit(1);
  }
  if (OLD === NEW) {
    console.error("OLD e NEW são iguais — nada a fazer.");
    return;
  }

  const afetadas = await prisma.consumerUnit.findMany({
    where: { regraRemuneracao: OLD },
    select: { codigoUc: true, nome: true, statusContrato: true },
    orderBy: { nome: "asc" },
  });

  console.log(`Modo: ${APPLY ? "APPLY (escreve)" : "DRY-RUN"}`);
  console.log(`Regra ANTIGA: "${OLD}"`);
  console.log(`Regra NOVA  : "${NEW}"`);
  console.log(`UCs afetadas: ${afetadas.length}\n`);

  for (const u of afetadas) {
    console.log(
      `  ${u.codigoUc.padEnd(12)} ${u.nome.slice(0, 40).padEnd(40)} status=${u.statusContrato}`,
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
  console.log(`\n✓ ${result.count} UC(s) renomeadas.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

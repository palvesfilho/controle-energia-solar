/**
 * Renomeia em massa a regraRemuneracao de UCs filtradas por nome (contains, case-insensitive).
 *
 * Uso:
 *   tsx scripts/rename-regra-by-name.ts <NOME_CONTEM> <REGRA_NOVA>          # dry-run
 *   tsx scripts/rename-regra-by-name.ts <NOME_CONTEM> <REGRA_NOVA> --apply  # aplica
 *
 * Ex.:
 *   tsx scripts/rename-regra-by-name.ts LABIMED FAT_UNICA_COMPENSADA_BANDEIRAS
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const NEEDLE = process.argv[2];
const NEW = process.argv[3];
const APPLY = process.argv.includes("--apply");

async function main() {
  if (!NEEDLE || !NEW) {
    console.error("Uso: tsx scripts/rename-regra-by-name.ts <NOME_CONTEM> <REGRA_NOVA> [--apply]");
    process.exit(1);
  }

  const ucs = await prisma.consumerUnit.findMany({
    where: { nome: { contains: NEEDLE, mode: "insensitive" } },
    select: {
      id: true,
      codigoUc: true,
      nome: true,
      statusContrato: true,
      regraRemuneracao: true,
    },
    orderBy: { nome: "asc" },
  });

  // Só atualiza quem ainda não está na regra alvo
  const aMudar = ucs.filter((u) => u.regraRemuneracao !== NEW);

  console.log(`Modo: ${APPLY ? "APPLY (escreve)" : "DRY-RUN"}`);
  console.log(`Filtro nome contém : "${NEEDLE}" (case-insensitive)`);
  console.log(`Regra nova         : "${NEW}"`);
  console.log(`UCs encontradas    : ${ucs.length}`);
  console.log(`UCs a mudar        : ${aMudar.length} (${ucs.length - aMudar.length} já em "${NEW}")\n`);

  for (const u of ucs) {
    const marca = u.regraRemuneracao === NEW ? "= já está" : "→ mudar";
    console.log(
      `  ${marca}  ${u.codigoUc.padEnd(12)} ${u.nome.slice(0, 35).padEnd(35)} ` +
        `${(u.regraRemuneracao ?? "(null)").padEnd(33)} status=${u.statusContrato}`,
    );
  }

  if (aMudar.length === 0) {
    console.log("\nNada a fazer.");
    return;
  }
  if (!APPLY) {
    console.log("\nDry-run concluído. Rode com --apply para escrever.");
    return;
  }

  const result = await prisma.consumerUnit.updateMany({
    where: { id: { in: aMudar.map((u) => u.id) } },
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

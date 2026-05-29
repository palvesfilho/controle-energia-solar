/**
 * Normaliza ConsumerUnit.percentCompensado e percentBandeira.
 *
 * Convenção (após esta migração): valor armazenado é decimal (0.80 = 80%).
 * UCs com valor > 1 foram cadastradas erroneamente como "inteiro percentual"
 * (ex.: 80 querendo dizer 80%) e precisam ser divididas por 100.
 *
 * Uso:
 *   tsx scripts/normalize-percent-uc.ts           # dry-run
 *   tsx scripts/normalize-percent-uc.ts --apply   # aplica as mudanças
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const APPLY = process.argv.includes("--apply");

async function main() {
  const ucs = await prisma.consumerUnit.findMany({
    where: {
      OR: [
        { percentCompensado: { gt: 1 } },
        { percentBandeira: { gt: 1 } },
      ],
    },
    select: {
      id: true,
      codigoUc: true,
      nome: true,
      percentCompensado: true,
      percentBandeira: true,
    },
    orderBy: { nome: "asc" },
  });

  console.log(`Modo: ${APPLY ? "APPLY (escreve no banco)" : "DRY-RUN (sem escrever)"}`);
  console.log(`UCs com percent > 1 encontradas: ${ucs.length}\n`);

  if (ucs.length === 0) {
    console.log("Nada a corrigir. Saindo.");
    return;
  }

  const changes: {
    id: string;
    codigoUc: string;
    nome: string;
    newPercentCompensado: number | null;
    newPercentBandeira: number | null;
  }[] = [];

  for (const uc of ucs) {
    const newComp =
      uc.percentCompensado != null && uc.percentCompensado > 1
        ? Number((uc.percentCompensado / 100).toFixed(4))
        : uc.percentCompensado;
    const newBand =
      uc.percentBandeira != null && uc.percentBandeira > 1
        ? Number((uc.percentBandeira / 100).toFixed(4))
        : uc.percentBandeira;

    console.log(
      `  ${uc.codigoUc.padEnd(12)} ${uc.nome.slice(0, 30).padEnd(30)} ` +
        `comp ${uc.percentCompensado} → ${newComp}   ` +
        `band ${uc.percentBandeira} → ${newBand}`,
    );

    changes.push({
      id: uc.id,
      codigoUc: uc.codigoUc,
      nome: uc.nome,
      newPercentCompensado: newComp,
      newPercentBandeira: newBand,
    });
  }

  if (!APPLY) {
    console.log("\nDry-run concluído. Rode novamente com --apply para escrever.");
    return;
  }

  console.log("\nAplicando...");
  for (const c of changes) {
    await prisma.consumerUnit.update({
      where: { id: c.id },
      data: {
        percentCompensado: c.newPercentCompensado,
        percentBandeira: c.newPercentBandeira,
      },
    });
  }
  console.log(`✓ ${changes.length} UC(s) atualizadas.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

/**
 * Marca temGeracaoPropria=true em toda UC que tenha PELO MENOS UMA fatura
 * com energiaInjetadaMedidorKwh > 0.
 */
import { prisma } from "../src/lib/prisma";

const APPLY = process.argv.includes("--apply");

async function main() {
  // Pega UCs (atualmente com flag false) que têm bill com injeção > 0.
  const ucs = await prisma.consumerUnit.findMany({
    where: {
      temGeracaoPropria: false,
      bills: { some: { energiaInjetadaMedidorKwh: { gt: 0 } } },
    },
    select: { id: true, codigoUc: true, nome: true },
  });

  console.log(`UCs a marcar como temGeracaoPropria=true: ${ucs.length}\n`);
  for (const u of ucs) {
    console.log(`   ${u.codigoUc} | ${u.nome}`);
  }

  if (!APPLY) {
    console.log("\n(dry-run — passe --apply pra aplicar)");
    return;
  }
  if (ucs.length === 0) return;

  const res = await prisma.consumerUnit.updateMany({
    where: { id: { in: ucs.map((u) => u.id) } },
    data: { temGeracaoPropria: true },
  });
  console.log(`\n${res.count} UCs atualizadas.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

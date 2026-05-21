/**
 * One-shot: marca contaPaga=true em todas as ConsumerBill com
 * origemPagamento='BACKUP LUMI' e contaPaga=false. Essas faturas tiveram
 * o pagamento conferido manualmente pelo Paulo antes da importação Lumi,
 * então pulam a etapa de confirmação via Infosimples.
 *
 * Rodado em 2026-05-21.
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  const where = {
    origemPagamento: "BACKUP LUMI",
    contaPaga: false,
  } as const;

  const before = await prisma.consumerBill.count({ where });
  console.log(`Faturas a atualizar: ${before}`);
  if (before === 0) {
    console.log("Nada a fazer.");
    await prisma.$disconnect();
    return;
  }

  const result = await prisma.consumerBill.updateMany({
    where,
    data: { contaPaga: true },
  });
  console.log(`UPDATE concluído. Linhas afetadas: ${result.count}`);

  const after = await prisma.consumerBill.count({ where });
  console.log(`Restantes (deveria ser 0): ${after}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

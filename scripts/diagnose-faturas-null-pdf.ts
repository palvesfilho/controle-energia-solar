import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const total = await prisma.consumerBill.count({ where: { anoReferencia: 2026 } });
  const semPdf = await prisma.consumerBill.count({
    where: { anoReferencia: 2026, pdfUrl: null },
  });
  const comPdf = total - semPdf;
  console.log(`Bills 2026: ${total}`);
  console.log(`  com pdfUrl: ${comPdf}`);
  console.log(`  pdfUrl null: ${semPdf}`);

  const byOrigem = await prisma.consumerBill.groupBy({
    by: ["origemPagamento"],
    where: { anoReferencia: 2026, pdfUrl: null },
    _count: true,
  });
  console.log("\nDistribuição dos pdfUrl=null por origemPagamento:");
  for (const r of byOrigem) console.log(`  ${r._count}x  ${r.origemPagamento ?? "(null)"}`);

  const byMes = await prisma.consumerBill.groupBy({
    by: ["mesReferencia"],
    where: { anoReferencia: 2026, pdfUrl: null },
    _count: true,
    orderBy: { mesReferencia: "asc" },
  });
  console.log("\nDistribuição dos pdfUrl=null por mês:");
  for (const r of byMes) console.log(`  mes=${r.mesReferencia}: ${r._count}`);
}

main().finally(() => prisma.$disconnect());

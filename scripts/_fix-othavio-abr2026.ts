/**
 * Aplica o fallback PDF na fatura abril/2026 do Othavio (corrompida pelo OCR Infosimples).
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { enrichBillFromPdfFallback } from "../src/lib/infosimples-pdf-fallback";

async function main() {
  const bill = await prisma.consumerBill.findFirst({
    where: {
      consumerUnitId: "cmomq0ih61bshstgh3aj4u4in",
      anoReferencia: 2026,
      mesReferencia: 4,
    },
  });
  if (!bill) { console.log("Fatura não encontrada"); return; }
  console.log(`Antes:`);
  console.log(`  energiaInjetadaMedidorKwh: ${bill.energiaInjetadaMedidorKwh}`);
  console.log(`  leituraInjetadaAnterior: ${bill.leituraInjetadaAnterior}`);
  console.log(`  leituraInjetadaAtual: ${bill.leituraInjetadaAtual}`);
  console.log(`  constanteMedidorInjetada: ${bill.constanteMedidorInjetada}`);
  console.log(`  pdfUrl: ${bill.pdfUrl}`);

  const result = await enrichBillFromPdfFallback(
    bill as unknown as Record<string, unknown>,
    bill.pdfUrl,
  );
  console.log(`\nFallback rodado:`);
  console.log(`  usedFallback: ${result.usedFallback}`);
  console.log(`  fieldsBackfilled: ${result.fieldsBackfilled.join(", ")}`);
  console.log(`  reason: ${result.reason ?? "-"}`);

  if (!result.usedFallback) {
    console.log("Nada pra atualizar");
    await prisma.$disconnect();
    return;
  }

  // Pegar só os campos preenchidos pra atualizar
  const updates: Record<string, unknown> = {};
  for (const field of result.fieldsBackfilled) {
    updates[field] = (result.enriched as Record<string, unknown>)[field];
  }
  await prisma.consumerBill.update({ where: { id: bill.id }, data: updates });

  const updated = await prisma.consumerBill.findUnique({
    where: { id: bill.id },
    select: {
      energiaInjetadaMedidorKwh: true,
      leituraInjetadaAnterior: true,
      leituraInjetadaAtual: true,
      constanteMedidorInjetada: true,
    },
  });
  console.log(`\nDepois:`);
  console.log(JSON.stringify(updated, null, 2));

  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

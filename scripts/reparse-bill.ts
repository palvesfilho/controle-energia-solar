import { promises as fs } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { parseFaturaPdf } from "../src/lib/fatura-pdf-parser";

const prisma = new PrismaClient();

async function main() {
  const billId = process.argv[2];
  if (!billId) {
    console.error("uso: npx tsx scripts/reparse-bill.ts <billId>");
    process.exit(1);
  }
  const bill = await prisma.consumerBill.findUnique({
    where: { id: billId },
    select: { id: true, consumerUnitId: true, anoReferencia: true, mesReferencia: true, pdfUrl: true },
  });
  if (!bill) {
    console.error("Bill não encontrada");
    process.exit(1);
  }
  if (!bill.pdfUrl) {
    console.error("Bill sem pdfUrl — nada pra re-parsear");
    process.exit(1);
  }
  // pdfUrl é tipo /api/files/bills/<ucId>/<ano>-<mes>.pdf → mapeia pra uploads/bills/<ucId>/<ano>-<mes>.pdf
  const localPath = bill.pdfUrl.replace(/^\/api\/files\//, "uploads/");
  const buf = await fs.readFile(localPath);
  const parsed = await parseFaturaPdf(new Uint8Array(buf));
  console.log("Parsed:");
  console.log(`  energiaInjetadaMedidorKwh: ${parsed.bill.energiaInjetadaMedidorKwh}`);
  console.log(`  leituraInjetadaAnterior: ${parsed.bill.leituraInjetadaAnterior}`);
  console.log(`  leituraInjetadaAtual: ${parsed.bill.leituraInjetadaAtual}`);
  console.log(`  constanteMedidorInjetada: ${parsed.bill.constanteMedidorInjetada}`);

  const updated = await prisma.consumerBill.update({
    where: { id: bill.id },
    data: { ...parsed.bill, syncedAt: new Date() },
    select: { id: true, energiaInjetadaMedidorKwh: true, leituraInjetadaAtual: true },
  });
  console.log("\nBill atualizada:");
  console.log(`  id: ${updated.id}`);
  console.log(`  energiaInjetadaMedidorKwh: ${updated.energiaInjetadaMedidorKwh}`);
  console.log(`  leituraInjetadaAtual: ${updated.leituraInjetadaAtual}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

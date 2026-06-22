import "dotenv/config";
import { listExistingKeys } from "../src/lib/file-storage";
import { prisma } from "../src/lib/prisma";

// Re-vincula PDFs órfãos no R2 a bills com pdfUrl=null.
// Procura por arquivos em `bills/<consumerUnitId|plantId>/<ano>-<mes>.pdf` que
// já existem no R2 mas não estão referenciados no banco.
//
// Use --dry-run pra ver o que mudaria sem aplicar.
async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(dryRun ? "DRY RUN — nada será salvo\n" : "MODO REAL — vai persistir alterações\n");

  const keys = await listExistingKeys("bills");
  console.log(`R2 keys sob bills/: ${keys.size}`);

  const bills = await prisma.consumerBill.findMany({
    where: { pdfUrl: null },
    select: {
      id: true,
      consumerUnitId: true,
      plantId: true,
      mesReferencia: true,
      anoReferencia: true,
    },
  });
  console.log(`Bills com pdfUrl=null (todos os anos): ${bills.length}\n`);

  const updates: { id: string; pdfUrl: string }[] = [];
  let semDono = 0;
  let semArquivo = 0;
  for (const b of bills) {
    const ucId = b.consumerUnitId ?? b.plantId;
    if (!ucId) {
      semDono++;
      continue;
    }
    const expected = `bills/${ucId}/${b.anoReferencia}-${String(b.mesReferencia).padStart(2, "0")}.pdf`;
    if (!keys.has(expected)) {
      semArquivo++;
      continue;
    }
    updates.push({ id: b.id, pdfUrl: `/api/files/${expected}` });
  }

  console.log(`Re-vincular: ${updates.length}`);
  console.log(`Sem UC nem Plant: ${semDono}`);
  console.log(`Arquivo não existe no R2: ${semArquivo}\n`);

  if (updates.length === 0) {
    console.log("Nada a fazer.");
    return;
  }

  if (dryRun) {
    console.log("Primeiros 5 updates que seriam aplicados:");
    for (const u of updates.slice(0, 5)) {
      console.log(`  bill ${u.id} → ${u.pdfUrl}`);
    }
    return;
  }

  let n = 0;
  for (const u of updates) {
    await prisma.consumerBill.update({
      where: { id: u.id },
      data: { pdfUrl: u.pdfUrl },
    });
    n++;
    if (n % 50 === 0) console.log(`  ${n}/${updates.length}`);
  }
  console.log(`\nFinalizado: ${n} bills atualizadas.`);
}

main().finally(() => prisma.$disconnect());

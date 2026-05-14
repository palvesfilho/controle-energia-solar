import "dotenv/config";
import { listExistingKeys } from "../src/lib/file-storage";
import { relativePathToKey } from "../src/lib/r2-storage";
import { prisma } from "../src/lib/prisma";

async function main() {
  console.log(`STORAGE_BACKEND=${process.env.STORAGE_BACKEND ?? "(undefined)"}`);

  const keys = await listExistingKeys("bills");
  console.log(`R2 contém ${keys.size} keys com conteúdo sob bills/`);
  for (const k of [...keys].slice(0, 5)) console.log(`  ${k}`);

  const bills = await prisma.consumerBill.findMany({
    where: { anoReferencia: 2026, pdfUrl: { not: null } },
    select: { id: true, pdfUrl: true, mesReferencia: true },
    take: 30,
  });

  let ok = 0;
  let missing = 0;
  for (const b of bills) {
    const key = relativePathToKey(b.pdfUrl!);
    if (keys.has(key)) ok++;
    else missing++;
  }
  console.log(`\nDe ${bills.length} bills c/ pdfUrl em 2026: ${ok} têm arquivo no storage, ${missing} estão órfãos`);
}

main().finally(() => prisma.$disconnect());

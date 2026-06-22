import "dotenv/config";
import { listExistingKeys } from "../src/lib/file-storage";
import { relativePathToKey } from "../src/lib/r2-storage";
import { prisma } from "../src/lib/prisma";

async function main() {
  console.log(`STORAGE_BACKEND=${process.env.STORAGE_BACKEND ?? "(undefined)"}`);

  const keys = await listExistingKeys("bills");
  console.log(`R2 contém ${keys.size} keys sob bills/`);

  const bills = await prisma.consumerBill.findMany({
    where: { anoReferencia: 2026, pdfUrl: { not: null } },
    select: { id: true, pdfUrl: true, mesReferencia: true, consumerUnitId: true, plantId: true },
  });
  console.log(`Bills 2026 com pdfUrl: ${bills.length}`);

  let ok = 0;
  let missing = 0;
  const missingByPattern = new Map<string, number>();
  const missingSamples: { pdfUrl: string; key: string }[] = [];
  for (const b of bills) {
    const key = relativePathToKey(b.pdfUrl!);
    if (keys.has(key)) {
      ok++;
    } else {
      missing++;
      const prefix = b.pdfUrl!.split("/").slice(0, 3).join("/");
      missingByPattern.set(prefix, (missingByPattern.get(prefix) ?? 0) + 1);
      if (missingSamples.length < 8) missingSamples.push({ pdfUrl: b.pdfUrl!, key });
    }
  }
  console.log(`OK: ${ok}  Órfãs: ${missing}\n`);

  if (missing > 0) {
    console.log("Distribuição dos órfãos por prefixo:");
    for (const [prefix, count] of [...missingByPattern.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${count}x  ${prefix}/...`);
    }
    console.log("\nAmostras (pdfUrl → key esperada no R2):");
    for (const s of missingSamples) {
      console.log(`  pdfUrl=${s.pdfUrl}`);
      console.log(`   key=${s.key}`);
    }
  }
}

main().finally(() => prisma.$disconnect());

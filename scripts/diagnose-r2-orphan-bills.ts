import "dotenv/config";
import { listExistingKeys } from "../src/lib/file-storage";
import { prisma } from "../src/lib/prisma";

// Pra cada ConsumerBill 2026 com pdfUrl=null, checa se existe arquivo no R2 no
// caminho esperado `bills/<consumerUnitId>/<ano>-<mes>.pdf`. Se sim, é só re-vincular.
async function main() {
  const keys = await listExistingKeys("bills");
  console.log(`R2 keys sob bills/: ${keys.size}\n`);

  const bills = await prisma.consumerBill.findMany({
    where: { anoReferencia: 2026, pdfUrl: null },
    select: {
      id: true,
      consumerUnitId: true,
      plantId: true,
      mesReferencia: true,
      anoReferencia: true,
      origemPagamento: true,
    },
  });
  console.log(`Bills 2026 com pdfUrl=null: ${bills.length}\n`);

  let podeRelinkar = 0;
  let semPdfMesmo = 0;
  const porOrigem: Record<string, { relinkable: number; missing: number }> = {};

  for (const b of bills) {
    const ucId = b.consumerUnitId ?? b.plantId;
    if (!ucId) {
      semPdfMesmo++;
      continue;
    }
    const expected = `bills/${ucId}/${b.anoReferencia}-${String(b.mesReferencia).padStart(2, "0")}.pdf`;
    const origem = b.origemPagamento ?? "(null)";
    porOrigem[origem] ??= { relinkable: 0, missing: 0 };

    if (keys.has(expected)) {
      podeRelinkar++;
      porOrigem[origem].relinkable++;
    } else {
      semPdfMesmo++;
      porOrigem[origem].missing++;
    }
  }

  console.log(`Total: ${bills.length}`);
  console.log(`  PDF existe no R2 (só falta re-vincular): ${podeRelinkar}`);
  console.log(`  PDF realmente NÃO está no R2: ${semPdfMesmo}\n`);

  console.log("Por origem:");
  for (const [origem, counts] of Object.entries(porOrigem)) {
    console.log(`  ${origem}: ${counts.relinkable} relinkáveis, ${counts.missing} faltam mesmo`);
  }
}

main().finally(() => prisma.$disconnect());

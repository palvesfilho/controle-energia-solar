import "dotenv/config";
import { listExistingKeys } from "../src/lib/file-storage";
import { prisma } from "../src/lib/prisma";

async function main() {
  const keys = await listExistingKeys("bills");
  const bills = await prisma.consumerBill.findMany({
    where: { pdfUrl: null },
    select: {
      id: true,
      consumerUnitId: true,
      plantId: true,
      mesReferencia: true,
      anoReferencia: true,
      origemPagamento: true,
      consumerUnit: { select: { codigoUc: true, nome: true } },
      plant: { select: { unidadeConsumidora: true, name: true } },
    },
    orderBy: [{ anoReferencia: "asc" }, { mesReferencia: "asc" }],
  });

  const missing: typeof bills = [];
  for (const b of bills) {
    const ucId = b.consumerUnitId ?? b.plantId;
    if (!ucId) continue;
    const expected = `bills/${ucId}/${b.anoReferencia}-${String(b.mesReferencia).padStart(2, "0")}.pdf`;
    if (!keys.has(expected)) missing.push(b);
  }

  console.log(`Bills sem PDF nem no R2 (${missing.length}):\n`);
  for (const b of missing) {
    const codigo = b.consumerUnit?.codigoUc ?? b.plant?.unidadeConsumidora ?? "(?)";
    const nome = b.consumerUnit?.nome ?? b.plant?.name ?? "(?)";
    console.log(
      `  ${b.anoReferencia}-${String(b.mesReferencia).padStart(2, "0")}  UC=${codigo}  ${nome}  origem=${b.origemPagamento ?? "(null)"}`,
    );
  }
}

main().finally(() => prisma.$disconnect());

import { prisma } from "../src/lib/prisma";

async function main() {
  const plantId = "c92bd286-6c47-4609-9edb-9443bc30cb77";
  const ano = 2025;
  const mes = 12;

  const billing = await prisma.plantBilling.findFirst({
    where: { plantId, ano, mes },
    select: { id: true, encerradoEm: true, status: true, comprovantePagamentoUrl: true },
  });
  console.log("PlantBilling:", billing);

  const reports = await prisma.monthlyReport.findMany({
    where: { plantId, ano, mes },
    select: { id: true, investorId: true, status: true, publishedAt: true, snapshotJson: true },
  });
  for (const r of reports) {
    console.log(`MonthlyReport ${r.id} | status=${r.status} | publishedAt=${r.publishedAt?.toISOString() ?? null} | snapshot=${r.snapshotJson ? "TEM (length=" + r.snapshotJson.length + ")" : "NULL"}`);
    if (r.snapshotJson) {
      try {
        const parsed = JSON.parse(r.snapshotJson);
        console.log(`  snapshot: bruto=${parsed.valorBruto} ajustes=${parsed.valorAjustesGerais} liquido=${parsed.valorReceber}`);
      } catch (e) {}
    }
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());

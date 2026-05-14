import { prisma } from "../src/lib/prisma";
import { janelaFaturasUsinaDescontadas } from "../src/lib/janela-faturas-usina";

const PLANT_ID = "c92bd286-6c47-4609-9edb-9443bc30cb77";

async function main() {
  // Lista MonthlyReports PUBLISHED da Sidinei
  const reports = await prisma.monthlyReport.findMany({
    where: { plantId: PLANT_ID, status: "PUBLISHED" },
    orderBy: [{ ano: "asc" }, { mes: "asc" }],
    select: { ano: true, mes: true, status: true },
  });
  console.log(`MonthlyReports PUBLISHED (${reports.length}):`);
  for (const r of reports) {
    console.log(`   ${r.ano}-${String(r.mes).padStart(2, "0")} | ${r.status}`);
  }

  const plant = await prisma.plant.findUnique({
    where: { id: PLANT_ID },
    select: { dataAssinaturaContrato: true },
  });

  console.log("\nJanela de faturas da usina por mês de relatório:");
  for (const { ano, mes } of [
    { ano: 2025, mes: 6 },
    { ano: 2025, mes: 8 },
    { ano: 2025, mes: 9 },
    { ano: 2025, mes: 10 },
    { ano: 2025, mes: 11 },
  ]) {
    const bills = await janelaFaturasUsinaDescontadas({
      plantId: PLANT_ID,
      ano,
      mes,
      dataAssinaturaContrato: plant?.dataAssinaturaContrato ?? null,
    });
    const labels = bills.map((b) => `${b.anoReferencia}-${String(b.mesReferencia).padStart(2, "0")}`).join(", ");
    const total = bills.reduce((s, b) => s + (b.valorTotal ?? 0), 0);
    console.log(
      `   Relatório ${ano}-${String(mes).padStart(2, "0")}: ${bills.length} fatura(s) [${labels}] | total R$ ${total.toFixed(2)}`,
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });

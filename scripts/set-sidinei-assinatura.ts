import { prisma } from "../src/lib/prisma";

const PLANT_ID = "c92bd286-6c47-4609-9edb-9443bc30cb77";
const DATA = new Date("2025-05-01T00:00:00.000Z");

async function main() {
  await prisma.plant.update({
    where: { id: PLANT_ID },
    data: { dataAssinaturaContrato: DATA },
  });
  console.log(`Sidinei.dataAssinaturaContrato = ${DATA.toISOString().slice(0,10)}\n`);

  // Mostra quais faturas da UC geradora vão entrar na janela
  const bills = await prisma.consumerBill.findMany({
    where: {
      plantId: PLANT_ID,
      consumerUnitId: null,
    },
    orderBy: [{ anoReferencia: "asc" }, { mesReferencia: "asc" }],
    select: {
      anoReferencia: true,
      mesReferencia: true,
      valorTotal: true,
    },
  });

  const ano = DATA.getUTCFullYear();
  const mes = DATA.getUTCMonth() + 1;
  console.log("Faturas da UC geradora:");
  let totalDescontado = 0;
  for (const b of bills) {
    const dentro = b.anoReferencia > ano || (b.anoReferencia === ano && b.mesReferencia >= mes);
    const status = dentro ? "✓ DENTRO da janela" : "✗ ANTES (ignorada)";
    console.log(`   ${b.anoReferencia}-${String(b.mesReferencia).padStart(2,"0")} | R$${b.valorTotal?.toFixed(2)?.padStart(8) ?? "—"} | ${status}`);
    if (dentro) totalDescontado += b.valorTotal ?? 0;
  }
  console.log(`\nTotal de faturas a descontar no PRIMEIRO relatório (até a competência mais antiga ainda em aberto):`);
  console.log(`Soma de Mai/2025 → cada mês de competência depende de qual mês o operador abrir como primeiro.`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });

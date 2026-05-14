/**
 * Diagnostic: rastreia o estado dos payables e debits que fazem o
 * valorReceberTeorico de Outubro/2025 do Sidinei dobrar entre publicacoes.
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  const plantId = "c92bd286-6c47-4609-9edb-9443bc30cb77";
  const investorId = "cmoekxsvq0004q2rvmjbffrww";

  // Debits relacionados ao relatorio de Out/2025
  const debitos = await prisma.investorDebit.findMany({
    where: {
      investorId,
      motivo: { startsWith: "Saldo negativo do relatorio Outubro/2025" },
    },
    include: {
      applications: { select: { payableId: true, valorAbatido: true } },
    },
    orderBy: { criadoEm: "asc" },
  });
  console.log("=== DEBITS de Out/2025 ===");
  for (const d of debitos) {
    console.log(
      `${d.id} | original=${d.valorOriginal} restante=${d.valorRestante} status=${d.status} | criado=${d.criadoEm.toISOString()} | apps=${d.applications.length}`,
    );
    for (const a of d.applications) {
      console.log(`    -> payable=${a.payableId} abatido=${a.valorAbatido}`);
    }
  }

  // Estado atual dos payables que entram no calculo de Out
  console.log("\n=== PAYABLES de Out (originatedByPlantBill=Out, status DISPONIVEL/PAGO) ===");
  const payablesOut = await prisma.investorPayable.findMany({
    where: {
      plantId,
      investorId,
      status: { in: ["DISPONIVEL", "PAGO"] },
      originatedByPlantBill: { anoReferencia: 2025, mesReferencia: 10 },
    },
    select: {
      id: true,
      anoReferencia: true,
      mesReferencia: true,
      kwhCompensadoBase: true,
      kwhCompensadoAjuste: true,
      valorBruto: true,
      valorAjuste: true,
      valorAbatidoDebito: true,
      valorLiquido: true,
      status: true,
      carriedFromPayableId: true,
      consumerUnit: { select: { codigoUc: true } },
    },
  });
  let bruto = 0;
  let liquido = 0;
  for (const p of payablesOut) {
    const tipo = p.carriedFromPayableId ? "saldo" : "natural";
    console.log(
      `${p.consumerUnit?.codigoUc} | ${tipo} | display=${p.anoReferencia}-${String(p.mesReferencia).padStart(2, "0")} | bruto=${p.valorBruto} ajuste=${p.valorAjuste} abate=${p.valorAbatidoDebito} liquido=${p.valorLiquido}`,
    );
    bruto += (p.valorBruto ?? 0) + (p.valorAjuste ?? 0);
    liquido += p.valorLiquido ?? 0;
  }
  console.log(`\nTOTAL bruto=${bruto.toFixed(2)} liquido=${liquido.toFixed(2)}`);
  console.log(`Diferenca (= sum valorAbatidoDebito): ${(bruto - liquido).toFixed(2)}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());

/**
 * Estado real do payable Fábrica display=Dec, origem=Nov.
 * Verifica se valorLiquido bate com valorBruto + valorAjuste - valorAbatidoDebito.
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  const plantId = "c92bd286-6c47-4609-9edb-9443bc30cb77";
  const investorId = "cmoekxsvq0004q2rvmjbffrww";

  console.log("=== Payables com display=Dec/2025 ===");
  const payables = await prisma.investorPayable.findMany({
    where: {
      plantId,
      investorId,
      anoReferencia: 2025,
      mesReferencia: 12,
    },
    select: {
      id: true,
      consumerUnit: { select: { codigoUc: true, nome: true } },
      kwhCompensadoBase: true,
      kwhCompensadoAjuste: true,
      valorKwhContrato: true,
      valorBruto: true,
      valorAjuste: true,
      valorAbatidoDebito: true,
      valorLiquido: true,
      status: true,
      carriedFromPayableId: true,
      originatedByPlantBill: {
        select: { anoReferencia: true, mesReferencia: true },
      },
    },
  });

  for (const p of payables) {
    const expectedDevido = (p.valorBruto ?? 0) + (p.valorAjuste ?? 0);
    const expectedLiquido = Math.max(0, expectedDevido - (p.valorAbatidoDebito ?? 0));
    const liquidoOK = Math.abs((p.valorLiquido ?? 0) - expectedLiquido) < 0.01;
    console.log(
      `${p.consumerUnit?.codigoUc} ${p.carriedFromPayableId ? "saldo" : "natural"} origem=${p.originatedByPlantBill?.anoReferencia}-${String(p.originatedByPlantBill?.mesReferencia ?? 0).padStart(2, "0")}`,
    );
    console.log(
      `  kwh: base=${p.kwhCompensadoBase} ajuste=${p.kwhCompensadoAjuste} | tarifa=${p.valorKwhContrato}`,
    );
    console.log(
      `  bruto=${p.valorBruto} ajuste=${p.valorAjuste} abate=${p.valorAbatidoDebito} liquido=${p.valorLiquido} | esperado liquido=${expectedLiquido} ${liquidoOK ? "OK" : "✗ INCONSISTENTE"}`,
    );
    console.log(
      `  status=${p.status}`,
    );
  }

  // Soma como o page calcula
  const realizado = payables.filter((p) => p.status === "DISPONIVEL" || p.status === "PAGO");
  const sumBruto = realizado.reduce((s, p) => s + (p.valorBruto ?? 0) + (p.valorAjuste ?? 0), 0);
  const sumLiquido = realizado.reduce((s, p) => s + (p.valorLiquido ?? 0), 0);
  const sumAbate = realizado.reduce((s, p) => s + (p.valorAbatidoDebito ?? 0), 0);
  console.log("\n=== SOMAS REALIZADO (DISPONIVEL/PAGO) ===");
  console.log(`Sum (valorBruto+valorAjuste): ${sumBruto.toFixed(2)}`);
  console.log(`Sum valorLiquido: ${sumLiquido.toFixed(2)}`);
  console.log(`Sum valorAbatidoDebito: ${sumAbate.toFixed(2)}`);
  console.log(`Diff (bruto - liquido - abate): ${(sumBruto - sumLiquido - sumAbate).toFixed(2)} (deveria ser 0)`);
}

main().catch(console.error).finally(() => prisma.$disconnect());

/**
 * Simula a logica do GET billing/plants/[id] pra Dez/2025 do Sidinei.
 * Mostra valorBrutoRealizado, valorAjustesGerais, valorLiquidoInvestidor.
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  const plantId = "c92bd286-6c47-4609-9edb-9443bc30cb77";
  const ano = 2025;
  const mes = 12;

  const billing = await prisma.plantBilling.findFirst({
    where: { plantId, ano, mes },
    include: {
      plant: { select: { investors: { select: { gestaoFixaContrato: true } } } },
    },
  });
  if (!billing) {
    console.log("Sem PlantBilling pra Dez/2025");
    return;
  }
  const gestaoFixa = billing.plant.investors[0]?.gestaoFixaContrato ?? null;
  console.log("gestaoFixaMensal:", gestaoFixa);

  // ConsumerBill (UC geradora) de Dez
  const billUsina = await prisma.consumerBill.findFirst({
    where: {
      plantId,
      consumerUnitId: null,
      anoReferencia: ano,
      mesReferencia: mes,
    },
    select: { valorTotal: true },
  });
  console.log("conta usina (Dez):", billUsina?.valorTotal);

  // Query dos payables (igual ao route)
  const payables = await prisma.investorPayable.findMany({
    where: {
      plantId,
      OR: [
        {
          carriedFromPayableId: null,
          originatedByPlantBill: { anoReferencia: ano, mesReferencia: mes },
        },
        {
          carriedFromPayableId: null,
          anoReferencia: ano,
          mesReferencia: mes,
        },
        {
          carriedFromPayableId: { not: null },
          anoReferencia: ano,
          mesReferencia: mes,
        },
      ],
    },
    select: {
      id: true,
      status: true,
      valorBruto: true,
      valorAjuste: true,
      valorAbatidoDebito: true,
      valorLiquido: true,
      anoReferencia: true,
      mesReferencia: true,
      carriedFromPayableId: true,
      consumerUnit: { select: { codigoUc: true } },
    },
  });
  console.log(`\nTotal payables: ${payables.length}`);
  for (const p of payables) {
    console.log(
      `  ${p.consumerUnit?.codigoUc} ${p.carriedFromPayableId ? "saldo" : "natural"} | bruto=${p.valorBruto} ajuste=${p.valorAjuste} abate=${p.valorAbatidoDebito} liquido=${p.valorLiquido} | ${p.status}`,
    );
  }

  const realizado = payables.filter(
    (p) => p.status === "DISPONIVEL" || p.status === "PAGO",
  );
  const valorBrutoRealizado = realizado.reduce(
    (s, p) => s + (p.valorBruto ?? 0) + (p.valorAjuste ?? 0),
    0,
  );
  const hasCashFlow = realizado.length > 0;
  // Abate: ORIGEM-based. Sidinei Dec: 0 origem=Dec realizado.
  const valorAjustesGerais = 0;
  // Conta + gestao: cash flow based.
  const valorContaUcUsina = hasCashFlow ? (billUsina?.valorTotal ?? null) : null;
  const gestaoApplied = hasCashFlow ? gestaoFixa : null;
  const liquidoTeorico =
    valorBrutoRealizado -
    (gestaoApplied ?? 0) -
    (valorContaUcUsina ?? 0) -
    valorAjustesGerais;

  console.log("\n=== CALCULO ===");
  console.log("valorBrutoRealizado:", valorBrutoRealizado);
  console.log("- gestaoFixaMensal:", gestaoFixa);
  console.log("- valorContaUcUsina:", valorContaUcUsina);
  console.log("- valorAjustesGerais:", valorAjustesGerais);
  console.log("= liquidoTeorico:", liquidoTeorico);
  console.log("(clampado a 0):", Math.max(0, liquidoTeorico));
}

main().catch(console.error).finally(() => prisma.$disconnect());

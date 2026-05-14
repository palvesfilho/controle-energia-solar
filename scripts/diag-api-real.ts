/**
 * Mimics the FULL billing/plants/[id] route logic (post-fix) and prints
 * the computed financial values to debug what the API actually returns.
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  const billingId = "cmoesxblg0225h2u2pkg2jiw9"; // Sidinei Dec/2025 PlantBilling

  const billing = await prisma.plantBilling.findUnique({
    where: { id: billingId },
    include: {
      plant: {
        select: {
          investors: { select: { gestaoFixaContrato: true }, take: 1 },
          dataAssinaturaContrato: true,
        },
      },
    },
  });
  if (!billing) {
    console.log("billing not found");
    return;
  }
  const gestaoFixaMensal = billing.plant.investors[0]?.gestaoFixaContrato ?? null;

  const billUsinaMesAtual = await prisma.consumerBill.findFirst({
    where: {
      plantId: billing.plantId,
      consumerUnitId: null,
      anoReferencia: billing.ano,
      mesReferencia: billing.mes,
    },
    orderBy: { syncedAt: "desc" },
    select: { id: true, valorTotal: true },
  });
  const valorContaUcUsina = billUsinaMesAtual?.valorTotal ?? null;

  const payables = await prisma.investorPayable.findMany({
    where: {
      plantId: billing.plantId,
      OR: [
        { carriedFromPayableId: null, originatedByPlantBill: { anoReferencia: billing.ano, mesReferencia: billing.mes } },
        { carriedFromPayableId: null, anoReferencia: billing.ano, mesReferencia: billing.mes },
        { carriedFromPayableId: { not: null }, anoReferencia: billing.ano, mesReferencia: billing.mes },
      ],
    },
    select: {
      id: true,
      status: true,
      valorBruto: true,
      valorAjuste: true,
      valorAbatidoDebito: true,
      consumerUnit: { select: { codigoUc: true } },
      carriedFromPayableId: true,
    },
  });

  const realizado = payables.filter((p) => p.status === "DISPONIVEL" || p.status === "PAGO");
  const valorBrutoRealizado = realizado.reduce((s, p) => s + (p.valorBruto ?? 0) + (p.valorAjuste ?? 0), 0);

  console.log("billing.ano/mes:", billing.ano, billing.mes);
  console.log("gestaoFixaMensal:", gestaoFixaMensal);
  console.log("valorContaUcUsina:", valorContaUcUsina);
  console.log("\n--- payables retornados pela query ---");
  for (const p of payables) {
    console.log(
      `${p.consumerUnit?.codigoUc} ${p.carriedFromPayableId ? "saldo" : "natural"} | bruto=${p.valorBruto} ajuste=${p.valorAjuste} | ${p.status}`,
    );
  }
  console.log("\nrealizado.length:", realizado.length);
  console.log("valorBrutoRealizado:", valorBrutoRealizado);
  console.log("liquido (bruto - gestao - conta - 0):", valorBrutoRealizado - (gestaoFixaMensal ?? 0) - (valorContaUcUsina ?? 0));
}

main().catch(console.error).finally(() => prisma.$disconnect());

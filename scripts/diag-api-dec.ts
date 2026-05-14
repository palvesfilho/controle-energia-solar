/**
 * Mimics the API exactly to see what it returns for Dec 2025.
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  const plantId = "c92bd286-6c47-4609-9edb-9443bc30cb77";
  const ano = 2025;
  const mes = 12;

  const billing = await prisma.plantBilling.findFirst({
    where: { plantId, ano, mes },
    select: { id: true, plantId: true, ano: true, mes: true },
  });
  if (!billing) {
    console.log("Sem billing");
    return;
  }

  const payables = await prisma.investorPayable.findMany({
    where: {
      plantId: billing.plantId,
      OR: [
        {
          carriedFromPayableId: null,
          originatedByPlantBill: {
            anoReferencia: billing.ano,
            mesReferencia: billing.mes,
          },
        },
        {
          carriedFromPayableId: null,
          anoReferencia: billing.ano,
          mesReferencia: billing.mes,
        },
        {
          carriedFromPayableId: { not: null },
          anoReferencia: billing.ano,
          mesReferencia: billing.mes,
        },
      ],
    },
    select: {
      id: true,
      status: true,
      kwhCompensadoBase: true,
      kwhCompensadoAjuste: true,
      valorBruto: true,
      valorAjuste: true,
      valorAbatidoDebito: true,
      valorLiquido: true,
      consumerUnit: { select: { codigoUc: true } },
      anoReferencia: true,
      mesReferencia: true,
      originatedByPlantBill: { select: { anoReferencia: true, mesReferencia: true } },
      carriedFromPayableId: true,
    },
  });

  console.log(`Total payables retornados: ${payables.length}`);
  for (const p of payables) {
    console.log(
      `${p.consumerUnit?.codigoUc} | ${p.carriedFromPayableId ? "saldo" : "natural"} | display=${p.anoReferencia}-${String(p.mesReferencia).padStart(2, "0")} origem=${p.originatedByPlantBill?.anoReferencia ?? "?"}-${String(p.originatedByPlantBill?.mesReferencia ?? 0).padStart(2, "0")} | bruto=${p.valorBruto} ajuste=${p.valorAjuste} | ${p.status}`,
    );
  }

  const realizado = payables.filter((p) => p.status === "DISPONIVEL" || p.status === "PAGO");
  const sumBruto = realizado.reduce((s, p) => s + (p.valorBruto ?? 0) + (p.valorAjuste ?? 0), 0);
  console.log(`\nSum bruto+ajuste (realizado): ${sumBruto}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());

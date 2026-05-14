/**
 * Diagnostic: identifica a UC Camobi e mostra o que o billing detail
 * page de Outubro/2025 retorna pra ela.
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  const plantId = "c92bd286-6c47-4609-9edb-9443bc30cb77";

  console.log("=== TODAS AS UCs DA PLANT (rateios) ===");
  const rateios = await prisma.rateioVersion.findMany({
    where: { plantId },
    select: {
      id: true,
      status: true,
      vigenteAPartirDe: true,
      items: {
        select: {
          consumerUnit: { select: { id: true, codigoUc: true, nome: true } },
          percentual: true,
        },
      },
    },
  });
  for (const r of rateios) {
    console.log(`\nRateio ${r.id} (${r.status}, vigente ${r.vigenteAPartirDe?.toISOString().slice(0, 10)})`);
    for (const it of r.items) {
      console.log(
        `  ${it.consumerUnit.codigoUc} | ${it.consumerUnit.nome ?? "-"} | ${it.percentual}%`,
      );
    }
  }

  // Query igual ao billing/plants/[id]/route.ts pra Outubro 2025
  console.log("\n=== QUERY DO BILLING DETAIL DE 2025-10 ===");
  const ano = 2025;
  const mes = 10;
  const payables = await prisma.investorPayable.findMany({
    where: {
      plantId,
      OR: [
        {
          carriedFromPayableId: null,
          originatedByPlantBill: { anoReferencia: ano, mesReferencia: mes },
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
      kwhCompensadoBase: true,
      kwhCompensadoAjuste: true,
      valorBruto: true,
      valorLiquido: true,
      anoReferencia: true,
      mesReferencia: true,
      carriedFromPayableId: true,
      consumerUnit: { select: { codigoUc: true, nome: true } },
      originatedByPlantBill: {
        select: { anoReferencia: true, mesReferencia: true },
      },
      carriedFromPayable: {
        select: {
          anoReferencia: true,
          mesReferencia: true,
          originatedByPlantBill: {
            select: { anoReferencia: true, mesReferencia: true },
          },
        },
      },
    },
    orderBy: { consumerUnit: { codigoUc: "asc" } },
  });
  console.log(`Encontrei ${payables.length} payable(s) pra display em Out/2025:\n`);
  for (const p of payables) {
    const origem = p.carriedFromPayableId
      ? p.carriedFromPayable?.originatedByPlantBill ?? p.carriedFromPayable
      : p.originatedByPlantBill;
    const origemAno = origem?.anoReferencia ?? p.anoReferencia;
    const origemMes = origem?.mesReferencia ?? p.mesReferencia;
    console.log(
      `${p.consumerUnit?.nome ?? "-"} (${p.consumerUnit?.codigoUc ?? "-"}) | display=${p.anoReferencia}-${String(p.mesReferencia).padStart(2, "0")} | origem=${origemAno}-${String(origemMes).padStart(2, "0")} | kwh=${(p.kwhCompensadoBase ?? 0) + (p.kwhCompensadoAjuste ?? 0)} | valorLiq=${p.valorLiquido} | status=${p.status} | saldo?=${p.carriedFromPayableId ? "SIM" : "nao"}`,
    );
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());

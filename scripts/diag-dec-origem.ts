import { prisma } from "../src/lib/prisma";

async function main() {
  const plantId = "c92bd286-6c47-4609-9edb-9443bc30cb77";
  const investorId = "cmoekxsvq0004q2rvmjbffrww";

  console.log("=== Payables com display=Dec OU origem real=Dec ===");
  const payables = await prisma.investorPayable.findMany({
    where: {
      plantId,
      investorId,
      OR: [
        { anoReferencia: 2025, mesReferencia: 12 },
        { originatedByPlantBill: { anoReferencia: 2025, mesReferencia: 12 } },
        {
          carriedFromPayable: {
            originatedByPlantBill: {
              anoReferencia: 2025,
              mesReferencia: 12,
            },
          },
        },
      ],
    },
    select: {
      id: true,
      status: true,
      anoReferencia: true,
      mesReferencia: true,
      kwhCompensadoBase: true,
      valorBruto: true,
      valorAjuste: true,
      valorAbatidoDebito: true,
      valorLiquido: true,
      carriedFromPayableId: true,
      consumerUnit: { select: { codigoUc: true } },
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
    orderBy: [{ anoReferencia: "asc" }, { mesReferencia: "asc" }],
  });

  for (const p of payables) {
    const origemReal = p.carriedFromPayableId
      ? p.carriedFromPayable?.originatedByPlantBill ??
        { anoReferencia: p.carriedFromPayable?.anoReferencia, mesReferencia: p.carriedFromPayable?.mesReferencia }
      : p.originatedByPlantBill ?? { anoReferencia: p.anoReferencia, mesReferencia: p.mesReferencia };
    console.log(
      `${p.consumerUnit?.codigoUc} | display=${p.anoReferencia}-${String(p.mesReferencia).padStart(2, "0")} | origemReal=${origemReal.anoReferencia}-${String(origemReal.mesReferencia ?? 0).padStart(2, "0")} | tipo=${p.carriedFromPayableId ? "saldo" : "natural"} | bruto=${p.valorBruto} ajuste=${p.valorAjuste} abate=${p.valorAbatidoDebito} liquido=${p.valorLiquido} | ${p.status}`,
    );
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());

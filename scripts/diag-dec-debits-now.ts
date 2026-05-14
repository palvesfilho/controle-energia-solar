import { prisma } from "../src/lib/prisma";

async function main() {
  const investorId = "cmoekxsvq0004q2rvmjbffrww";
  const debitos = await prisma.investorDebit.findMany({
    where: {
      investorId,
      OR: [
        { motivo: { startsWith: "Saldo negativo do relatorio Dezembro" } },
        { motivo: { startsWith: "Saldo negativo do relatorio Janeiro" } },
      ],
    },
    include: {
      applications: {
        select: {
          payableId: true,
          valorAbatido: true,
          payable: {
            select: {
              consumerUnit: { select: { codigoUc: true } },
              anoReferencia: true,
              mesReferencia: true,
            },
          },
        },
      },
    },
    orderBy: { criadoEm: "asc" },
  });
  for (const d of debitos) {
    console.log(
      `${d.id} | ${d.motivo?.slice(0, 100)}\n  original=${d.valorOriginal} restante=${d.valorRestante} status=${d.status}`,
    );
    for (const a of d.applications) {
      console.log(
        `    -> ${a.payable.consumerUnit?.codigoUc} ${a.payable.anoReferencia}-${String(a.payable.mesReferencia).padStart(2, "0")} | abatido ${a.valorAbatido}`,
      );
    }
  }

  // Verifica se o payable de Fábrica natural de Dec ainda tem abate
  console.log("\n=== Estado das payables de Dec/2025 ===");
  const ps = await prisma.investorPayable.findMany({
    where: {
      plantId: "c92bd286-6c47-4609-9edb-9443bc30cb77",
      anoReferencia: 2025,
      mesReferencia: 12,
    },
    select: {
      consumerUnit: { select: { codigoUc: true } },
      carriedFromPayableId: true,
      valorBruto: true,
      valorAjuste: true,
      valorAbatidoDebito: true,
      valorLiquido: true,
      status: true,
      originatedByPlantBill: { select: { anoReferencia: true, mesReferencia: true } },
    },
    orderBy: [{ carriedFromPayableId: "asc" }, { id: "asc" }],
  });
  for (const p of ps) {
    console.log(
      `${p.consumerUnit?.codigoUc} ${p.carriedFromPayableId ? "saldo" : "natural"} origem=${p.originatedByPlantBill?.anoReferencia ?? "?"}-${String(p.originatedByPlantBill?.mesReferencia ?? 0).padStart(2, "0")} | bruto=${p.valorBruto} ajuste=${p.valorAjuste} abate=${p.valorAbatidoDebito} liquido=${p.valorLiquido} | ${p.status}`,
    );
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());

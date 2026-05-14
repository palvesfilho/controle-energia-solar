/**
 * Mostra o estado atual dos InvestorDebits do Sidinei + amortizacoes
 * em payables de Nov/Dec.
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  const investorId = "cmoekxsvq0004q2rvmjbffrww";
  const plantId = "c92bd286-6c47-4609-9edb-9443bc30cb77";

  console.log("=== TODOS OS DEBITS DO INVESTIDOR ===");
  const debitos = await prisma.investorDebit.findMany({
    where: { investorId },
    include: {
      applications: {
        select: {
          payableId: true,
          valorAbatido: true,
          payable: {
            select: {
              anoReferencia: true,
              mesReferencia: true,
              consumerUnit: { select: { codigoUc: true } },
              originatedByPlantBill: {
                select: { anoReferencia: true, mesReferencia: true },
              },
            },
          },
        },
      },
    },
    orderBy: { criadoEm: "asc" },
  });
  for (const d of debitos) {
    console.log(
      `\n${d.id}\n  motivo: ${d.motivo?.slice(0, 80)}\n  original=${d.valorOriginal} restante=${d.valorRestante} status=${d.status} | criado=${d.criadoEm.toISOString().slice(0, 10)}`,
    );
    for (const a of d.applications) {
      const origem = a.payable.originatedByPlantBill;
      console.log(
        `    -> UC=${a.payable.consumerUnit?.codigoUc} display=${a.payable.anoReferencia}-${String(a.payable.mesReferencia).padStart(2, "0")} origem=${origem ? `${origem.anoReferencia}-${String(origem.mesReferencia).padStart(2, "0")}` : "?"} abatido=${a.valorAbatido}`,
      );
    }
  }

  console.log("\n=== PAYABLES DE NOV/DEC com amortizacao ===");
  const payables = await prisma.investorPayable.findMany({
    where: {
      plantId,
      investorId,
      OR: [
        { originatedByPlantBill: { anoReferencia: 2025, mesReferencia: 11 } },
        { originatedByPlantBill: { anoReferencia: 2025, mesReferencia: 12 } },
      ],
    },
    select: {
      id: true,
      anoReferencia: true,
      mesReferencia: true,
      kwhCompensadoBase: true,
      valorBruto: true,
      valorAjuste: true,
      valorAbatidoDebito: true,
      valorLiquido: true,
      status: true,
      carriedFromPayableId: true,
      consumerUnit: { select: { codigoUc: true } },
      originatedByPlantBill: {
        select: { anoReferencia: true, mesReferencia: true },
      },
    },
    orderBy: [{ anoReferencia: "asc" }, { mesReferencia: "asc" }],
  });
  for (const p of payables) {
    const origem = p.originatedByPlantBill;
    console.log(
      `${p.consumerUnit?.codigoUc} | display=${p.anoReferencia}-${String(p.mesReferencia).padStart(2, "0")} origem=${origem ? `${origem.anoReferencia}-${String(origem.mesReferencia).padStart(2, "0")}` : "?"} | bruto=${p.valorBruto} ajuste=${p.valorAjuste} abate=${p.valorAbatidoDebito} liquido=${p.valorLiquido} | ${p.status} | ${p.carriedFromPayableId ? "saldo" : "natural"}`,
    );
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());

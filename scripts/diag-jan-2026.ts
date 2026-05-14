import { prisma } from "../src/lib/prisma";
import { janelaFaturasUsinaDescontadas } from "../src/lib/janela-faturas-usina";

async function main() {
  const plantId = "c92bd286-6c47-4609-9edb-9443bc30cb77";

  console.log("=== ConsumerBills (UC geradora) Dez/25-Mar/26 ===");
  const bills = await prisma.consumerBill.findMany({
    where: {
      plantId,
      consumerUnitId: null,
      OR: [
        { anoReferencia: 2025, mesReferencia: { gte: 12 } },
        { anoReferencia: 2026 },
      ],
    },
    select: {
      anoReferencia: true,
      mesReferencia: true,
      valorTotal: true,
      energiaInjetadaMedidorKwh: true,
    },
    orderBy: [{ anoReferencia: "asc" }, { mesReferencia: "asc" }],
  });
  for (const b of bills) {
    console.log(
      `${b.anoReferencia}-${String(b.mesReferencia).padStart(2, "0")} | injetado=${b.energiaInjetadaMedidorKwh ?? 0} | conta=${b.valorTotal ?? "?"}`,
    );
  }

  console.log("\n=== MonthlyReports PUBLISHED ===");
  const reports = await prisma.monthlyReport.findMany({
    where: { plantId, status: "PUBLISHED" },
    select: { ano: true, mes: true, creditosUtilizados: true, valorBrutoGerador: true },
    orderBy: [{ ano: "asc" }, { mes: "asc" }],
  });
  for (const r of reports) {
    console.log(
      `${r.ano}-${String(r.mes).padStart(2, "0")} | comp=${r.creditosUtilizados} bruto=${r.valorBrutoGerador}`,
    );
  }

  console.log("\n=== Payables com display=Jan/2026 OU origem=Jan/2026 ===");
  const payablesJan = await prisma.investorPayable.findMany({
    where: {
      plantId,
      OR: [
        { anoReferencia: 2026, mesReferencia: 1 },
        { originatedByPlantBill: { anoReferencia: 2026, mesReferencia: 1 } },
        {
          carriedFromPayable: {
            originatedByPlantBill: { anoReferencia: 2026, mesReferencia: 1 },
          },
        },
      ],
    },
    select: {
      consumerUnit: { select: { codigoUc: true } },
      anoReferencia: true,
      mesReferencia: true,
      kwhCompensadoBase: true,
      valorBruto: true,
      valorAbatidoDebito: true,
      valorLiquido: true,
      status: true,
      carriedFromPayableId: true,
      originatedByPlantBill: { select: { anoReferencia: true, mesReferencia: true } },
      carriedFromPayable: {
        select: {
          originatedByPlantBill: { select: { anoReferencia: true, mesReferencia: true } },
        },
      },
    },
  });
  for (const p of payablesJan) {
    const origem = p.carriedFromPayableId
      ? p.carriedFromPayable?.originatedByPlantBill
      : p.originatedByPlantBill;
    console.log(
      `${p.consumerUnit?.codigoUc} | display=${p.anoReferencia}-${String(p.mesReferencia).padStart(2, "0")} origem=${origem?.anoReferencia}-${String(origem?.mesReferencia ?? 0).padStart(2, "0")} | kwh=${p.kwhCompensadoBase} bruto=${p.valorBruto} abate=${p.valorAbatidoDebito} liquido=${p.valorLiquido} | ${p.status} | ${p.carriedFromPayableId ? "saldo" : "natural"}`,
    );
  }

  console.log("\n=== janelaFaturasUsinaDescontadas pra Jan/2026 ===");
  const plant = await prisma.plant.findUnique({
    where: { id: plantId },
    select: { dataAssinaturaContrato: true },
  });
  const janela = await janelaFaturasUsinaDescontadas({
    plantId,
    ano: 2026,
    mes: 1,
    dataAssinaturaContrato: plant?.dataAssinaturaContrato ?? null,
  });
  for (const f of janela) {
    console.log(
      `  ${f.anoReferencia}-${String(f.mesReferencia).padStart(2, "0")} | conta=${f.valorTotal}`,
    );
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());

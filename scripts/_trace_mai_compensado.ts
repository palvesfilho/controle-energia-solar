import { prisma } from "../src/lib/prisma";

async function main() {
  const ps = await prisma.investorPayable.findMany({
    where: {
      plantId: "4018f3bd-50bd-4ff9-87d4-d50b680e437b",
      originatedByPlantBill: { anoReferencia: 2025, mesReferencia: 5 },
    },
    select: {
      status: true,
      kwhCompensadoBase: true,
      kwhCompensadoAjuste: true,
      kwhCreditoLegadoAbatido: true,
      valorBruto: true,
      valorLiquido: true,
      consumerUnit: { select: { codigoUc: true } },
    },
    orderBy: { consumerUnit: { codigoUc: "asc" } },
  });

  console.log("Payables com origem mai/2025:");
  let bruto = 0, legado = 0, remun = 0;
  let realBruto = 0, realLegado = 0, realRemun = 0;
  for (const p of ps) {
    const b = (p.kwhCompensadoBase ?? 0) + (p.kwhCompensadoAjuste ?? 0);
    const l = p.kwhCreditoLegadoAbatido ?? 0;
    const r = b - l;
    const realizado = p.status === "DISPONIVEL" || p.status === "PAGO";
    console.log(
      `  ${p.consumerUnit?.codigoUc}  status=${p.status.padEnd(22)}  ` +
      `bruto=${b.toFixed(2).padStart(8)}  legado=${l.toFixed(2).padStart(8)}  ` +
      `remun=${r.toFixed(2).padStart(8)}  R$ bruto=${p.valorBruto.toFixed(2)}  ${realizado ? "✓ realizado" : ""}`,
    );
    bruto += b; legado += l; remun += r;
    if (realizado) { realBruto += b; realLegado += l; realRemun += r; }
  }
  console.log(`\nTotais (todos):       bruto=${bruto.toFixed(2)}  legado=${legado.toFixed(2)}  remun=${remun.toFixed(2)}`);
  console.log(`Totais (realizados):  bruto=${realBruto.toFixed(2)}  legado=${realLegado.toFixed(2)}  remun=${realRemun.toFixed(2)}`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

import { calcularSaldoCredito } from "../src/lib/investor-credit-balance";
import { prisma } from "../src/lib/prisma";

const PLANT_ID = "4018f3bd-50bd-4ff9-87d4-d50b680e437b";

async function main() {
  const inv = await prisma.plant.findUnique({
    where: { id: PLANT_ID },
    select: { investors: { select: { investor: { select: { id: true } } } } },
  });
  const investorId = inv!.investors[0]!.investor.id;

  for (const [ano, mes] of [
    [2025, 4],
    [2025, 5],
    [2025, 6],
    [2025, 7],
  ] as const) {
    const r = await calcularSaldoCredito({ plantId: PLANT_ID, investorId, ano, mes });
    console.log(
      `competência ${ano}-${String(mes).padStart(2, "0")}: ` +
      `saldoAnt=${r.saldoAnterior.toFixed(2)} ` +
      `inj=${r.injetadoMes.toFixed(2)} ` +
      `compBruto=${r.compensadoBrutoMes.toFixed(2)} ` +
      `compEfetivo=${r.compensadoEfetivoMes.toFixed(2)} ` +
      `legado=${r.creditoLegadoMes.toFixed(2)} ` +
      `saldoFim=${r.saldoFinal.toFixed(2)}`,
    );
  }

  console.log("\nHistórico mês a mês até jul/2025:");
  const r = await calcularSaldoCredito({ plantId: PLANT_ID, investorId, ano: 2025, mes: 7 });
  for (const h of r.historico) {
    console.log(
      `  ${h.ano}-${String(h.mes).padStart(2, "0")}  ` +
      `inj=${h.injetado.toFixed(2).padStart(8)}  ` +
      `compBruto=${h.compensadoBruto.toFixed(2).padStart(8)}  ` +
      `compEfet=${h.compensadoEfetivo.toFixed(2).padStart(8)}  ` +
      `legado=${h.creditoLegado.toFixed(2).padStart(8)}  ` +
      `fim=${h.saldoFim.toFixed(2).padStart(8)}`,
    );
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

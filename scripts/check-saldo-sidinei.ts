import { calcularSaldoCredito } from "../src/lib/investor-credit-balance";
import { prisma } from "../src/lib/prisma";

const PLANT_ID = "c92bd286-6c47-4609-9edb-9443bc30cb77";

async function main() {
  const ip = await prisma.investorPlant.findFirst({
    where: { plantId: PLANT_ID },
    select: { investorId: true },
  });
  if (!ip) {
    console.log("Sem investidor vinculado");
    return;
  }
  for (const { ano, mes } of [
    { ano: 2025, mes: 5 },
    { ano: 2025, mes: 6 },
    { ano: 2025, mes: 7 },
    { ano: 2025, mes: 8 },
    { ano: 2025, mes: 9 },
    { ano: 2025, mes: 10 },
    { ano: 2025, mes: 11 },
  ]) {
    const r = await calcularSaldoCredito({
      plantId: PLANT_ID,
      investorId: ip.investorId,
      ano,
      mes,
    });
    console.log(
      `${ano}-${String(mes).padStart(2, "0")}  | ant=${String(r.saldoAnterior).padStart(6)} | inj=${String(r.injetadoMes).padStart(6)} | compBruto=${String(r.compensadoBrutoMes).padStart(5)} | compEf=${String(r.compensadoEfetivoMes).padStart(5)} | legado=${String(r.creditoLegadoMes).padStart(5)} | final=${String(r.saldoFinal).padStart(6)}`,
    );
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

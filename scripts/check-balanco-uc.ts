import { prisma } from "../src/lib/prisma";

async function main() {
  const ucs = ["3090579398", "3095589850", "4003698872", "3090783930"];
  for (const codigo of ucs) {
    const uc = await prisma.consumerUnit.findUnique({ where: { codigoUc: codigo } });
    if (!uc) continue;
    const bill = await prisma.consumerBill.findFirst({
      where: { consumerUnitId: uc.id, anoReferencia: 2026, mesReferencia: 4 },
    });
    const billing = await prisma.consumerUnitBilling.findFirst({
      where: { consumerUnitId: uc.id, ano: 2026, mes: 4 },
    });
    console.log(`UC ${codigo} (${uc.nome})`);
    console.log(`  consumo: ${bill?.consumoKwh} kWh`);
    console.log(`  compensada: ${bill?.energiaCompensada} kWh`);
    console.log(`  saldo: ${bill?.saldoCreditos}`);
    console.log(`  valorCobranca: ${billing?.valorCobranca}`);
    console.log(`  valorEconomia: ${billing?.valorEconomia}`);
    console.log("");
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

/**
 * Detalhe das payables com cap aplicado pra uma plant específica.
 * Uso: npx tsx scripts/diag-injection-cap-detalhe.ts <numeroUsina>
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  const numero = process.argv[2] ?? "4003503006";
  const plant = await prisma.plant.findFirst({
    where: { numeroUsina: numero, active: true },
    select: { id: true, name: true, regraInstalacao: true },
  });
  if (!plant) {
    console.error(`Plant ${numero} não encontrada`);
    process.exit(1);
  }

  console.log(`Plant: ${plant.name} (${numero}) — ${plant.regraInstalacao}\n`);

  const payables = await prisma.investorPayable.findMany({
    where: { plantId: plant.id, kwhCreditoLegadoAbatido: { gt: 0 } },
    select: {
      id: true,
      anoReferencia: true,
      mesReferencia: true,
      status: true,
      kwhCompensadoBase: true,
      kwhCreditoLegadoAbatido: true,
      valorBruto: true,
      valorLiquido: true,
      consumerUnit: { select: { codigoUc: true, nome: true } },
      investor: { select: { user: { select: { name: true, email: true } } } },
    },
    orderBy: [{ anoReferencia: "asc" }, { mesReferencia: "asc" }],
  });

  console.log(`Payables com cap aplicado: ${payables.length}\n`);
  for (const p of payables) {
    const bruto = p.kwhCompensadoBase + p.kwhCreditoLegadoAbatido;
    console.log(
      `  ${p.anoReferencia}-${String(p.mesReferencia).padStart(2, "0")} | ` +
        `UC ${p.consumerUnit.codigoUc ?? "—"} (${p.consumerUnit.nome ?? "—"}) | ` +
        `status=${p.status} | ` +
        `bruto=${bruto.toFixed(0)} kWh → pago=${p.kwhCompensadoBase.toFixed(0)} kWh | ` +
        `abatido=${p.kwhCreditoLegadoAbatido.toFixed(0)} kWh | ` +
        `valor R$=${p.valorLiquido.toFixed(2)}`,
    );
  }

  // Histórico de injeção da usina (UC geradora)
  const ucGeradora = await prisma.consumerUnit.findFirst({
    where: { plantId: plant.id, codigoUc: numero },
    select: { id: true },
  });
  if (ucGeradora) {
    const billsUsina = await prisma.consumerBill.findMany({
      where: { consumerUnitId: ucGeradora.id },
      select: {
        anoReferencia: true,
        mesReferencia: true,
        energiaInjetadaMedidorKwh: true,
        consumoInstantaneoKwh: true,
        geracaoInversorKwh: true,
      },
      orderBy: [{ anoReferencia: "asc" }, { mesReferencia: "asc" }],
    });
    console.log(`\nBills da UC geradora (${billsUsina.length}):`);
    for (const b of billsUsina) {
      const med = b.energiaInjetadaMedidorKwh ?? 0;
      const inst = b.consumoInstantaneoKwh ?? 0;
      const inv = b.geracaoInversorKwh ?? 0;
      console.log(
        `  ${b.anoReferencia}-${String(b.mesReferencia).padStart(2, "0")} | ` +
          `injMed=${med.toFixed(0)} | consInst=${inst.toFixed(0)} | invKwh=${inv.toFixed(0)} | ` +
          `entrega(med+inst)=${(med + inst).toFixed(0)} kWh`,
      );
    }
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

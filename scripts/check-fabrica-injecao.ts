import { prisma } from "../src/lib/prisma";

async function main() {
  const uc = await prisma.consumerUnit.findFirst({
    where: { codigoUc: "4003698872" },
    select: { id: true, nome: true, codigoUc: true },
  });
  if (!uc) {
    console.log("UC não encontrada");
    return;
  }
  console.log(`UC: ${uc.codigoUc} | ${uc.nome}\n`);

  const bills = await prisma.consumerBill.findMany({
    where: { consumerUnitId: uc.id },
    orderBy: [{ anoReferencia: "asc" }, { mesReferencia: "asc" }],
    select: {
      anoReferencia: true,
      mesReferencia: true,
      energiaCompensada: true,
      energiaInjetadaMedidorKwh: true,
      consumoKwh: true,
      saldoCreditos: true,
      valorTotal: true,
    },
  });

  console.log("Mês     | Consumo | Compensada | Injetada própria | kWh do rateio | Saldo créditos | Valor");
  console.log("--------|---------|------------|------------------|---------------|----------------|---------");
  for (const b of bills) {
    const consumo = b.consumoKwh ?? 0;
    const comp = b.energiaCompensada ?? 0;
    const inj = b.energiaInjetadaMedidorKwh ?? 0;
    const rateio = Math.max(0, comp - inj);
    const saldo = b.saldoCreditos ?? 0;
    console.log(
      `${b.anoReferencia}-${String(b.mesReferencia).padStart(2,"0")} | ${String(consumo).padStart(7)} | ${String(comp).padStart(10)} | ${String(inj).padStart(16)} | ${String(rateio).padStart(13)} | ${String(saldo).padStart(14)} | R$${b.valorTotal?.toFixed(2) ?? "—"}`,
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });

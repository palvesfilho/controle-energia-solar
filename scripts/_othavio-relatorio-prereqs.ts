import { prisma } from "../src/lib/prisma";

const PROP_ID = "cmomq01bf1bsestgh127sgakj";

async function main() {
  const prop = await prisma.brasilSolarProprietario.findUnique({
    where: { id: PROP_ID },
    select: { id: true, nome: true, codigoUc: true, cpfCnpj: true, concessionaria: true, potenciaInstalada: true },
  });
  if (!prop) { console.log("Proprietário NÃO encontrado"); process.exit(1); }
  console.log(`=== Proprietário: ${prop.nome} ===`);
  console.log(`CPF: ${prop.cpfCnpj}`);
  console.log(`UC própria: ${prop.codigoUc} (${prop.concessionaria})`);
  console.log(`Potência: ${prop.potenciaInstalada}\n`);

  // ConsumerUnit cadastrada com codigoUc igual?
  const ucs = await prisma.consumerUnit.findMany({
    where: { codigoUc: prop.codigoUc ?? "" },
    select: {
      id: true,
      codigoUc: true,
      cpfCnpj: true,
      distribuidora: true,
      plantId: true,
      _count: { select: { bills: true, billings: true } },
    },
  });
  console.log(`=== ConsumerUnit com codigoUc=${prop.codigoUc} ===`);
  if (ucs.length === 0) {
    console.log(`  ❌ NENHUMA UC cadastrada — relatório não roda sem isso.`);
  } else {
    for (const uc of ucs) {
      console.log(`  ✓ UC ${uc.id} cpf=${uc.cpfCnpj} distrib=${uc.distribuidora} plantId=${uc.plantId ?? "NULL"} bills=${uc._count.bills} billings=${uc._count.billings}`);
    }
  }

  // ConsumerBill: faturas da UC nos últimos 12 meses
  if (ucs.length > 0) {
    const ucId = ucs[0].id;
    console.log(`\n=== ConsumerBills últimos 12 meses (UC ${ucs[0].codigoUc}) ===`);
    const oneYearAgo = new Date(); oneYearAgo.setMonth(oneYearAgo.getMonth() - 13);
    const bills = await prisma.consumerBill.findMany({
      where: { consumerUnitId: ucId, dataLeituraAtual: { gte: oneYearAgo } },
      select: {
        id: true,
        anoReferencia: true,
        mesReferencia: true,
        dataLeituraAnterior: true,
        dataLeituraAtual: true,
        consumoKwh: true,
        energiaInjetada: true,
        valorTotal: true,
      },
      orderBy: [{ anoReferencia: "asc" }, { mesReferencia: "asc" }],
    });
    if (bills.length === 0) console.log("  ❌ NENHUMA fatura — relatório fica vazio.");
    for (const b of bills) {
      const ini = b.dataLeituraAnterior?.toISOString().slice(0, 10) ?? "?";
      const fim = b.dataLeituraAtual?.toISOString().slice(0, 10) ?? "?";
      console.log(`  ${b.anoReferencia}-${String(b.mesReferencia).padStart(2, "0")} [${ini} → ${fim}] consumo=${b.consumoKwh} injeção=${b.energiaInjetada} valor=R$ ${b.valorTotal?.toFixed(2) ?? "-"}`);
    }
  }

  // BSCs vinculados ao proprietário (usinas monitoradas)
  console.log(`\n=== Usinas monitoradas (BSCs do proprietário) ===`);
  const bscs = await prisma.brasilSolarClient.findMany({
    where: { proprietarioId: PROP_ID, active: true },
    select: {
      id: true, nome: true, plataformaMonitoramento: true, monitoramentoPlantId: true, investimento: true,
      _count: { select: { monitoringLogs: true, inverterSamples: true } },
    },
  });
  for (const b of bscs) {
    console.log(`  ${b.id} ${b.nome} platform=${b.plataformaMonitoramento} ps=${b.monitoramentoPlantId} invest=${b.investimento} logs=${b._count.monitoringLogs} samples=${b._count.inverterSamples}`);
  }

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

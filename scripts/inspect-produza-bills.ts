import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const UC_ID = "cmoaxxavp000ii22b61jr60r3";

async function main() {
  const bills = await prisma.consumerBill.findMany({
    where: { consumerUnitId: UC_ID },
    orderBy: [{ anoReferencia: "desc" }, { mesReferencia: "desc" }],
    select: {
      id: true,
      anoReferencia: true,
      mesReferencia: true,
      consumoKwh: true,
      energiaInjetada: true,
      energiaInjetadaMedidorKwh: true,
      energiaCompensada: true,
      saldoCreditos: true,
      tarifaTE: true,
      tarifaTUSD: true,
      valorTotal: true,
      dataLeituraAnterior: true,
      dataLeituraAtual: true,
      pdfUrl: true,
      injetadaOucTeKwh: true,
      injetadaOucTusdKwh: true,
      injetadaDetalhes: true,
    },
  });

  console.log(`Total bills UC PRODUZA (${UC_ID}): ${bills.length}\n`);
  console.log("AnoMes | inj_med | inj_legado | comp | te | tusd | datas leitura | pdf");
  console.log("-".repeat(110));
  for (const b of bills) {
    const inj = b.energiaInjetadaMedidorKwh;
    const injOld = b.energiaInjetada;
    const datas = `${b.dataLeituraAnterior?.toISOString().slice(0, 10) ?? "—"}→${b.dataLeituraAtual?.toISOString().slice(0, 10) ?? "—"}`;
    const has = (v: unknown) => (v == null ? "✗" : "✓");
    console.log(
      `${b.anoReferencia}-${String(b.mesReferencia).padStart(2, "0")} | ` +
      `${inj == null ? "    null" : String(inj).padStart(8)} | ` +
      `${injOld == null ? "    null" : String(injOld).padStart(8)} | ` +
      `${b.energiaCompensada == null ? "  null" : String(b.energiaCompensada).padStart(6)} | ` +
      `${has(b.tarifaTE)} | ${has(b.tarifaTUSD)} | ${datas} | ${has(b.pdfUrl)}`,
    );
  }

  // Inspeção detalhada do mês mais recente que veio sem injetada
  const semInj = bills.find((b) => b.energiaInjetadaMedidorKwh == null);
  if (semInj) {
    console.log(`\n--- DETALHE bill ${semInj.anoReferencia}-${semInj.mesReferencia} (sem injetadaMedidor) ---`);
    console.log(`id: ${semInj.id}`);
    console.log(`energiaInjetada (legado): ${semInj.energiaInjetada}`);
    console.log(`injetadaOucTeKwh: ${semInj.injetadaOucTeKwh}`);
    console.log(`injetadaOucTusdKwh: ${semInj.injetadaOucTusdKwh}`);
    console.log(`injetadaDetalhes: ${semInj.injetadaDetalhes}`);
    console.log(`pdfUrl: ${semInj.pdfUrl}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });

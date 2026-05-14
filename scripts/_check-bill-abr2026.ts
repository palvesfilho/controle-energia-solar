import { prisma } from "../src/lib/prisma";

async function main() {
  const bill = await prisma.consumerBill.findFirst({
    where: {
      consumerUnitId: "cmomq0ih61bshstgh3aj4u4in",
      anoReferencia: 2026,
      mesReferencia: 4,
    },
    select: {
      id: true,
      anoReferencia: true,
      mesReferencia: true,
      dataLeituraAnterior: true,
      dataLeituraAtual: true,
      consumoKwh: true,
      energiaInjetada: true,
      energiaInjetadaMedidorKwh: true,
      energiaCompensada: true,
      saldoCreditos: true,
      injetadaOucTeKwh: true,
      injetadaOucTusdKwh: true,
      leituraInjetadaAnterior: true,
      leituraInjetadaAtual: true,
      constanteMedidorInjetada: true,
      injetadaDetalhes: true,
      fonteConsulta: true,
      pdfUrl: true,
    },
  });

  if (!bill) { console.log("Fatura abril/2026 não encontrada"); return; }

  // Mostrar todos os campos relacionados a injeção
  console.log(JSON.stringify({
    id: bill.id,
    janela: `${bill.dataLeituraAnterior?.toISOString().slice(0,10)} → ${bill.dataLeituraAtual?.toISOString().slice(0,10)}`,
    consumoKwh: bill.consumoKwh,
    energiaInjetada: bill.energiaInjetada,                       // total injetado (campo)
    energiaInjetadaMedidorKwh: bill.energiaInjetadaMedidorKwh,   // <- esse é o que o relatório usa
    energiaCompensada: bill.energiaCompensada,
    saldoCreditos: bill.saldoCreditos,
    injetadaOucTeKwh: bill.injetadaOucTeKwh,                     // injetada por posto TE
    injetadaOucTusdKwh: bill.injetadaOucTusdKwh,                 // injetada por posto TUSD
    leituraInjetadaAnterior: bill.leituraInjetadaAnterior,       // leitura medidor (Anexo F)
    leituraInjetadaAtual: bill.leituraInjetadaAtual,
    constanteMedidorInjetada: bill.constanteMedidorInjetada,
    fonteConsulta: bill.fonteConsulta,
    pdfUrl: bill.pdfUrl,
  }, null, 2));

  // E pra comparar, fatura de fevereiro (que tinha inj=866 no relatório)
  const feb = await prisma.consumerBill.findFirst({
    where: { consumerUnitId: "cmomq0ih61bshstgh3aj4u4in", anoReferencia: 2026, mesReferencia: 2 },
    select: {
      energiaInjetada: true,
      energiaInjetadaMedidorKwh: true,
      injetadaOucTeKwh: true,
      injetadaOucTusdKwh: true,
      leituraInjetadaAnterior: true,
      leituraInjetadaAtual: true,
      constanteMedidorInjetada: true,
    },
  });
  console.log(`\nFevereiro/2026 (pra comparar):`);
  console.log(JSON.stringify(feb, null, 2));

  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

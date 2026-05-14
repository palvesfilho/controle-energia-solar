import { prisma } from "../src/lib/prisma";

async function main() {
  const bills = await prisma.consumerBill.findMany({
    where: {
      consumerUnitId: "cmomq0ih61bshstgh3aj4u4in",
      OR: [
        { anoReferencia: 2026, mesReferencia: 2 },
        { anoReferencia: 2026, mesReferencia: 4 },
      ],
    },
    select: {
      anoReferencia: true,
      mesReferencia: true,
      fonteConsulta: true,
      energiaInjetadaMedidorKwh: true,
      injetadaDetalhes: true,
      rawJson: true,
    },
  });

  for (const b of bills) {
    console.log(`\n========== ${b.anoReferencia}-${String(b.mesReferencia).padStart(2,"0")} (fonte=${b.fonteConsulta}) ==========`);
    console.log(`energiaInjetadaMedidorKwh: ${b.energiaInjetadaMedidorKwh}`);
    console.log(`injetadaDetalhes: ${JSON.stringify(b.injetadaDetalhes)?.substring(0, 300)}`);

    if (b.rawJson) {
      try {
        const raw = JSON.parse(b.rawJson);
        const ocr = raw?.data?.[0] ?? raw?.[0] ?? raw;
        const medidores = ocr?.energia?.medidor ?? raw?.ocr?.energia?.medidor ?? [];
        console.log(`Medidores no rawJson (${medidores.length}):`);
        for (const m of medidores) {
          console.log(`  grandeza="${m.grandeza}" leitura_anterior=${m.leitura_anterior} leitura_atual=${m.leitura_atual} consumo_kwh=${m.consumo_kwh} constante=${m.constante_medidor}`);
        }
      } catch (e) {
        console.log(`Erro parsing rawJson: ${(e as Error).message}`);
        console.log(`rawJson primeiros 500 chars:`, b.rawJson?.substring(0, 500));
      }
    } else {
      console.log("rawJson é NULL");
    }
  }

  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

import { prisma } from "../src/lib/prisma";
import { parseInjetadaDetalhes } from "../src/lib/injetada-detalhes";

const PLANT_ID = "4018f3bd-50bd-4ff9-87d4-d50b680e437b";

async function main() {
  const payables = await prisma.investorPayable.findMany({
    where: {
      plantId: PLANT_ID,
      observacoes: { contains: "PARSER_INCOMPLETO" },
    },
    select: {
      id: true,
      anoReferencia: true,
      mesReferencia: true,
      kwhCompensadoBase: true,
      kwhCreditoLegadoAbatido: true,
      valorBruto: true,
      observacoes: true,
      consumerUnit: { select: { codigoUc: true, nome: true } },
      consumerBill: {
        select: {
          id: true,
          anoReferencia: true,
          mesReferencia: true,
          energiaCompensada: true,
          injetadaDetalhes: true,
          pdfUrl: true,
        },
      },
    },
    orderBy: [{ anoReferencia: "asc" }, { mesReferencia: "asc" }],
  });

  console.log(`Payables BECKER com PARSER_INCOMPLETO: ${payables.length}\n`);
  for (const p of payables) {
    const bill = p.consumerBill!;
    const detalhes = parseInjetadaDetalhes(bill.injetadaDetalhes);
    const sumDetalhes = detalhes.reduce((s, d) => s + d.kwh, 0);
    const diff = (bill.energiaCompensada ?? 0) - sumDetalhes;
    console.log(
      `UC ${p.consumerUnit?.codigoUc} (${p.consumerUnit?.nome?.slice(0, 30)})`,
    );
    console.log(`  Fatura ref: ${bill.anoReferencia}-${String(bill.mesReferencia).padStart(2, "0")}`);
    console.log(`  energiaCompensada na fatura: ${bill.energiaCompensada} kWh`);
    console.log(`  Σ detalhes parseados: ${sumDetalhes.toFixed(2)} kWh`);
    console.log(`  ⚠ Diferença não capturada: ${diff.toFixed(2)} kWh`);
    console.log(`  Detalhes parseados:`);
    for (const d of detalhes) {
      console.log(`    - ${d.ano}-${String(d.mes).padStart(2, "0")}: ${d.kwh.toFixed(2)} kWh`);
    }
    console.log(`  Valor atualmente cobrado: R$ ${p.valorBruto.toFixed(2)} (kwhBase=${p.kwhCompensadoBase}, legado=${p.kwhCreditoLegadoAbatido})`);
    console.log(`  PDF: ${bill.pdfUrl ?? "—"}`);
    console.log("");
  }
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

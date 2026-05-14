import { prisma } from "../src/lib/prisma";

async function main() {
  const ucId = "071860db-fda7-4403-a603-72e951fb2eab"; // Cond Med 1
  const bill = await prisma.consumerBill.findFirst({
    where: { consumerUnitId: ucId, anoReferencia: 2025, mesReferencia: 8 },
    select: { rawJson: true, energiaCompensada: true, injetadaDetalhes: true },
  });
  if (!bill) { console.log("não encontrei"); return; }
  console.log(`energiaCompensada: ${bill.energiaCompensada}`);
  console.log(`injetadaDetalhes parsed: ${bill.injetadaDetalhes}\n`);
  console.log("LINHAS DA FATURA (filtradas por 'inj'/'energ'/'comp'):\n");
  let raw: { lines?: string[] } = {};
  try { raw = JSON.parse(bill.rawJson ?? "{}"); } catch {}
  const lines = raw.lines ?? [];
  for (const l of lines) {
    const lc = l.toLowerCase();
    if (lc.includes("inj") || lc.includes("energ") || lc.includes("compens")) {
      console.log(`  ${l}`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

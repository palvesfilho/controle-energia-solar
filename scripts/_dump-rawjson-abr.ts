import { prisma } from "../src/lib/prisma";
import * as fs from "fs";

async function main() {
  const bill = await prisma.consumerBill.findFirst({
    where: { consumerUnitId: "cmomq0ih61bshstgh3aj4u4in", anoReferencia: 2026, mesReferencia: 4 },
    select: { rawJson: true },
  });
  if (!bill?.rawJson) { console.log("rawJson vazio"); return; }
  fs.writeFileSync("D:/tmp/raw-abr-2026.json", bill.rawJson);

  const raw = JSON.parse(bill.rawJson);
  // Estrutura: ?
  console.log("Top-level keys:", Object.keys(raw));
  if (Array.isArray(raw)) {
    console.log("É array, len=", raw.length);
    console.log("Keys do [0]:", Object.keys(raw[0] ?? {}));
  }
  // Procurar pela palavra "inj" no rawJson de qualquer profundidade
  const dumped = bill.rawJson.toLowerCase();
  const matches = [...dumped.matchAll(/inj[a-z]*[" :]/g)].slice(0, 30);
  console.log(`Ocorrências de "inj...": ${matches.length}`);
  for (const m of matches.slice(0, 10)) {
    const idx = m.index ?? 0;
    const context = bill.rawJson.substring(Math.max(0, idx - 60), Math.min(bill.rawJson.length, idx + 100));
    console.log(`  ...${context}...`);
  }
  console.log("\nrawJson salvo em D:/tmp/raw-abr-2026.json");

  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

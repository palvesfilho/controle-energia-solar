/**
 * Debug do parser de fatura PDF: imprime linhas extraídas pelo pdfjs
 * e o resultado do parseFaturaPdf.
 *
 * Uso:
 *   npx tsx scripts/debug-fatura-pdf.ts <caminho-do-pdf>
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { parseFaturaPdf } from "../src/lib/fatura-pdf-parser";

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("Uso: npx tsx scripts/debug-fatura-pdf.ts <caminho-do-pdf>");
    process.exit(1);
  }

  const buffer = await readFile(path);
  const parsed = await parseFaturaPdf(new Uint8Array(buffer));

  console.log("═══ LINHAS EXTRAÍDAS ═══");
  const lines = parsed.rawText.split("\n");
  lines.forEach((l, i) => console.log(`${String(i).padStart(3, "0")}: ${l}`));

  console.log("\n═══ PARSED ═══");
  console.log("codigoInstalacao:", parsed.codigoInstalacao);
  console.log("mesReferencia:", parsed.bill.mesReferencia);
  console.log("anoReferencia:", parsed.bill.anoReferencia);
  console.log("valorTotal:", parsed.bill.valorTotal);
  console.log("vencimento:", parsed.bill.vencimento);
  console.log("consumoKwh:", parsed.bill.consumoKwh);
  console.log("consumoTe:", parsed.bill.consumoTeKwh, "→", parsed.bill.consumoTeValor);
  console.log("consumoTusd:", parsed.bill.consumoTusdKwh, "→", parsed.bill.consumoTusdValor);

  console.log("\n═══ DADOS DE USINA ═══");
  console.log("energiaInjetadaMedidorKwh:", parsed.bill.energiaInjetadaMedidorKwh);
  console.log("leituraInjetadaAnterior:", parsed.bill.leituraInjetadaAnterior);
  console.log("leituraInjetadaAtual:", parsed.bill.leituraInjetadaAtual);
  console.log("constanteMedidorInjetada:", parsed.bill.constanteMedidorInjetada);
  console.log("custoDispTusd:", parsed.bill.custoDispTusdKwh, "kWh →", parsed.bill.custoDispTusdValor);
  console.log("custoDispTe:", parsed.bill.custoDispTeKwh, "kWh →", parsed.bill.custoDispTeValor);
  console.log("saldoInstalacaoKwh:", parsed.bill.saldoInstalacaoKwh);
  console.log("bandeiraTarifaria:", parsed.bill.bandeiraTarifaria, "→", parsed.bill.bandeiraValor);

  console.log("\n═══ HISTÓRICO ═══");
  if (parsed.bill.historicoConsumo) {
    const hist = JSON.parse(parsed.bill.historicoConsumo);
    hist.forEach((h: any) => console.log(`  ${h.mesAno}: ${h.consumoKwh} kWh (${h.dias} dias)`));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

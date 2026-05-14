import { promises as fs } from "node:fs";
import { parseFaturaPdf } from "../src/lib/fatura-pdf-parser";

async function main() {
  const filePath = process.argv[2];
  const buf = await fs.readFile(filePath);
  const parsed = await parseFaturaPdf(new Uint8Array(buf));
  console.log("codigoInstalacao:", parsed.codigoInstalacao);
  console.log("bill:");
  console.log(JSON.stringify({
    mesReferencia: parsed.bill.mesReferencia,
    anoReferencia: parsed.bill.anoReferencia,
    consumoKwh: parsed.bill.consumoKwh,
    energiaInjetada: parsed.bill.energiaInjetada,
    energiaInjetadaMedidorKwh: parsed.bill.energiaInjetadaMedidorKwh,
    leituraInjetadaAnterior: parsed.bill.leituraInjetadaAnterior,
    leituraInjetadaAtual: parsed.bill.leituraInjetadaAtual,
    constanteMedidorInjetada: parsed.bill.constanteMedidorInjetada,
    energiaCompensada: parsed.bill.energiaCompensada,
    valorTotal: parsed.bill.valorTotal,
    tarifaTE: parsed.bill.tarifaTE,
    tarifaTUSD: parsed.bill.tarifaTUSD,
    dataLeituraAnterior: parsed.bill.dataLeituraAnterior,
    dataLeituraAtual: parsed.bill.dataLeituraAtual,
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

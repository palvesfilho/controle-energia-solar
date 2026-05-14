/**
 * Reproduz o bug ANTIGO e valida o fix NOVO.
 *
 * Usa o PDF do Othavio abr/2026 (que está OK em disco) como input.
 * Para cada cenário, salva o resultado em /tmp e mede o tamanho.
 */
import "dotenv/config";
import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import { parseFaturaPdf } from "../src/lib/fatura-pdf-parser";

async function main() {
  const inputPath = resolve(process.cwd(), "uploads/bills/cmomq0ih61bshstgh3aj4u4in/2026-04.pdf");
  const inputBuf = await fs.readFile(inputPath);
  const inputSize = inputBuf.length;
  console.log(`Input: ${inputPath}`);
  console.log(`Tamanho original: ${inputSize} bytes (${(inputSize/1024).toFixed(1)} KB)\n`);

  // Cria ArrayBuffer fresco (simula File.arrayBuffer())
  const makeFreshArrayBuffer = () => {
    const ab = new ArrayBuffer(inputBuf.length);
    new Uint8Array(ab).set(inputBuf);
    return ab;
  };

  await fs.mkdir("D:/tmp", { recursive: true });

  // ========== Cenário ANTIGO (bug) ==========
  console.log("=== Cenário ANTIGO (com bug) ===");
  {
    const arrayBuffer = makeFreshArrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);
    console.log(`Antes do parseFaturaPdf: buffer.byteLength = ${buffer.byteLength}`);
    const parsed = await parseFaturaPdf(buffer);
    console.log(`Depois do parseFaturaPdf: buffer.byteLength = ${buffer.byteLength} (DRENADO!)`);
    const pdfBuffer = Buffer.from(buffer); // ← bug: buffer já está vazio
    await fs.writeFile("D:/tmp/test-bug-antigo.pdf", pdfBuffer);
    const stat = await fs.stat("D:/tmp/test-bug-antigo.pdf");
    console.log(`Salvo D:/tmp/test-bug-antigo.pdf → ${stat.size} bytes`);
    console.log(`Parser leu: ano=${parsed.bill.anoReferencia} mes=${parsed.bill.mesReferencia} consumo=${parsed.bill.consumoKwh}\n`);
  }

  // ========== Cenário NOVO (fix) ==========
  console.log("=== Cenário NOVO (corrigido) ===");
  {
    const arrayBuffer = makeFreshArrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);
    const bufferForStorage = Buffer.from(arrayBuffer.slice(0)); // ← clone antes
    console.log(`Antes do parseFaturaPdf: buffer.byteLength = ${buffer.byteLength}, storage.length = ${bufferForStorage.length}`);
    const parsed = await parseFaturaPdf(buffer);
    console.log(`Depois do parseFaturaPdf: buffer.byteLength = ${buffer.byteLength} (drenado), storage.length = ${bufferForStorage.length} (intacto!)`);
    await fs.writeFile("D:/tmp/test-fix-novo.pdf", bufferForStorage);
    const stat = await fs.stat("D:/tmp/test-fix-novo.pdf");
    console.log(`Salvo D:/tmp/test-fix-novo.pdf → ${stat.size} bytes`);
    console.log(`Parser leu: ano=${parsed.bill.anoReferencia} mes=${parsed.bill.mesReferencia} consumo=${parsed.bill.consumoKwh}`);

    // Re-parse o arquivo salvo pra confirmar que continua válido
    console.log(`\nValidação: re-parsear o arquivo salvo...`);
    const reSavedBuf = await fs.readFile("D:/tmp/test-fix-novo.pdf");
    const reParsed = await parseFaturaPdf(new Uint8Array(reSavedBuf));
    console.log(`Re-parse OK: ano=${reParsed.bill.anoReferencia} mes=${reParsed.bill.mesReferencia} consumo=${reParsed.bill.consumoKwh}`);
  }

  console.log("\n=== Resultado ===");
  const bugStat = await fs.stat("D:/tmp/test-bug-antigo.pdf");
  const fixStat = await fs.stat("D:/tmp/test-fix-novo.pdf");
  console.log(`Antigo: ${bugStat.size} bytes ${bugStat.size === 0 ? "❌ BUG REPRODUZIDO" : ""}`);
  console.log(`Novo:   ${fixStat.size} bytes ${fixStat.size === inputSize ? "✅ FIX FUNCIONANDO" : "❌ INESPERADO"}`);
}
main().catch((e) => { console.error(e); process.exit(1); });

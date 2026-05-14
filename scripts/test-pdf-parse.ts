/**
 * Teste rapido: extrair texto de um PDF com pdfjs-dist em Node.
 * Uso: npx tsx scripts/test-pdf-parse.ts <caminho-do-pdf>
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Uso: npx tsx scripts/test-pdf-parse.ts <caminho-do-pdf>");
    process.exit(1);
  }

  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(readFileSync(resolve(file)));

  const doc = await pdfjsLib.getDocument({
    data,
    useSystemFonts: true,
    disableFontFace: true,
  }).promise;

  console.log("Paginas:", doc.numPages);

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const rows = new Map<number, Array<{ x: number; str: string }>>();
    for (const item of content.items as Array<{ str: string; transform: number[] }>) {
      if (!item.str) continue;
      const y = Math.round(item.transform[5]);
      const x = item.transform[4];
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y)!.push({ x, str: item.str });
    }
    const sorted = Array.from(rows.entries()).sort((a, b) => b[0] - a[0]);
    console.log(`\n--- Pagina ${p} ---`);
    for (const [y, items] of sorted) {
      items.sort((a, b) => a.x - b.x);
      const line = items.map((i) => i.str).join("  ").trim();
      if (line) console.log(`[y=${y}]`, line);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

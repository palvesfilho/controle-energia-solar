import { promises as fs } from "node:fs";
import { join, pathToFileURL } from "node:path";
// pathToFileURL is in node:url, but join is from node:path; correcting below

async function main() {
  const filePath = process.argv[2];
  const buf = await fs.readFile(filePath);

  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    const { join: pjoin } = await import("node:path");
    const { pathToFileURL: pf } = await import("node:url");
    const workerPath = pjoin(process.cwd(), "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs");
    pdfjsLib.GlobalWorkerOptions.workerSrc = pf(workerPath).href;
  }

  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(buf),
    useSystemFonts: true,
    disableFontFace: true,
  }).promise;

  const Y_TOLERANCE = 3;
  const allLines: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = (content.items as Array<{ str: string; transform: number[] }>)
      .filter((i) => i.str && i.str.trim())
      .map((i) => ({ x: i.transform[4], y: i.transform[5], str: i.str }))
      .sort((a, b) => b.y - a.y);
    const clusters: Array<{ y: number; items: Array<{ x: number; str: string }> }> = [];
    for (const it of items) {
      const last = clusters[clusters.length - 1];
      if (last && Math.abs(last.y - it.y) <= Y_TOLERANCE) {
        last.items.push({ x: it.x, str: it.str });
      } else {
        clusters.push({ y: it.y, items: [{ x: it.x, str: it.str }] });
      }
    }
    allLines.push(`===== PÁGINA ${p} =====`);
    for (const cluster of clusters) {
      cluster.items.sort((a, b) => a.x - b.x);
      const line = cluster.items.map((i) => i.str).join(" ").replace(/\s+/g, " ").trim();
      if (line) allLines.push(line);
    }
  }
  await doc.destroy();

  // Print all lines with index
  console.log(`TOTAL ${allLines.length} linhas`);
  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i];
    const isInteresting = /injetada|injecao|inje[cç]/i.test(line) || /energia\s*ativa/i.test(line);
    if (isInteresting) {
      console.log(`[${i}] ★ ${line}`);
    }
  }

  console.log("\n=== Linhas próximas de 'injetada' (contexto ±2) ===");
  for (let i = 0; i < allLines.length; i++) {
    if (/injetada/i.test(allLines[i])) {
      const start = Math.max(0, i - 2);
      const end = Math.min(allLines.length - 1, i + 2);
      console.log(`--- contexto [${i}] ---`);
      for (let j = start; j <= end; j++) {
        console.log(`  [${j}] ${j === i ? "★" : " "} ${allLines[j]}`);
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

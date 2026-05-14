import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseAnexoF } from "../src/lib/anexo-f-parser";
const DUMP = process.argv[3] === "--dump";

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Uso: npx tsx scripts/test-anexo-f.ts <caminho-do-pdf>");
    process.exit(1);
  }
  const data = new Uint8Array(readFileSync(resolve(file)));
  const parsed = await parseAnexoF(data);
  const { rawText, ...rest } = parsed;
  if (DUMP) {
    console.log("=== LINES ===");
    rawText?.split("\n").forEach((l, i) => console.log(`${i.toString().padStart(3, "0")}: ${l}`));
    console.log("\n=== PARSED ===");
  }
  console.log(JSON.stringify(rest, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

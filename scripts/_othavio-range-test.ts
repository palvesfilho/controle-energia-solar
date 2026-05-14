/** Chama sungrowRangeTotal direto pra uma janela do Othavio (13/03 → 10/04 - leitura abril). */
import "dotenv/config";
import { getRangeTotal } from "../src/lib/sungrow";

async function main() {
  const inicio = new Date(Date.UTC(2026, 2, 12)); // 12/03
  const fim = new Date(Date.UTC(2026, 3, 10));    // 10/04
  console.log(`Janela: ${inicio.toISOString()} → ${fim.toISOString()}`);
  const t0 = Date.now();
  const r = await getRangeTotal("1522536", inicio, fim);
  console.log(`Resultado: ${JSON.stringify(r)} em ${((Date.now()-t0)/1000).toFixed(1)}s`);
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); });

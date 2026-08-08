/**
 * Poda manual de `inverter_samples`. A lógica vive em `src/lib/intraday-prune.ts`,
 * porque o cron de 15 min também a executa (aos domingos) — ver
 * `scripts/collect-intraday-15min.ts --cron`.
 *
 * Uso:
 *   npx tsx scripts/prune-inverter-samples.ts                 # simulação (não apaga)
 *   npx tsx scripts/prune-inverter-samples.ts --apply
 *   npx tsx scripts/prune-inverter-samples.ts --apply --dias=90
 */
import { prisma } from "../src/lib/prisma";
import { podarAmostras } from "../src/lib/intraday-prune";

function arg(nome: string): string | undefined {
  const flag = `--${nome}=`;
  const a = process.argv.find((x) => x.startsWith(flag));
  return a ? a.slice(flag.length) : undefined;
}

async function main() {
  const r = await podarAmostras({
    dias: arg("dias") ? Number(arg("dias")) : undefined,
    aplicar: process.argv.includes("--apply"),
  });

  const pct = r.linhasTotal > 0 ? ((r.linhasAlvo / r.linhasTotal) * 100).toFixed(1) : "0";
  console.log(
    `[poda] corte em ${r.corte.toISOString().slice(0, 10)} · ` +
      `${r.linhasTotal.toLocaleString("pt-BR")} linhas · ` +
      `${r.linhasAlvo.toLocaleString("pt-BR")} a apagar (${pct}%)`,
  );

  if (!r.aplicado) {
    console.log("[poda] simulação — rode com --apply pra apagar de verdade");
    return;
  }
  console.log(
    `[poda] fim em ${(r.duracaoMs / 1000).toFixed(1)}s — ${r.linhasApagadas.toLocaleString("pt-BR")} linhas apagadas`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error("[poda] FALHA:", e);
    await prisma.$disconnect();
    process.exit(1);
  });

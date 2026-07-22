/**
 * Coleta da curva intra-dia Sungrow (InverterSample), pra o cron do Railway.
 *
 * Percorre TODOS os clientes BrasilSolar com Sungrow ativo e persiste os
 * samples (potência AC a cada ~5min) de cada dia da janela. Alimenta o gráfico
 * "Geração diária" (curva intradiária) do portal do cliente.
 *
 * Roda várias vezes ao longo do dia solar (ver railway.cron-sungrow-samples.json)
 * pra que a curva do DIA ATUAL apareça enquanto ainda está sendo formada.
 *
 * Uso:
 *   npx tsx scripts/collect-sungrow-samples.ts                 # hoje + ontem (UTC)
 *   npx tsx scripts/collect-sungrow-samples.ts --days=3        # últimos 3 dias
 *   npx tsx scripts/collect-sungrow-samples.ts --endDate=2026-07-20
 *
 * Idempotente (upsert por [psKey, timeStamp]).
 */
import { prisma } from "../src/lib/prisma";
import { persistDailySamples } from "../src/lib/sungrow-persist";

function parseArg(name: string): string | undefined {
  const flag = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(flag));
  return arg ? arg.slice(flag.length) : undefined;
}

async function main() {
  const days = Math.max(1, Math.min(7, Number(parseArg("days") ?? 2)));

  const endDateParam = parseArg("endDate");
  const endDate = (() => {
    if (endDateParam) {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(endDateParam);
      if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    }
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  })();

  const clients = await prisma.brasilSolarClient.findMany({
    where: {
      active: true,
      plataformaMonitoramento: "SUNGROW",
      monitoramentoPlantId: { not: null },
    },
    select: { id: true, nome: true, monitoramentoPlantId: true },
  });

  console.log(
    `[sungrow-samples] início — ${clients.length} usina(s) Sungrow | ${days} dia(s) até ${endDate.toISOString().slice(0, 10)}`,
  );
  const start = Date.now();
  let samplesUpserted = 0;
  let ok = 0;
  let errored = 0;

  for (const client of clients) {
    const psId = client.monitoramentoPlantId!;
    let clientFailed = false;

    for (let i = 0; i < days; i++) {
      const target = new Date(endDate);
      target.setUTCDate(target.getUTCDate() - i);
      try {
        const r = await persistDailySamples(
          client.id,
          psId,
          target.getUTCFullYear(),
          target.getUTCMonth() + 1,
          target.getUTCDate(),
        );
        samplesUpserted += r.samplesUpserted;
      } catch (e) {
        clientFailed = true;
        console.error(
          `  ✗ ${client.nome} (${target.toISOString().slice(0, 10)}):`,
          e instanceof Error ? e.message : e,
        );
      }
    }

    if (clientFailed) errored++;
    else ok++;
  }

  console.log(
    `[sungrow-samples] fim em ${((Date.now() - start) / 1000).toFixed(1)}s — ok=${ok} erro=${errored} samples=${samplesUpserted}`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });

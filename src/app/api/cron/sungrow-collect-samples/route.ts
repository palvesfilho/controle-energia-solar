/**
 * GET/POST /api/cron/sungrow-collect-samples
 *
 * Cron diário — coleta a curva intra-dia (32 amostras a cada 30min, 5h-21h BRT)
 * de TODOS os clientes BrasilSolar com Sungrow ativo. Persiste em InverterSample.
 *
 * Idempotente. Recomendado rodar 1x/dia depois das 00h UTC (ex.: 02h UTC).
 *
 * Autenticação: `Authorization: Bearer <CRON_SECRET>` OU `?token=<CRON_SECRET>`.
 * Override de dias: `?days=3` (default 1, máx 7).
 * Override de data fim: `?endDate=YYYY-MM-DD` (default = ontem UTC).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { persistDailySamples } from "@/lib/sungrow-persist";

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  const url = new URL(req.url);
  if (url.searchParams.get("token") === secret) return true;
  return false;
}

async function run(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { error: "Unauthorized — configure CRON_SECRET" },
      { status: 401 },
    );
  }

  const url = new URL(req.url);
  const days = Math.max(1, Math.min(7, Number(url.searchParams.get("days") ?? 1)));

  const endDateParam = url.searchParams.get("endDate");
  const endDate = (() => {
    if (endDateParam) {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(endDateParam);
      if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    }
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 1);
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

  const summary = {
    clientsTotal: clients.length,
    clientsOk: 0,
    clientsErrored: 0,
    samplesUpserted: 0,
    durationMs: 0,
    errors: [] as Array<{ clientId: string; nome: string; error: string }>,
  };
  const t0 = Date.now();

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
        summary.samplesUpserted += r.samplesUpserted;
      } catch (e) {
        clientFailed = true;
        summary.errors.push({
          clientId: client.id,
          nome: client.nome,
          error: e instanceof Error ? e.message : "erro desconhecido",
        });
      }
    }

    if (clientFailed) summary.clientsErrored++;
    else summary.clientsOk++;
  }

  summary.durationMs = Date.now() - t0;
  return NextResponse.json(summary);
}

export const GET = run;
export const POST = run;

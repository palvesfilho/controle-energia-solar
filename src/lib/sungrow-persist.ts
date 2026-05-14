/**
 * Persistência das amostras Sungrow no banco (`InverterSample`).
 *
 * `getDailySamples` (do `lib/sungrow`) retorna 32 amostras a cada 30 min
 * (5h–21h BRT) por inversor da planta. Aqui transformamos em registros do
 * banco com upsert (chave [psKey, timeStamp]) — idempotente.
 */
import { prisma } from "@/lib/prisma";
import { getDailySamples, type MinuteDataSample } from "@/lib/sungrow";

export interface PersistDailySamplesResult {
  clientId: string;
  psId: string;
  year: number;
  month: number;
  day: number;
  invertersProcessed: number;
  samplesUpserted: number;
}

function tsStringToDate(ts: string): Date | null {
  // "YYYYMMDDHHmmss" UTC → Date
  if (ts.length !== 14) return null;
  const y = Number(ts.substring(0, 4));
  const mo = Number(ts.substring(4, 6));
  const d = Number(ts.substring(6, 8));
  const h = Number(ts.substring(8, 10));
  const mi = Number(ts.substring(10, 12));
  const s = Number(ts.substring(12, 14));
  if ([y, mo, d, h, mi, s].some((n) => !Number.isFinite(n))) return null;
  return new Date(Date.UTC(y, mo - 1, d, h, mi, s));
}

/**
 * Coleta e persiste os 32 samples de um dia, pra todos os inversores de uma
 * planta. Idempotente — pode rodar de novo sem duplicar.
 */
export async function persistDailySamples(
  clientId: string,
  psId: string,
  year: number,
  month: number,
  day: number,
): Promise<PersistDailySamplesResult> {
  const inverterData = await getDailySamples(psId, year, month, day);

  let upserted = 0;
  for (const inv of inverterData) {
    for (const sample of inv.samples) {
      const dt = tsStringToDate(sample.timeStamp);
      if (!dt) continue;
      await prisma.inverterSample.upsert({
        where: { psKey_timeStamp: { psKey: inv.psKey, timeStamp: dt } },
        update: { p1Wh: sample.p1, p2Wh: sample.p2 },
        create: {
          clientId,
          psKey: inv.psKey,
          timeStamp: dt,
          p1Wh: sample.p1,
          p2Wh: sample.p2,
        },
      });
      upserted++;
    }
  }

  return {
    clientId,
    psId,
    year,
    month,
    day,
    invertersProcessed: inverterData.length,
    samplesUpserted: upserted,
  };
}

/**
 * Lê samples já persistidos de um inversor num dia. Útil pra plotar
 * gráfico no app sem rebater a Sungrow.
 */
export async function readDailySamples(
  clientId: string,
  day: Date,
): Promise<{ psKey: string; samples: MinuteDataSample[] }[]> {
  // Janela 5h-21h BRT = 8h UTC do dia até 00h UTC do dia seguinte
  const start = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 8, 0, 0));
  const end = new Date(start.getTime() + 16 * 60 * 60 * 1000);

  const rows = await prisma.inverterSample.findMany({
    where: { clientId, timeStamp: { gte: start, lt: end } },
    orderBy: [{ psKey: "asc" }, { timeStamp: "asc" }],
  });

  const grouped = new Map<string, MinuteDataSample[]>();
  for (const r of rows) {
    const list = grouped.get(r.psKey) ?? [];
    const ts = r.timeStamp;
    const stamp = `${ts.getUTCFullYear()}${String(ts.getUTCMonth() + 1).padStart(2, "0")}${String(ts.getUTCDate()).padStart(2, "0")}${String(ts.getUTCHours()).padStart(2, "0")}${String(ts.getUTCMinutes()).padStart(2, "0")}00`;
    list.push({ timeStamp: stamp, p1: r.p1Wh, p2: r.p2Wh });
    grouped.set(r.psKey, list);
  }
  return Array.from(grouped.entries()).map(([psKey, samples]) => ({ psKey, samples }));
}

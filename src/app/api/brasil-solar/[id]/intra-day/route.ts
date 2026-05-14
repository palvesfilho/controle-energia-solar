import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { readDailySamples } from "@/lib/sungrow-persist";
import { persistDailySamples } from "@/lib/sungrow-persist";

/**
 * GET /api/brasil-solar/[id]/intra-day?date=YYYY-MM-DD
 *
 * Retorna a curva intra-dia (32 amostras a cada 30min, 5h–21h BRT) já
 * persistida no banco. Default = ontem UTC.
 *
 * Body de saída:
 * {
 *   date: "2026-04-30",
 *   inverters: [
 *     { psKey, samples: [{ timeStampUtc, hhmmBrt, kwhAcumulado, p2Wh }, ...] }
 *   ],
 *   totalKwh: 25.3,
 *   capacidadeKwp: 9.23
 * }
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const dateParam = req.nextUrl.searchParams.get("date");

  // Default = ontem UTC (último dia com dados completos)
  const targetDate = (() => {
    if (dateParam) {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateParam);
      if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    }
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 1);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  })();

  const client = await prisma.brasilSolarClient.findUnique({
    where: { id },
    select: { id: true, potenciaInstalada: true },
  });
  if (!client) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  const grouped = await readDailySamples(id, targetDate);

  // Transforma timeStamp UTC → label BRT (HH:mm) e expõe kWh acumulado
  function utcStampToBrtHhmm(stamp: string): string {
    const y = Number(stamp.substring(0, 4));
    const mo = Number(stamp.substring(4, 6));
    const d = Number(stamp.substring(6, 8));
    const h = Number(stamp.substring(8, 10));
    const mi = Number(stamp.substring(10, 12));
    const dt = new Date(Date.UTC(y, mo - 1, d, h, mi, 0));
    dt.setUTCHours(dt.getUTCHours() - 3); // UTC → BRT
    return `${String(dt.getUTCHours()).padStart(2, "0")}:${String(dt.getUTCMinutes()).padStart(2, "0")}`;
  }

  let totalKwh = 0;
  const inverters = grouped.map((inv) => {
    const samples = inv.samples.map((s) => ({
      timeStampUtc: s.timeStamp,
      hhmmBrt: utcStampToBrtHhmm(s.timeStamp),
      kwhAcumulado: s.p1 != null ? s.p1 / 1000 : null,
      p2Wh: s.p2,
    }));
    // Último p1 não-nulo > 0 = energia do dia desse inversor
    let lastValidKwh = 0;
    for (let i = samples.length - 1; i >= 0; i--) {
      const v = samples[i].kwhAcumulado;
      if (v != null && v > 0) {
        lastValidKwh = v;
        break;
      }
    }
    totalKwh += lastValidKwh;
    return { psKey: inv.psKey, samples, kwhDoDia: lastValidKwh };
  });

  const isoDate = `${targetDate.getUTCFullYear()}-${String(targetDate.getUTCMonth() + 1).padStart(2, "0")}-${String(targetDate.getUTCDate()).padStart(2, "0")}`;

  return NextResponse.json({
    date: isoDate,
    inverters,
    totalKwh,
    capacidadeKwp: client.potenciaInstalada ?? null,
  });
}

/**
 * POST /api/brasil-solar/[id]/intra-day
 *
 * Coleta intra-dia (5h-21h BRT) e persiste. Body:
 * { days?: number }  // default 1 (apenas ontem)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const days = Math.max(1, Math.min(30, Number(body.days ?? 1)));

  const client = await prisma.brasilSolarClient.findUnique({
    where: { id },
    select: { id: true, monitoramentoPlantId: true, plataformaMonitoramento: true },
  });
  if (!client) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
  if (client.plataformaMonitoramento !== "SUNGROW" || !client.monitoramentoPlantId) {
    return NextResponse.json({ error: "Cliente sem Sungrow configurado" }, { status: 400 });
  }

  const psId = client.monitoramentoPlantId;
  const results = [] as Array<{ date: string; samplesUpserted: number; invertersProcessed: number }>;

  for (let i = 1; i <= days; i++) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    try {
      const r = await persistDailySamples(id, psId, year, month, day);
      results.push({
        date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        samplesUpserted: r.samplesUpserted,
        invertersProcessed: r.invertersProcessed,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "erro";
      results.push({
        date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        samplesUpserted: 0,
        invertersProcessed: 0,
        ...({ error: msg } as Record<string, string>),
      });
    }
  }

  return NextResponse.json({ message: "Coleta intra-dia concluída", days, results });
}

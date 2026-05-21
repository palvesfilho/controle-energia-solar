import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

// GET /api/brasil-solar/proprietarios/[id]/metricas
// Agrega MonitoringLog de todas as usinas do proprietário (últimos 12 meses)
// e calcula KPIs combinados.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;

  const proprietario = await prisma.brasilSolarProprietario.findUnique({
    where: { id },
    select: { id: true, nome: true },
  });
  if (!proprietario) {
    return NextResponse.json({ error: "Proprietário não encontrado" }, { status: 404 });
  }

  const plantas = await prisma.brasilSolarClient.findMany({
    where: { proprietarioId: id, active: true },
    select: {
      id: true,
      potenciaInstalada: true,
      geracaoMesAtual: true,
      geracaoMediaEsperada: true,
      performanceRatio: true,
      statusMonitoramento: true,
    },
  });

  if (plantas.length === 0) {
    return NextResponse.json({
      plantasCount: 0,
      potenciaTotal: 0,
      geracaoMesAtual: 0,
      geracaoMediaEsperada: 0,
      performanceRatio: null,
      picoMaximo30d: 0,
      mediaDiaria30d: 0,
      onlineCount: 0,
      monitoringLogs: [],
    });
  }

  const plantIds = plantas.map((p) => p.id);
  const desde = new Date();
  desde.setMonth(desde.getMonth() - 12);

  const logs = await prisma.monitoringLog.findMany({
    where: { clientId: { in: plantIds }, data: { gte: desde } },
    select: {
      data: true,
      geracaoDiaria: true,
      geracaoEsperada: true,
      picoMaximo: true,
      horasSol: true,
      irradiacao: true,
      temperatura: true,
    },
    orderBy: { data: "asc" },
  });

  // Agregação por dia (somando todas as usinas no mesmo dia)
  type Agg = {
    data: Date;
    geracaoDiaria: number;
    geracaoEsperada: number;
    geracaoEsperadaCount: number;
    picoMaximo: number;
    horasSolSum: number;
    horasSolCount: number;
    irradiacaoSum: number;
    irradiacaoCount: number;
    temperaturaSum: number;
    temperaturaCount: number;
  };
  const byDay = new Map<string, Agg>();
  for (const l of logs) {
    const key = l.data.toISOString().slice(0, 10);
    let agg = byDay.get(key);
    if (!agg) {
      agg = {
        data: new Date(key + "T00:00:00.000Z"),
        geracaoDiaria: 0,
        geracaoEsperada: 0,
        geracaoEsperadaCount: 0,
        picoMaximo: 0,
        horasSolSum: 0,
        horasSolCount: 0,
        irradiacaoSum: 0,
        irradiacaoCount: 0,
        temperaturaSum: 0,
        temperaturaCount: 0,
      };
      byDay.set(key, agg);
    }
    agg.geracaoDiaria += l.geracaoDiaria;
    if (l.geracaoEsperada != null) {
      agg.geracaoEsperada += l.geracaoEsperada;
      agg.geracaoEsperadaCount += 1;
    }
    if (l.picoMaximo != null && l.picoMaximo > agg.picoMaximo) {
      agg.picoMaximo = l.picoMaximo;
    }
    if (l.horasSol != null) {
      agg.horasSolSum += l.horasSol;
      agg.horasSolCount += 1;
    }
    if (l.irradiacao != null) {
      agg.irradiacaoSum += l.irradiacao;
      agg.irradiacaoCount += 1;
    }
    if (l.temperatura != null) {
      agg.temperaturaSum += l.temperatura;
      agg.temperaturaCount += 1;
    }
  }

  const monitoringLogs = Array.from(byDay.values())
    .sort((a, b) => a.data.getTime() - b.data.getTime())
    .map((a, i) => ({
      id: `agg-${a.data.toISOString().slice(0, 10)}-${i}`,
      data: a.data.toISOString(),
      geracaoDiaria: a.geracaoDiaria,
      geracaoEsperada: a.geracaoEsperadaCount > 0 ? a.geracaoEsperada : null,
      picoMaximo: a.picoMaximo > 0 ? a.picoMaximo : null,
      horasSol: a.horasSolCount > 0 ? a.horasSolSum / a.horasSolCount : null,
      irradiacao: a.irradiacaoCount > 0 ? a.irradiacaoSum / a.irradiacaoCount : null,
      temperatura: a.temperaturaCount > 0 ? a.temperaturaSum / a.temperaturaCount : null,
    }));

  // KPIs dos últimos 30 dias
  const corte30d = new Date();
  corte30d.setDate(corte30d.getDate() - 30);
  const logs30d = monitoringLogs.filter((l) => new Date(l.data) >= corte30d);
  const mediaDiaria30d =
    logs30d.length > 0
      ? logs30d.reduce((s, l) => s + l.geracaoDiaria, 0) / logs30d.length
      : 0;
  const picoMaximo30d = logs30d.reduce(
    (m, l) => Math.max(m, l.picoMaximo ?? 0),
    0,
  );

  // Agregações sobre as plantas
  const potenciaTotal = plantas.reduce((s, p) => s + (p.potenciaInstalada ?? 0), 0);
  const geracaoMesAtual = plantas.reduce((s, p) => s + (p.geracaoMesAtual ?? 0), 0);
  const geracaoMediaEsperada = plantas.reduce(
    (s, p) => s + (p.geracaoMediaEsperada ?? 0),
    0,
  );
  const onlineCount = plantas.filter((p) => p.statusMonitoramento === "ONLINE").length;

  // PR ponderado pela potência instalada (ignora plantas sem potência ou sem PR)
  let prWeightedNum = 0;
  let prWeightedDen = 0;
  for (const p of plantas) {
    if (p.performanceRatio != null && p.potenciaInstalada && p.potenciaInstalada > 0) {
      prWeightedNum += p.performanceRatio * p.potenciaInstalada;
      prWeightedDen += p.potenciaInstalada;
    }
  }
  const performanceRatio = prWeightedDen > 0 ? prWeightedNum / prWeightedDen : null;

  return NextResponse.json({
    plantasCount: plantas.length,
    potenciaTotal,
    geracaoMesAtual,
    geracaoMediaEsperada: geracaoMediaEsperada > 0 ? geracaoMediaEsperada : null,
    performanceRatio,
    picoMaximo30d,
    mediaDiaria30d,
    onlineCount,
    monitoringLogs,
  });
}

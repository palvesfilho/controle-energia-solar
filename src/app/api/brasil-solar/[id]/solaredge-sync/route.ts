import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { getDailyGeneration, getSiteOverview } from "@/lib/solaredge";

/**
 * POST /api/brasil-solar/[id]/solaredge-sync
 * Sincroniza dados de geração SolarEdge para um cliente individual.
 * Busca os últimos 12 meses de geração diária + status em tempo real.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const { id } = await params;

  const client = await prisma.brasilSolarClient.findUnique({
    where: { id },
    select: {
      id: true,
      monitoramentoPlantId: true,
      plataformaMonitoramento: true,
      geracaoMediaEsperada: true,
    },
  });

  if (!client) {
    return NextResponse.json({ error: "Cliente nao encontrado" }, { status: 404 });
  }

  if (client.plataformaMonitoramento !== "SOLAREDGE" || !client.monitoramentoPlantId) {
    return NextResponse.json(
      { error: "Cliente nao possui monitoramento SolarEdge configurado" },
      { status: 400 }
    );
  }

  const siteId = parseInt(client.monitoramentoPlantId);

  if (isNaN(siteId)) {
    return NextResponse.json(
      { error: "Site ID SolarEdge invalido (deve ser numerico)" },
      { status: 400 }
    );
  }

  try {
    // Buscar geração dos últimos 12 meses
    const now = new Date();
    const months: { year: number; month: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
    }

    let logsUpserted = 0;

    for (const { year, month } of months) {
      try {
        const dailyData = await getDailyGeneration(siteId, year, month);

        for (const day of dailyData) {
          const date = new Date(year, month - 1, day.day, 12, 0, 0);

          await prisma.monitoringLog.upsert({
            where: {
              clientId_data: { clientId: id, data: date },
            },
            update: {
              geracaoDiaria: day.energyKwh,
            },
            create: {
              clientId: id,
              data: date,
              geracaoDiaria: day.energyKwh,
              geracaoEsperada: client.geracaoMediaEsperada
                ? client.geracaoMediaEsperada / 30
                : null,
            },
          });
          logsUpserted++;
        }
      } catch {
        // Mês pode não ter dados
      }
    }

    // Buscar status em tempo real
    let isOnline = false;
    let currentPowerW = 0;
    let dayEnergyKwh = 0;
    try {
      const overview = await getSiteOverview(siteId);
      currentPowerW = overview.currentPower.power ?? 0;
      dayEnergyKwh = (overview.lastDayData.energy ?? 0) / 1000;
      isOnline = currentPowerW > 0;
    } catch {
      // Overview pode falhar - seguir sem
    }

    // Recalcular KPIs desnormalizados
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [monthAgg, last30Logs] = await Promise.all([
      prisma.monitoringLog.aggregate({
        where: { clientId: id, data: { gte: startOfMonth } },
        _sum: { geracaoDiaria: true },
      }),
      prisma.monitoringLog.findMany({
        where: { clientId: id, data: { gte: thirtyDaysAgo } },
        orderBy: { data: "desc" },
        select: { geracaoDiaria: true, picoMaximo: true },
      }),
    ]);

    const geracaoMes = monthAgg._sum.geracaoDiaria ?? 0;
    const pr =
      client.geracaoMediaEsperada && client.geracaoMediaEsperada > 0
        ? (geracaoMes / client.geracaoMediaEsperada) * 100
        : null;

    const ultimaGeracao = last30Logs.length > 0 ? last30Logs[0].geracaoDiaria : null;

    await prisma.brasilSolarClient.update({
      where: { id },
      data: {
        geracaoMesAtual: geracaoMes,
        ultimaGeracao: ultimaGeracao,
        ultimaLeitura: new Date(),
        performanceRatio: pr,
        statusMonitoramento: isOnline ? "ONLINE" : last30Logs.length > 0 ? "ALERTA" : "SEM_DADOS",
      },
    });

    return NextResponse.json({
      message: "Sincronizacao SolarEdge concluida",
      logsUpserted,
      geracaoMesAtual: geracaoMes,
      performanceRatio: pr,
      isOnline,
      currentPowerW,
      dayEnergyKwh,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

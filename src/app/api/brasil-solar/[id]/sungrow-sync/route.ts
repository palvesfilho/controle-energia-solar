import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { getDailyGeneration, getPlantStatus, getStationDetail } from "@/lib/sungrow";
import { persistDailySamples } from "@/lib/sungrow-persist";

/**
 * POST /api/brasil-solar/[id]/sungrow-sync
 * Sincroniza dados de geração Sungrow iSolarCloud para um cliente individual.
 * - Geração diária dos últimos 3 meses (escopo do appkey usa MinuteData,
 *   12 meses ficaria caro demais — ~30 min de coleta).
 * - Curva intra-dia (32 amostras/30min) dos últimos 7 dias para o gráfico.
 * - Status em tempo real.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const { id } = await params;

  // Range de meses controlável via query (?months=N) ou body { months: N }.
  // Default 3. Máx 36. Se ?fromInstall=1, usa dataInstalacao do cliente como teto.
  const url = new URL(req.url);
  const monthsParam = url.searchParams.get("months");
  const fromInstall = url.searchParams.get("fromInstall") === "1";
  const bodyMonths = await req.json().catch(() => null);

  const client = await prisma.brasilSolarClient.findUnique({
    where: { id },
    select: {
      id: true,
      monitoramentoPlantId: true,
      plataformaMonitoramento: true,
      geracaoMediaEsperada: true,
      dataInstalacao: true,
    },
  });

  if (!client) {
    return NextResponse.json({ error: "Cliente nao encontrado" }, { status: 404 });
  }

  if (client.plataformaMonitoramento !== "SUNGROW" || !client.monitoramentoPlantId) {
    return NextResponse.json(
      { error: "Cliente nao possui monitoramento Sungrow configurado" },
      { status: 400 }
    );
  }

  const psId = client.monitoramentoPlantId;

  try {
    const now = new Date();
    let monthsCount = 3;
    if (fromInstall) {
      // Tenta usar dataInstalacao do DB; se null, consulta Sungrow.
      let installDate: Date | null = client.dataInstalacao ? new Date(client.dataInstalacao) : null;
      if (!installDate) {
        try {
          const detail = await getStationDetail(psId) as unknown as { install_date?: string };
          if (detail.install_date) {
            installDate = new Date(detail.install_date);
            // Persiste pra próxima vez não precisar consultar
            if (!Number.isNaN(installDate.getTime())) {
              await prisma.brasilSolarClient.update({
                where: { id },
                data: { dataInstalacao: installDate },
              });
            }
          }
        } catch {
          // sem install_date, fallback abaixo
        }
      }
      if (installDate && !Number.isNaN(installDate.getTime())) {
        const diff = (now.getFullYear() - installDate.getFullYear()) * 12 + (now.getMonth() - installDate.getMonth()) + 1;
        monthsCount = Math.max(1, Math.min(36, diff));
      } else {
        monthsCount = 24; // fallback razoável
      }
    } else {
      const requested = Number(monthsParam ?? bodyMonths?.months ?? 3);
      monthsCount = Math.max(1, Math.min(36, Number.isFinite(requested) ? requested : 3));
    }

    const months: { year: number; month: number }[] = [];
    for (let i = 0; i < monthsCount; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
    }

    let logsUpserted = 0;

    for (const { year, month } of months) {
      try {
        const dailyData = await getDailyGeneration(psId, year, month);

        for (const day of dailyData) {
          const date = new Date(year, month - 1, day.day, 12, 0, 0);

          await prisma.monitoringLog.upsert({
            where: {
              clientId_data: { clientId: id, data: date },
            },
            update: {
              geracaoDiaria: day.energyKwh,
              irradiacao: day.radiation,
            },
            create: {
              clientId: id,
              data: date,
              geracaoDiaria: day.energyKwh,
              irradiacao: day.radiation,
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
      const status = await getPlantStatus(psId);
      isOnline = status.isOnline;
      currentPowerW = status.currentPowerW;
      dayEnergyKwh = status.dayEnergyKwh;
    } catch {
      // Status pode falhar - seguir sem
    }

    // Persistir curva intra-dia dos últimos 7 dias pra gráfico do app
    let samplesUpserted = 0;
    for (let i = 1; i <= 7; i++) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - i);
      try {
        const r = await persistDailySamples(
          id,
          psId,
          d.getUTCFullYear(),
          d.getUTCMonth() + 1,
          d.getUTCDate(),
        );
        samplesUpserted += r.samplesUpserted;
      } catch {
        // dia pode não ter dados — segue
      }
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
      message: "Sincronizacao Sungrow concluida",
      logsUpserted,
      samplesUpserted,
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

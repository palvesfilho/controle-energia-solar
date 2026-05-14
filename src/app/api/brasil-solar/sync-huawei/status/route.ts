import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { getPlantStatusBatch, getDeviceMetricsBatch } from "@/lib/huawei";

// POST /api/brasil-solar/sync-huawei/status - Atualizar status de todas as plantas Huawei
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  try {
    const clients = await prisma.brasilSolarClient.findMany({
      where: {
        active: true,
        plataformaMonitoramento: "HUAWEI",
        monitoramentoPlantId: { not: null },
      },
      select: {
        id: true,
        monitoramentoPlantId: true,
      },
    });

    if (clients.length === 0) {
      return NextResponse.json({ error: "Nenhum cliente Huawei encontrado" }, { status: 400 });
    }

    const codeToClient = new Map(
      clients.map((c) => [c.monitoramentoPlantId!, c.id])
    );
    const stationCodes = clients.map((c) => c.monitoramentoPlantId!);

    // Busca status agregado + métricas instantâneas por inversor em paralelo
    const [statusResults, metricsResults] = await Promise.all([
      getPlantStatusBatch(stationCodes),
      getDeviceMetricsBatch(stationCodes),
    ]);

    let online = 0;
    let offline = 0;
    let errors = 0;

    const BATCH_SIZE = 50;
    const entries = Array.from(statusResults.entries());

    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE);

      const operations = batch.map(async ([stationCode, status]) => {
        const clientId = codeToClient.get(stationCode);
        if (!clientId) return;

        try {
          const newStatus = status.isOnline ? "ONLINE" : "OFFLINE";
          if (status.isOnline) online++;
          else offline++;

          const metrics = metricsResults.get(stationCode);
          const hasMetrics =
            metrics != null &&
            (metrics.voltageAC != null ||
              metrics.temperature != null ||
              metrics.frequency != null);

          await prisma.brasilSolarClient.update({
            where: { id: clientId },
            data: {
              statusMonitoramento: newStatus,
              ultimaLeitura: new Date(),
              ultimaGeracao: status.dayPowerKwh || undefined,
              geracaoMesAtual: status.monthPowerKwh || undefined,
              tensaoRede: metrics?.voltageAC ?? undefined,
              temperaturaInversor: metrics?.temperature ?? undefined,
              frequenciaRede: metrics?.frequency ?? undefined,
              ultimaMetricaEm: hasMetrics ? new Date() : undefined,
            },
          });
        } catch {
          errors++;
        }
      });

      await Promise.all(operations);
    }

    return NextResponse.json({
      message: "Status Huawei atualizado",
      total: entries.length,
      online,
      offline,
      errors,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

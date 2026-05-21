import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { getFlowDataBatch } from "@/lib/fronius";

// POST /api/brasil-solar/sync/status - Atualizar status online/offline de todas as plantas
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  try {
    // Buscar clientes Fronius
    const clients = await prisma.brasilSolarClient.findMany({
      where: {
        active: true,
        plataformaMonitoramento: "FRONIUS",
        monitoramentoPlantId: { not: null },
      },
      select: {
        id: true,
        monitoramentoPlantId: true,
      },
    });

    if (clients.length === 0) {
      return NextResponse.json({ error: "Nenhum cliente Fronius encontrado" }, { status: 400 });
    }

    const pvToClient = new Map(
      clients.map((c) => [c.monitoramentoPlantId!, c.id])
    );
    const pvSystemIds = clients.map((c) => c.monitoramentoPlantId!);

    // Buscar flowdata em lotes (com rate limiting interno)
    const flowResults = await getFlowDataBatch(pvSystemIds);

    let online = 0;
    let offline = 0;
    let errors = 0;

    // Atualizar status no banco em lotes
    const BATCH_SIZE = 50;
    const entries = Array.from(flowResults.entries());

    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE);

      const operations = batch.map(async ([pvSystemId, status]) => {
        const clientId = pvToClient.get(pvSystemId);
        if (!clientId) return;

        try {
          const newStatus = status.isOnline ? "ONLINE" : "OFFLINE";
          if (status.isOnline) online++;
          else offline++;

          const hasMetrics =
            status.voltageAC != null ||
            status.temperature != null ||
            status.frequency != null;

          await prisma.brasilSolarClient.update({
            where: { id: clientId },
            data: {
              statusMonitoramento: newStatus,
              ultimaLeitura: new Date(status.lastReading),
              ultimaGeracao: status.currentPowerW
                ? status.currentPowerW / 1000 // W → kW (potência instantânea)
                : undefined,
              // Métricas instantâneas (quando o canal correspondente vem no flowdata)
              tensaoRede: status.voltageAC ?? undefined,
              temperaturaInversor: status.temperature ?? undefined,
              frequenciaRede: status.frequency ?? undefined,
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
      message: "Status atualizado",
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

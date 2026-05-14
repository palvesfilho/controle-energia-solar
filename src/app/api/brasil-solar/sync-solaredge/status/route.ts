import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { getPlantStatusBatch } from "@/lib/solaredge";

// POST /api/brasil-solar/sync-solaredge/status - Atualizar status de todas as plantas SolarEdge
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  try {
    const clients = await prisma.brasilSolarClient.findMany({
      where: {
        active: true,
        plataformaMonitoramento: "SOLAREDGE",
        monitoramentoPlantId: { not: null },
      },
      select: {
        id: true,
        monitoramentoPlantId: true,
      },
    });

    if (clients.length === 0) {
      return NextResponse.json({ error: "Nenhum cliente SolarEdge encontrado" }, { status: 400 });
    }

    const idToClient = new Map(
      clients.map((c) => [Number(c.monitoramentoPlantId!), c.id])
    );
    const siteIds = clients.map((c) => Number(c.monitoramentoPlantId!));

    const statusResults = await getPlantStatusBatch(siteIds);

    let online = 0;
    let offline = 0;
    let errors = 0;

    const BATCH_SIZE = 50;
    const entries = Array.from(statusResults.entries());

    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE);

      const operations = batch.map(async ([siteId, status]) => {
        const clientId = idToClient.get(siteId);
        if (!clientId) return;

        try {
          const newStatus = status.isOnline ? "ONLINE" : "OFFLINE";
          if (status.isOnline) online++;
          else offline++;

          await prisma.brasilSolarClient.update({
            where: { id: clientId },
            data: {
              statusMonitoramento: newStatus,
              ultimaLeitura: status.lastUpdate ? new Date(status.lastUpdate) : new Date(),
              ultimaGeracao: status.dayEnergyKwh || undefined,
              geracaoMesAtual: status.monthEnergyKwh || undefined,
            },
          });
        } catch {
          errors++;
        }
      });

      await Promise.all(operations);
    }

    return NextResponse.json({
      message: "Status SolarEdge atualizado",
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

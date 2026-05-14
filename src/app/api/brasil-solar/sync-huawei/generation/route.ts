import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { getDailyGenerationBatch } from "@/lib/huawei";

// POST /api/brasil-solar/sync-huawei/generation - Sincronizar geracao diaria Huawei
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const now = new Date();
  const year = body.year || now.getFullYear();
  const month = body.month || (now.getMonth() + 1);

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
        geracaoMediaEsperada: true,
      },
    });

    if (clients.length === 0) {
      return NextResponse.json(
        { error: "Nenhum cliente Huawei encontrado. Execute a importacao de plantas primeiro." },
        { status: 400 },
      );
    }

    const codeToClient = new Map(
      clients.map((c) => [c.monitoramentoPlantId!, c])
    );
    const stationCodes = clients.map((c) => c.monitoramentoPlantId!);

    const generationData = await getDailyGenerationBatch(stationCodes, year, month);

    let logsCreated = 0;
    let clientsUpdated = 0;
    let errors = 0;

    const BATCH_SIZE = 50;
    const entries = Array.from(generationData.entries());

    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE);

      const operations = batch.map(async ([stationCode, dailyData]) => {
        const clientInfo = codeToClient.get(stationCode);
        if (!clientInfo) return;

        try {
          for (const day of dailyData) {
            const date = new Date(year, month - 1, day.day, 12, 0, 0);

            await prisma.monitoringLog.upsert({
              where: {
                clientId_data: { clientId: clientInfo.id, data: date },
              },
              update: {
                geracaoDiaria: day.energyKwh,
                irradiacao: day.radiationIntensity,
              },
              create: {
                clientId: clientInfo.id,
                data: date,
                geracaoDiaria: day.energyKwh,
                irradiacao: day.radiationIntensity,
                geracaoEsperada: clientInfo.geracaoMediaEsperada
                  ? clientInfo.geracaoMediaEsperada / 30
                  : null,
              },
            });
            logsCreated++;
          }

          const totalMes = dailyData.reduce((sum, d) => sum + d.energyKwh, 0);
          const ultimoDia = dailyData.length > 0
            ? dailyData[dailyData.length - 1]
            : null;

          const pr = clientInfo.geracaoMediaEsperada && clientInfo.geracaoMediaEsperada > 0
            ? (totalMes / clientInfo.geracaoMediaEsperada) * 100
            : null;

          await prisma.brasilSolarClient.update({
            where: { id: clientInfo.id },
            data: {
              geracaoMesAtual: totalMes,
              ultimaGeracao: ultimoDia?.energyKwh ?? undefined,
              ultimaLeitura: new Date(),
              performanceRatio: pr,
              statusMonitoramento: dailyData.length > 0 ? "ONLINE" : undefined,
            },
          });
          clientsUpdated++;
        } catch {
          errors++;
        }
      });

      await Promise.all(operations);
    }

    return NextResponse.json({
      message: "Geracao Huawei sincronizada",
      periodo: `${month}/${year}`,
      clientesProcessados: entries.length,
      clientsUpdated,
      logsCreated,
      errors,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

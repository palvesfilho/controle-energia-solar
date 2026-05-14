import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { getAllStations, getStationRealKpi, type HuaweiStation } from "@/lib/huawei";

// POST /api/brasil-solar/sync-huawei - Sincronizar plantas Huawei FusionSolar → BrasilSolarClient
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  try {
    // Buscar todas as plantas da Huawei
    const stations = await getAllStations();

    // Buscar KPIs em tempo real para determinar status (lotes de 100)
    const stationCodes = stations.map((s) => s.stationCode);
    const kpiMap = new Map<string, { isOnline: boolean; capacityKwp: number }>();

    for (let i = 0; i < stationCodes.length; i += 100) {
      const batch = stationCodes.slice(i, i + 100);
      try {
        const kpis = await getStationRealKpi(batch);
        for (const kpi of kpis) {
          kpiMap.set(kpi.stationCode, {
            isOnline: kpi.dataItemMap?.real_health_state === 3,
            capacityKwp: kpi.dataItemMap?.installed_capacity ?? 0,
          });
        }
      } catch {
        // Se falhar o KPI, continua sem status
      }
    }

    // Buscar clientes ja existentes indexados por monitoramentoPlantId
    const existingClients = await prisma.brasilSolarClient.findMany({
      where: { plataformaMonitoramento: "HUAWEI" },
      select: { id: true, monitoramentoPlantId: true },
    });

    const existingMap = new Map(
      existingClients
        .filter((c) => c.monitoramentoPlantId)
        .map((c) => [c.monitoramentoPlantId!, c.id])
    );

    let created = 0;
    let updated = 0;
    let errors = 0;

    // Processar em lotes de 50
    const BATCH_SIZE = 50;
    for (let i = 0; i < stations.length; i += BATCH_SIZE) {
      const batch = stations.slice(i, i + BATCH_SIZE);

      const operations = batch.map((station) => {
        const data = mapHuaweiToClient(station, kpiMap.get(station.stationCode));
        const existingId = existingMap.get(station.stationCode);

        if (existingId) {
          return prisma.brasilSolarClient
            .update({
              where: { id: existingId },
              data: {
                nome: data.nome,
                endereco: data.endereco,
                potenciaInstalada: data.potenciaInstalada,
                statusMonitoramento: data.statusMonitoramento,
                ultimaLeitura: new Date(),
              },
            })
            .then(() => { updated++; })
            .catch(() => { errors++; });
        } else {
          return prisma.brasilSolarClient
            .create({ data })
            .then(() => { created++; })
            .catch(() => { errors++; });
        }
      });

      await Promise.all(operations);
    }

    return NextResponse.json({
      message: "Sincronizacao Huawei concluida",
      total: stations.length,
      created,
      updated,
      errors,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function mapHuaweiToClient(
  station: HuaweiStation,
  kpi?: { isOnline: boolean; capacityKwp: number },
) {
  let statusMonitoramento = "SEM_DADOS";
  if (kpi) {
    statusMonitoramento = kpi.isOnline ? "ONLINE" : "OFFLINE";
  }

  return {
    nome: station.stationName,
    endereco: station.stationAddr || undefined,
    potenciaInstalada: kpi?.capacityKwp || station.capacity || undefined,
    plataformaMonitoramento: "HUAWEI",
    monitoramentoPlantId: station.stationCode,
    monitoramentoUrl: `https://la5.fusionsolar.huawei.com/#/energy/flow?stationCode=${station.stationCode}`,
    statusMonitoramento,
    statusContrato: "ATIVO",
  };
}

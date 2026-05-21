import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { getAllStations, getStationCapacityKwp, type SungrowStation } from "@/lib/sungrow";

// POST /api/brasil-solar/sync-sungrow - Sincronizar plantas Sungrow iSolarCloud → BrasilSolarClient
export async function POST(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  try {
    const stations = await getAllStations();

    const existingClients = await prisma.brasilSolarClient.findMany({
      where: { plataformaMonitoramento: "SUNGROW" },
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

    const BATCH_SIZE = 50;
    for (let i = 0; i < stations.length; i += BATCH_SIZE) {
      const batch = stations.slice(i, i + BATCH_SIZE);

      const operations = batch.map((station) => {
        const data = mapSungrowToClient(station);
        const existingId = existingMap.get(String(station.ps_id));

        if (existingId) {
          return prisma.brasilSolarClient
            .update({
              where: { id: existingId },
              data: {
                nome: data.nome,
                endereco: data.endereco,
                latitude: data.latitude,
                longitude: data.longitude,
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
      message: "Sincronizacao Sungrow concluida",
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

function mapSungrowToClient(station: SungrowStation) {
  const statusMonitoramento = station.ps_status === 1 ? "ONLINE" : "OFFLINE";
  const capacityKw = getStationCapacityKwp(station);
  const potenciaInstalada = capacityKw > 0 ? capacityKw : undefined;

  return {
    nome: station.ps_name || station.ps_short_name || `Planta ${station.ps_id}`,
    endereco: station.ps_location || undefined,
    latitude: station.latitude ?? undefined,
    longitude: station.longitude ?? undefined,
    potenciaInstalada,
    plataformaMonitoramento: "SUNGROW",
    monitoramentoPlantId: String(station.ps_id),
    monitoramentoUrl: `https://www.isolarcloud.com.hk/#/powerStation/PowerStationDetail?ps_id=${station.ps_id}`,
    statusMonitoramento,
    statusContrato: "ATIVO",
  };
}

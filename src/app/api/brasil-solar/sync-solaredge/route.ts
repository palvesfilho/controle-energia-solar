import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { getAllSites, type SolarEdgeSite } from "@/lib/solaredge";

// POST /api/brasil-solar/sync-solaredge - Sincronizar plantas SolarEdge → BrasilSolarClient
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  try {
    const sites = await getAllSites();

    // Buscar clientes ja existentes indexados por monitoramentoPlantId
    const existingClients = await prisma.brasilSolarClient.findMany({
      where: { plataformaMonitoramento: "SOLAREDGE" },
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
    for (let i = 0; i < sites.length; i += BATCH_SIZE) {
      const batch = sites.slice(i, i + BATCH_SIZE);

      const operations = batch.map((site) => {
        const data = mapSolarEdgeToClient(site);
        const existingId = existingMap.get(String(site.id));

        if (existingId) {
          return prisma.brasilSolarClient
            .update({
              where: { id: existingId },
              data: {
                nome: data.nome,
                endereco: data.endereco,
                cidade: data.cidade,
                uf: data.uf,
                potenciaInstalada: data.potenciaInstalada,
                monitoramentoUrl: data.monitoramentoUrl,
                ultimaLeitura: data.ultimaLeitura,
                statusMonitoramento: data.statusMonitoramento,
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
      message: "Sincronizacao SolarEdge concluida",
      total: sites.length,
      created,
      updated,
      errors,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function mapSolarEdgeToClient(site: SolarEdgeSite) {
  const uf = extractUf(site.location.state, site.location.city);

  let statusMonitoramento = "SEM_DADOS";
  if (site.lastUpdateTime) {
    const lastUpdate = new Date(site.lastUpdateTime);
    const diffHours = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60);
    if (diffHours < 24) statusMonitoramento = "ONLINE";
    else if (diffHours < 72) statusMonitoramento = "ALERTA";
    else statusMonitoramento = "OFFLINE";
  }

  return {
    nome: site.name,
    endereco: site.location.address || undefined,
    cidade: site.location.city || undefined,
    uf,
    potenciaInstalada: site.peakPower || undefined,
    dataInstalacao: site.installationDate ? new Date(site.installationDate) : undefined,
    plataformaMonitoramento: "SOLAREDGE",
    monitoramentoPlantId: String(site.id),
    monitoramentoUrl: `https://monitoring.solaredge.com/solaredge-web/p/site/${site.id}`,
    statusMonitoramento,
    ultimaLeitura: site.lastUpdateTime ? new Date(site.lastUpdateTime) : undefined,
    statusContrato: "ATIVO",
  };
}

function extractUf(state: string | null, city: string | null): string | undefined {
  if (state && state.length === 2) return state.toUpperCase();
  if (city) {
    const match = city.match(/\b([A-Z]{2})$/);
    if (match) return match[1];
  }
  return undefined;
}

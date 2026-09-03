import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { getAllSites, type SolarEdgeSite } from "@/lib/solaredge";

// POST /api/brasil-solar/sync-solaredge - Sincronizar plantas SolarEdge → BrasilSolarClient
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  try {
    const sites = await getAllSites();

    // Buscar clientes ja existentes indexados por monitoramentoPlantId.
    // `ultimaLeitura` vem junto porque o carimbo NAO pode andar pra tras: sem o
    // valor atual nao da pra comparar.
    const existingClients = await prisma.brasilSolarClient.findMany({
      where: { plataformaMonitoramento: "SOLAREDGE" },
      select: { id: true, monitoramentoPlantId: true, ultimaLeitura: true },
    });

    const existingMap = new Map(
      existingClients
        .filter((c) => c.monitoramentoPlantId)
        .map((c) => [c.monitoramentoPlantId!, c])
    );

    let created = 0;
    let updated = 0;
    let errors = 0;

    const BATCH_SIZE = 50;
    for (let i = 0; i < sites.length; i += BATCH_SIZE) {
      const batch = sites.slice(i, i + BATCH_SIZE);

      const operations = batch.map((site) => {
        const data = mapSolarEdgeToClient(site);
        const existente = existingMap.get(String(site.id));

        if (existente) {
          return prisma.brasilSolarClient
            .update({
              where: { id: existente.id },
              data: {
                nome: data.nome,
                endereco: data.endereco,
                cidade: data.cidade,
                uf: data.uf,
                potenciaInstalada: data.potenciaInstalada,
                monitoramentoUrl: data.monitoramentoUrl,
                // As duas travas contra apagar o que ja se sabe. Ver o comentario
                // de `mapSolarEdgeToClient`: `/sites/list` pode nao trazer
                // `lastUpdateTime`, e sem ele esta rota jogou as 249 usinas
                // SolarEdge para SEM_DADOS em 19/08/2026 — 195 delas com log de
                // geracao do proprio dia.
                //
                // (a) Status so muda com EVIDENCIA. `undefined` faz o Prisma
                //     ignorar o campo, entao o status bom fica onde estava.
                ...(data.statusMonitoramento ? { statusMonitoramento: data.statusMonitoramento } : {}),
                // (b) Carimbo de leitura so AVANCA. Um `lastUpdateTime` mais
                //     velho que o guardado significa leitura pior, nao usina
                //     que voltou no tempo.
                ...(data.ultimaLeitura &&
                (!existente.ultimaLeitura || data.ultimaLeitura > existente.ultimaLeitura)
                  ? { ultimaLeitura: data.ultimaLeitura }
                  : {}),
              },
            })
            .then(() => { updated++; })
            .catch(() => { errors++; });
        } else {
          return prisma.brasilSolarClient
            // Usina NOVA sem `lastUpdateTime` nasce no default do schema
            // (SEM_DADOS): ai "nao sei" e a verdade, ninguem esta sendo
            // rebaixado.
            .create({ data: { ...data, statusMonitoramento: data.statusMonitoramento ?? "SEM_DADOS" } })
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

/**
 * Traduz um site do `/sites/list` para os campos do cadastro.
 *
 * 🔑 `statusMonitoramento` volta **undefined quando nao ha evidencia**, e nao
 * "SEM_DADOS". `lastUpdateTime` e OPCIONAL nesse endpoint (`solaredge.ts:89`) —
 * o frescor de verdade esta em `/site/{id}/overview`, que a importacao nao
 * chama. Escrever SEM_DADOS na ausencia do campo e transformar *ausencia de
 * informacao* em *informacao de ausencia*: foi assim que 249 usinas que estavam
 * gerando passaram a dizer que ninguem sabia nada delas.
 */
function mapSolarEdgeToClient(site: SolarEdgeSite) {
  const uf = extractUf(site.location.state, site.location.city);

  let statusMonitoramento: string | undefined;
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

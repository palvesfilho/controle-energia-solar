import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import {
  getDailyGenerationBatch as getHuaweiDailyBatch,
  getPlantStatusBatch as getHuaweiStatusBatch,
} from "@/lib/huawei";
import {
  getDailyGenerationBatch as getSungrowDailyBatch,
  getPlantStatusBatch as getSungrowStatusBatch,
} from "@/lib/sungrow";
import {
  getDailyGenerationBatch as getFroniusDailyBatch,
  getFlowDataBatch as getFroniusFlowBatch,
} from "@/lib/fronius";
import {
  getDailyGenerationBatch as getSolarEdgeDailyBatch,
  getPlantStatusBatch as getSolarEdgeStatusBatch,
} from "@/lib/solaredge";
import {
  getDailyGenerationBatch as getGrowattDailyBatch,
  getPlantStatusBatch as getGrowattStatusBatch,
} from "@/lib/growatt";
import { esperadaDoDiaDaUsina, performanceRatioMesAtual } from "@/lib/geracao-esperada";
import { PLATAFORMAS_INTRADIA, type PlataformaIntradia } from "@/lib/plataformas-intradia";
import { ehDiaSemDado } from "@/lib/dia-sem-dado";

export const maxDuration = 600;

// A mesma lista do coletor intradiário: uma plataforma que sabemos coletar tem
// que aparecer em TODA rotina, não só na que foi escrita por último. A Growatt
// entrou no coletor e ficou de fora daqui — 78 usinas nunca tiveram geração do
// mês nem status atualizados por este endpoint.
type Plataforma = PlataformaIntradia;

interface ClientRow {
  id: string;
  monitoramentoPlantId: string;
  geracaoMediaEsperada: number | null;
}

interface DailyPoint {
  day: number;
  energyKwh: number;
  irradiacao?: number | null;
}

interface StatusResult {
  isOnline: boolean;
}

interface PlatformSummary {
  clientesTotal: number;
  clientesAtualizados: number;
  logsUpsert: number;
  erro?: string;
}

async function fetchDailyCurrentMonth(
  plataforma: Plataforma,
  plantIds: string[],
  year: number,
  month: number,
): Promise<Map<string, DailyPoint[]>> {
  if (plantIds.length === 0) return new Map();

  switch (plataforma) {
    case "HUAWEI": {
      const raw = await getHuaweiDailyBatch(plantIds, year, month);
      return new Map(
        Array.from(raw.entries()).map(([id, days]) => [
          id,
          days.map((d) => ({ day: d.day, energyKwh: d.energyKwh, irradiacao: d.radiationIntensity })),
        ]),
      );
    }
    case "SUNGROW": {
      const raw = await getSungrowDailyBatch(plantIds, year, month);
      return new Map(
        Array.from(raw.entries()).map(([id, days]) => [
          id,
          days.map((d) => ({ day: d.day, energyKwh: d.energyKwh, irradiacao: d.radiation })),
        ]),
      );
    }
    case "FRONIUS": {
      const raw = await getFroniusDailyBatch(plantIds, year, month);
      return new Map(
        Array.from(raw.entries()).map(([id, days]) => [
          id,
          days.map((d) => ({ day: d.day, energyKwh: d.energyKwh })),
        ]),
      );
    }
    case "SOLAREDGE": {
      const siteIds = plantIds
        .map((id) => parseInt(id))
        .filter((n) => !isNaN(n));
      const raw = await getSolarEdgeDailyBatch(siteIds, year, month);
      return new Map(
        Array.from(raw.entries()).map(([id, days]) => [
          String(id),
          days.map((d) => ({ day: d.day, energyKwh: d.energyKwh })),
        ]),
      );
    }
    case "GROWATT": {
      const raw = await getGrowattDailyBatch(plantIds, year, month);
      return new Map(
        Array.from(raw.entries()).map(([id, days]) => [
          id,
          days.map((d) => ({ day: d.day, energyKwh: d.energyKwh })),
        ]),
      );
    }
  }
}

async function fetchStatus(
  plataforma: Plataforma,
  plantIds: string[],
): Promise<Map<string, StatusResult>> {
  if (plantIds.length === 0) return new Map();

  switch (plataforma) {
    case "HUAWEI": {
      const raw = await getHuaweiStatusBatch(plantIds);
      return new Map(Array.from(raw.entries()).map(([id, s]) => [id, { isOnline: s.isOnline }]));
    }
    case "SUNGROW": {
      const raw = await getSungrowStatusBatch(plantIds);
      return new Map(Array.from(raw.entries()).map(([id, s]) => [id, { isOnline: s.isOnline }]));
    }
    case "FRONIUS": {
      const raw = await getFroniusFlowBatch(plantIds);
      return new Map(Array.from(raw.entries()).map(([id, s]) => [id, { isOnline: s.isOnline }]));
    }
    case "SOLAREDGE": {
      const siteIds = plantIds.map((id) => parseInt(id)).filter((n) => !isNaN(n));
      const raw = await getSolarEdgeStatusBatch(siteIds);
      return new Map(Array.from(raw.entries()).map(([id, s]) => [String(id), { isOnline: s.isOnline }]));
    }
    case "GROWATT": {
      const raw = await getGrowattStatusBatch(plantIds);
      return new Map(Array.from(raw.entries()).map(([id, s]) => [id, { isOnline: s.isOnline }]));
    }
  }
}

async function processPlatform(
  plataforma: Plataforma,
  clients: ClientRow[],
  year: number,
  month: number,
): Promise<PlatformSummary> {
  const summary: PlatformSummary = {
    clientesTotal: clients.length,
    clientesAtualizados: 0,
    logsUpsert: 0,
  };

  if (clients.length === 0) return summary;

  try {
    const plantIds = clients.map((c) => c.monitoramentoPlantId);

    const [dailyMap, statusMap] = await Promise.all([
      fetchDailyCurrentMonth(plataforma, plantIds, year, month),
      fetchStatus(plataforma, plantIds),
    ]);

    for (const client of clients) {
      const daily = dailyMap.get(client.monitoramentoPlantId) ?? [];
      const status = statusMap.get(client.monitoramentoPlantId);

      for (const day of daily) {
        // Growatt: 0,0 kWh é datalogger mudo, não medição. Ver dia-sem-dado.ts.
        // (As outras 4 plataformas seguem como antes — mesma armadilha, mas não
        // medida ainda; mexer nelas sem medir é trocar um erro por outro.)
        if (plataforma === "GROWATT" && ehDiaSemDado(day.energyKwh)) continue;
        const date = new Date(Date.UTC(year, month - 1, day.day, 12, 0, 0));
        await prisma.monitoringLog.upsert({
          where: { clientId_data: { clientId: client.id, data: date } },
          update: {
            // Dado medido vence lançamento manual (origem MANUAL).
            origem: "API",
            geracaoDiaria: day.energyKwh,
            ...(day.irradiacao != null ? { irradiacao: day.irradiacao } : {}),
          },
          create: {
            clientId: client.id,
            data: date,
            geracaoDiaria: day.energyKwh,
            irradiacao: day.irradiacao ?? null,
            geracaoEsperada: esperadaDoDiaDaUsina(client, date),
          },
        });
        summary.logsUpsert++;
      }

      const totalMes = daily.reduce((sum, d) => sum + d.energyKwh, 0);
      const ultimoDia = daily.length > 0 ? daily[daily.length - 1] : null;
      const pr =
        performanceRatioMesAtual(client, totalMes, new Date());

      const temDados = daily.length > 0;
      const novoStatus = status?.isOnline
        ? "ONLINE"
        : temDados
          ? "ALERTA"
          : "SEM_DADOS";

      await prisma.brasilSolarClient.update({
        where: { id: client.id },
        data: {
          geracaoMesAtual: totalMes,
          ultimaGeracao: ultimoDia?.energyKwh ?? undefined,
          ultimaLeitura: new Date(),
          performanceRatio: pr,
          statusMonitoramento: novoStatus,
        },
      });
      summary.clientesAtualizados++;
    }
  } catch (err) {
    summary.erro = err instanceof Error ? err.message : "erro desconhecido";
  }

  return summary;
}

/**
 * POST /api/brasil-solar/sync-all/refresh
 * Atualiza geração do mês atual + status em tempo real para TODAS as
 * plataformas suportadas numa única chamada. A lista vem de
 * `PLATAFORMAS_INTRADIA` de propósito: ligar uma plataforma nova em um lugar só
 * e ela já entra aqui.
 */
export async function POST(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  try {
    const clients = await prisma.brasilSolarClient.findMany({
      where: {
        active: true,
        plataformaMonitoramento: { in: [...PLATAFORMAS_INTRADIA] },
        monitoramentoPlantId: { not: null },
      },
      select: {
        id: true,
        monitoramentoPlantId: true,
        plataformaMonitoramento: true,
        geracaoMediaEsperada: true,
        geracaoAnualEsperada: true,
      },
    });

    if (clients.length === 0) {
      return NextResponse.json(
        { error: "Nenhum cliente com monitoramento configurado. Execute importacao de plantas primeiro." },
        { status: 400 },
      );
    }

    const porPlataforma = new Map<Plataforma, ClientRow[]>(
      PLATAFORMAS_INTRADIA.map((p) => [p, [] as ClientRow[]]),
    );
    for (const c of clients) {
      porPlataforma.get(c.plataformaMonitoramento as Plataforma)?.push({
        id: c.id,
        monitoramentoPlantId: c.monitoramentoPlantId!,
        geracaoMediaEsperada: c.geracaoMediaEsperada,
      });
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const resultados = await Promise.all(
      PLATAFORMAS_INTRADIA.map(async (p) => [
        p,
        await processPlatform(p, porPlataforma.get(p) ?? [], year, month),
      ] as const),
    );

    const totais = {
      clientesAtualizados: resultados.reduce((s, [, r]) => s + r.clientesAtualizados, 0),
      logsUpsert: resultados.reduce((s, [, r]) => s + r.logsUpsert, 0),
    };

    return NextResponse.json({
      message: "Geração e status atualizados para todas as marcas",
      periodo: `${month}/${year}`,
      totais,
      porPlataforma: Object.fromEntries(resultados),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

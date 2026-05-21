import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
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

export const maxDuration = 600;

type Plataforma = "HUAWEI" | "SUNGROW" | "FRONIUS" | "SOLAREDGE";

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
        const date = new Date(year, month - 1, day.day, 12, 0, 0);
        await prisma.monitoringLog.upsert({
          where: { clientId_data: { clientId: client.id, data: date } },
          update: {
            geracaoDiaria: day.energyKwh,
            ...(day.irradiacao != null ? { irradiacao: day.irradiacao } : {}),
          },
          create: {
            clientId: client.id,
            data: date,
            geracaoDiaria: day.energyKwh,
            irradiacao: day.irradiacao ?? null,
            geracaoEsperada: client.geracaoMediaEsperada
              ? client.geracaoMediaEsperada / 30
              : null,
          },
        });
        summary.logsUpsert++;
      }

      const totalMes = daily.reduce((sum, d) => sum + d.energyKwh, 0);
      const ultimoDia = daily.length > 0 ? daily[daily.length - 1] : null;
      const pr =
        client.geracaoMediaEsperada && client.geracaoMediaEsperada > 0
          ? (totalMes / client.geracaoMediaEsperada) * 100
          : null;

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
 * Atualiza geracao do mes atual + status em tempo real para TODAS as plataformas
 * suportadas (Huawei, Sungrow, Fronius, SolarEdge) em uma unica chamada.
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
        plataformaMonitoramento: { in: ["HUAWEI", "SUNGROW", "FRONIUS", "SOLAREDGE"] },
        monitoramentoPlantId: { not: null },
      },
      select: {
        id: true,
        monitoramentoPlantId: true,
        plataformaMonitoramento: true,
        geracaoMediaEsperada: true,
      },
    });

    if (clients.length === 0) {
      return NextResponse.json(
        { error: "Nenhum cliente com monitoramento configurado. Execute importacao de plantas primeiro." },
        { status: 400 },
      );
    }

    const porPlataforma: Record<Plataforma, ClientRow[]> = {
      HUAWEI: [],
      SUNGROW: [],
      FRONIUS: [],
      SOLAREDGE: [],
    };
    for (const c of clients) {
      const p = c.plataformaMonitoramento as Plataforma;
      porPlataforma[p].push({
        id: c.id,
        monitoramentoPlantId: c.monitoramentoPlantId!,
        geracaoMediaEsperada: c.geracaoMediaEsperada,
      });
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const [huawei, sungrow, fronius, solaredge] = await Promise.all([
      processPlatform("HUAWEI", porPlataforma.HUAWEI, year, month),
      processPlatform("SUNGROW", porPlataforma.SUNGROW, year, month),
      processPlatform("FRONIUS", porPlataforma.FRONIUS, year, month),
      processPlatform("SOLAREDGE", porPlataforma.SOLAREDGE, year, month),
    ]);

    const totais = {
      clientesAtualizados:
        huawei.clientesAtualizados +
        sungrow.clientesAtualizados +
        fronius.clientesAtualizados +
        solaredge.clientesAtualizados,
      logsUpsert: huawei.logsUpsert + sungrow.logsUpsert + fronius.logsUpsert + solaredge.logsUpsert,
    };

    return NextResponse.json({
      message: "Geração e status atualizados para todas as marcas",
      periodo: `${month}/${year}`,
      totais,
      porPlataforma: { HUAWEI: huawei, SUNGROW: sungrow, FRONIUS: fronius, SOLAREDGE: solaredge },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { getDailyGeneration as getHuaweiDaily } from "@/lib/huawei";
import { getDailyGeneration as getSungrowDaily } from "@/lib/sungrow";
import { getDailyGeneration as getFroniusDaily } from "@/lib/fronius";
import { getDailyGeneration as getSolarEdgeDaily } from "@/lib/solaredge";
import { getDailyGeneration as getGrowattDaily } from "@/lib/growatt";
import {
  esperadaDoDiaDaUsina,
  esperadaDoMesKwh,
  esperadaMensalBaseKwh,
  performanceRatioMesAtual,
  type FonteGeracaoEsperada,
} from "@/lib/geracao-esperada";

export const maxDuration = 600;

type Plataforma = "HUAWEI" | "SUNGROW" | "FRONIUS" | "SOLAREDGE" | "GROWATT";

interface DailyPoint {
  day: number;
  energyKwh: number;
  irradiacao?: number | null;
}

interface ClientResult {
  nome: string;
  plataforma: Plataforma;
  logs: number;
  meses: number;
  prGeral: number | null;
  erro?: string;
}

const DELAY_BY_PLATFORM: Record<Plataforma, number> = {
  HUAWEI: 300,
  SUNGROW: 300,
  FRONIUS: 200,
  SOLAREDGE: 500,
  // A Growatt recusa a requisição IDÊNTICA repetida em poucos segundos
  // (10012 error_frequently_access). Aqui cada chamada é um mês diferente, mas
  // o retry do próprio mês precisa de folga — medido em 12/08/2026.
  GROWATT: 500,
};

async function fetchDaily(
  plataforma: Plataforma,
  plantId: string,
  year: number,
  month: number,
): Promise<DailyPoint[]> {
  switch (plataforma) {
    case "HUAWEI": {
      const data = await getHuaweiDaily(plantId, year, month);
      return data.map((d) => ({ day: d.day, energyKwh: d.energyKwh, irradiacao: d.radiationIntensity }));
    }
    case "SUNGROW": {
      const data = await getSungrowDaily(plantId, year, month);
      return data.map((d) => ({ day: d.day, energyKwh: d.energyKwh, irradiacao: d.radiation }));
    }
    case "FRONIUS": {
      const data = await getFroniusDaily(plantId, year, month);
      return data.map((d) => ({ day: d.day, energyKwh: d.energyKwh }));
    }
    case "SOLAREDGE": {
      const siteId = parseInt(plantId);
      if (isNaN(siteId)) return [];
      const data = await getSolarEdgeDaily(siteId, year, month);
      return data.map((d) => ({ day: d.day, energyKwh: d.energyKwh }));
    }
    case "GROWATT": {
      const data = await getGrowattDaily(plantId, year, month);
      return data.map((d) => ({ day: d.day, energyKwh: d.energyKwh }));
    }
  }
}

/**
 * POST /api/brasil-solar/sync-all/history
 * Importa historico completo de geracao de TODAS as usinas de TODAS as plataformas
 * suportadas (Huawei, Sungrow, Fronius, SolarEdge, Growatt).
 *
 * Body opcional: { fromYear?: number, plataformas?: Plataforma[] }
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const fromYearOverride: number | undefined = body.fromYear;
  const plataformasFiltro: Plataforma[] = Array.isArray(body.plataformas) && body.plataformas.length > 0
    ? body.plataformas
    : ["HUAWEI", "SUNGROW", "FRONIUS", "SOLAREDGE", "GROWATT"];

  try {
    const clients = await prisma.brasilSolarClient.findMany({
      where: {
        active: true,
        plataformaMonitoramento: { in: plataformasFiltro },
        monitoramentoPlantId: { not: null },
      },
      select: {
        id: true,
        monitoramentoPlantId: true,
        plataformaMonitoramento: true,
        dataInstalacao: true,
        geracaoMediaEsperada: true,
        geracaoAnualEsperada: true,
      },
    });

    if (clients.length === 0) {
      return NextResponse.json(
        { error: "Nenhum cliente encontrado. Execute a importacao de plantas por marca primeiro." },
        { status: 400 },
      );
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    const resultsByPlatform: Record<Plataforma, { clientes: number; logs: number }> = {
      HUAWEI: { clientes: 0, logs: 0 },
      SUNGROW: { clientes: 0, logs: 0 },
      FRONIUS: { clientes: 0, logs: 0 },
      SOLAREDGE: { clientes: 0, logs: 0 },
      GROWATT: { clientes: 0, logs: 0 },
    };
    const clientResults: ClientResult[] = [];
    let totalLogs = 0;

    for (const client of clients) {
      const plataforma = client.plataformaMonitoramento as Plataforma;
      const delay = DELAY_BY_PLATFORM[plataforma];

      let startYear: number;
      let startMonth: number;
      if (fromYearOverride) {
        startYear = fromYearOverride;
        startMonth = 1;
      } else if (client.dataInstalacao) {
        const inst = new Date(client.dataInstalacao);
        startYear = inst.getFullYear();
        startMonth = inst.getMonth() + 1;
      } else {
        startYear = 2020;
        startMonth = 1;
      }

      const months: { year: number; month: number }[] = [];
      let y = startYear;
      let m = startMonth;
      while (y < currentYear || (y === currentYear && m <= currentMonth)) {
        months.push({ year: y, month: m });
        m++;
        if (m > 12) {
          m = 1;
          y++;
        }
      }

      let clientLogs = 0;
      let clientErro: string | undefined;

      for (const { year, month } of months) {
        try {
          const dailyData = await fetchDaily(plataforma, client.monitoramentoPlantId!, year, month);

          for (const day of dailyData) {
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
            clientLogs++;
          }
        } catch (err) {
          if (!clientErro) {
            clientErro = err instanceof Error ? err.message : "erro desconhecido";
          }
        }

        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      const prGeral = await recalcularPR(client.id, client);

      totalLogs += clientLogs;
      resultsByPlatform[plataforma].clientes++;
      resultsByPlatform[plataforma].logs += clientLogs;

      clientResults.push({
        nome: client.monitoramentoPlantId!,
        plataforma,
        logs: clientLogs,
        meses: months.length,
        prGeral,
        erro: clientErro,
      });
    }

    return NextResponse.json({
      message: "HistÃ³rico importado com sucesso para todas as marcas",
      clientesProcessados: clients.length,
      totalLogs,
      porPlataforma: resultsByPlatform,
      detalhes: clientResults,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function recalcularPR(
  clientId: string,
  esperada: FonteGeracaoEsperada,
): Promise<number | null> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);

  const mesAtualAgg = await prisma.monitoringLog.aggregate({
    where: { clientId, data: { gte: startOfMonth } },
    _sum: { geracaoDiaria: true },
  });
  const geracaoMesAtual = mesAtualAgg._sum.geracaoDiaria ?? 0;

  const ultimoLog = await prisma.monitoringLog.findFirst({
    where: { clientId, geracaoDiaria: { gt: 0 } },
    orderBy: { data: "desc" },
    select: { geracaoDiaria: true, data: true },
  });

  const prMes = performanceRatioMesAtual(esperada, geracaoMesAtual, now);

  const mesesComDados = await prisma.monitoringLog.findMany({
    where: { clientId, geracaoDiaria: { gt: 0 } },
    select: { data: true },
  });
  const mesesDistintos = new Set(
    mesesComDados.map((l) => {
      const d = new Date(l.data);
      return `${d.getFullYear()}-${d.getMonth()}`;
    }),
  );

  const allLogs = await prisma.monitoringLog.aggregate({
    where: { clientId, geracaoDiaria: { gt: 0 } },
    _sum: { geracaoDiaria: true },
  });

  // O esperado do período acumulado soma o prognóstico de CADA mês com dados,
  // cada um com seu fator sazonal — uma usina que só tem log de maio a agosto
  // não deve ser cobrada pela média do ano.
  const baseMensal = esperadaMensalBaseKwh(esperada);
  let prGeral: number | null = null;
  if (baseMensal > 0 && mesesDistintos.size > 0) {
    const totalGerado = allLogs._sum.geracaoDiaria ?? 0;
    const totalEsperado = [...mesesDistintos].reduce(
      (s, k) => s + esperadaDoMesKwh(baseMensal, Number(k.split("-")[1]) + 1),
      0,
    );
    prGeral = totalEsperado > 0 ? (totalGerado / totalEsperado) * 100 : null;
  }

  await prisma.brasilSolarClient.update({
    where: { id: clientId },
    data: {
      geracaoMesAtual,
      ultimaGeracao: ultimoLog?.geracaoDiaria ?? null,
      ultimaLeitura: ultimoLog?.data ?? null,
      performanceRatio: prMes ?? prGeral,
      statusMonitoramento: ultimoLog ? "ONLINE" : "SEM_DADOS",
    },
  });

  return prGeral;
}

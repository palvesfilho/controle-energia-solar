import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { getDailyGeneration } from "@/lib/huawei";

// Aumentar timeout para operacao longa (10 minutos)
export const maxDuration = 600;

/**
 * POST /api/brasil-solar/sync-huawei/history
 * Importa historico completo de geracao de TODAS as usinas Huawei.
 * Percorre mes a mes desde a data de instalacao (ou fromYear) ate o mes atual.
 * Ao final, recalcula o Performance Ratio de cada usina.
 *
 * Body opcional: { fromYear?: number }
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const fromYearOverride: number | undefined = body.fromYear;

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
        dataInstalacao: true,
        geracaoMediaEsperada: true,
        potenciaInstalada: true,
      },
    });

    if (clients.length === 0) {
      return NextResponse.json(
        { error: "Nenhum cliente Huawei encontrado. Execute a importacao de plantas primeiro." },
        { status: 400 },
      );
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    let totalLogs = 0;
    let totalClients = 0;
    let totalErrors = 0;
    const clientResults: { nome: string; logs: number; meses: number; prGeral: number | null }[] = [];

    for (const client of clients) {
      // Determinar mes/ano de inicio
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
        // Sem data de instalacao, buscar desde 2020
        startYear = 2020;
        startMonth = 1;
      }

      // Gerar lista de meses a buscar
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

      for (const { year, month } of months) {
        try {
          const dailyData = await getDailyGeneration(client.monitoramentoPlantId!, year, month);

          for (const day of dailyData) {
            const date = new Date(year, month - 1, day.day, 12, 0, 0);

            await prisma.monitoringLog.upsert({
              where: {
                clientId_data: { clientId: client.id, data: date },
              },
              update: {
                geracaoDiaria: day.energyKwh,
                irradiacao: day.radiationIntensity,
              },
              create: {
                clientId: client.id,
                data: date,
                geracaoDiaria: day.energyKwh,
                irradiacao: day.radiationIntensity,
                geracaoEsperada: client.geracaoMediaEsperada
                  ? client.geracaoMediaEsperada / 30
                  : null,
              },
            });
            clientLogs++;
          }
        } catch {
          // Mes sem dados - segue
        }

        // Delay entre meses para respeitar rate limiting
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      // Recalcular Performance Ratio geral da usina
      const prGeral = await recalcularPR(client.id, client.geracaoMediaEsperada);

      totalLogs += clientLogs;
      totalClients++;
      clientResults.push({
        nome: client.monitoramentoPlantId!,
        logs: clientLogs,
        meses: months.length,
        prGeral,
      });
    }

    return NextResponse.json({
      message: "Historico Huawei importado com sucesso",
      clientesProcessados: totalClients,
      totalLogs,
      totalErrors,
      detalhes: clientResults,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Recalcula o Performance Ratio de uma usina com base em todo o historico.
 * PR = (geracao real total / geracao esperada total) * 100
 *
 * Tambem atualiza geracaoMesAtual e ultimaGeracao.
 */
async function recalcularPR(clientId: string, geracaoMediaEsperada: number | null): Promise<number | null> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);

  // Geracao do mes atual
  const mesAtualAgg = await prisma.monitoringLog.aggregate({
    where: { clientId, data: { gte: startOfMonth } },
    _sum: { geracaoDiaria: true },
  });
  const geracaoMesAtual = mesAtualAgg._sum.geracaoDiaria ?? 0;

  // Ultima geracao (dia mais recente)
  const ultimoLog = await prisma.monitoringLog.findFirst({
    where: { clientId, geracaoDiaria: { gt: 0 } },
    orderBy: { data: "desc" },
    select: { geracaoDiaria: true, data: true },
  });

  // PR do mes atual
  const prMes = geracaoMediaEsperada && geracaoMediaEsperada > 0
    ? (geracaoMesAtual / geracaoMediaEsperada) * 100
    : null;

  // Contar total de meses com dados para calcular PR geral
  const allLogs = await prisma.monitoringLog.aggregate({
    where: { clientId, geracaoDiaria: { gt: 0 } },
    _sum: { geracaoDiaria: true },
    _count: true,
  });

  // Numero de meses distintos com dados
  const mesesComDados = await prisma.monitoringLog.findMany({
    where: { clientId, geracaoDiaria: { gt: 0 } },
    select: { data: true },
  });

  const mesesDistintos = new Set(
    mesesComDados.map((l) => {
      const d = new Date(l.data);
      return `${d.getFullYear()}-${d.getMonth()}`;
    })
  ).size;

  // PR geral = total gerado / (esperado mensal * num meses)
  let prGeral: number | null = null;
  if (geracaoMediaEsperada && geracaoMediaEsperada > 0 && mesesDistintos > 0) {
    const totalGerado = allLogs._sum.geracaoDiaria ?? 0;
    const totalEsperado = geracaoMediaEsperada * mesesDistintos;
    prGeral = (totalGerado / totalEsperado) * 100;
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

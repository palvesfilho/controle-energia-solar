import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { getDailyGeneration, getPlantStatus } from "@/lib/growatt";
import { esperadaDoDiaDaUsina, performanceRatioMesAtual } from "@/lib/geracao-esperada";

/**
 * POST /api/brasil-solar/[id]/growatt-sync
 * Sincroniza a geração Growatt de um cliente. Últimos 12 meses de geração
 * diária (`/v1/plant/energy`, fatiado em janelas de 7 dias pelo adapter) +
 * status atual.
 *
 * ⚠️ A Growatt recusa a requisição IDÊNTICA repetida em poucos segundos
 * (`10012 error_frequently_access`) — medido em 12/08/2026. Cada mês aqui é uma
 * chamada diferente, então a varredura passa; mas um mês que caiu no 10012 é
 * CONTADO e devolvido em `mesesLimitados`, nunca confundido com "usina sem
 * geração". Anomalia se sinaliza, não se silencia.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const { id } = await params;

  const client = await prisma.brasilSolarClient.findUnique({
    where: { id },
    select: {
      id: true,
      monitoramentoPlantId: true,
      plataformaMonitoramento: true,
      geracaoMediaEsperada: true,
      geracaoAnualEsperada: true,
    },
  });

  if (!client) {
    return NextResponse.json({ error: "Cliente nao encontrado" }, { status: 404 });
  }

  if (client.plataformaMonitoramento !== "GROWATT" || !client.monitoramentoPlantId) {
    return NextResponse.json(
      { error: "Cliente nao possui monitoramento Growatt configurado" },
      { status: 400 },
    );
  }

  const plantId = client.monitoramentoPlantId;

  try {
    const now = new Date();
    const months: { year: number; month: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
    }

    let logsUpserted = 0;
    let mesesComDado = 0;
    const mesesLimitados: string[] = [];
    const mesesComErro: string[] = [];

    for (const { year, month } of months) {
      const rotulo = `${String(month).padStart(2, "0")}/${year}`;
      try {
        const dailyData = await getDailyGeneration(plantId, year, month);
        if (dailyData.length > 0) mesesComDado++;

        for (const day of dailyData) {
          // Data-calendário: meio-dia UTC, senão o fuso empurra o dia.
          const date = new Date(Date.UTC(year, month - 1, day.day, 12, 0, 0));

          await prisma.monitoringLog.upsert({
            where: { clientId_data: { clientId: id, data: date } },
            update: {
              // Dado medido vence lançamento manual (origem MANUAL).
              origem: "API",
              geracaoDiaria: day.energyKwh,
            },
            create: {
              clientId: id,
              data: date,
              geracaoDiaria: day.energyKwh,
              geracaoEsperada: esperadaDoDiaDaUsina(client, date),
            },
          });
          logsUpserted++;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // 10012 = a Growatt recusou por frequência. NÃO é "mês sem geração":
        // o mês simplesmente não foi lido e entra na próxima rodada.
        if (msg.includes("10012")) mesesLimitados.push(rotulo);
        else mesesComErro.push(rotulo);
      }
    }

    // Status atual (best-effort: falhar aqui não invalida a geração já gravada).
    let isOnline = false;
    let currentPowerKw = 0;
    let dayEnergyKwh = 0;
    try {
      const status = await getPlantStatus(plantId);
      currentPowerKw = status.currentPowerKw;
      dayEnergyKwh = status.dayPowerKwh;
      isOnline = status.isOnline;
    } catch {
      // sem status: segue com o que a geração diária disse
    }

    // KPIs desnormalizados da lista
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [monthAgg, last30Logs] = await Promise.all([
      prisma.monitoringLog.aggregate({
        where: { clientId: id, data: { gte: startOfMonth } },
        _sum: { geracaoDiaria: true },
      }),
      prisma.monitoringLog.findMany({
        where: { clientId: id, data: { gte: thirtyDaysAgo } },
        orderBy: { data: "desc" },
        select: { geracaoDiaria: true, picoMaximo: true },
      }),
    ]);

    const geracaoMes = monthAgg._sum.geracaoDiaria ?? 0;
    const pr = performanceRatioMesAtual(client, geracaoMes, new Date());
    const ultimaGeracao = last30Logs.length > 0 ? last30Logs[0].geracaoDiaria : null;

    await prisma.brasilSolarClient.update({
      where: { id },
      data: {
        geracaoMesAtual: geracaoMes,
        ultimaGeracao,
        ultimaLeitura: new Date(),
        performanceRatio: pr,
        statusMonitoramento: isOnline
          ? "ONLINE"
          : last30Logs.length > 0
            ? "ALERTA"
            : "SEM_DADOS",
      },
    });

    // Zero registro tem causas diferentes — dizer qual, em vez de "0 registros".
    let diagnostico: { codigo: string; mensagem: string } | undefined;
    if (logsUpserted === 0) {
      if (mesesLimitados.length > 0) {
        diagnostico = {
          codigo: "GROWATT_LIMITE",
          mensagem:
            `A Growatt recusou a consulta por frequência (10012) em ${mesesLimitados.length} ` +
            `mês(es). Não é falta de geração — espere alguns segundos e tente de novo.`,
        };
      } else if (mesesComErro.length > 0) {
        diagnostico = {
          codigo: "GROWATT_ERRO",
          mensagem: `A Growatt respondeu com erro em ${mesesComErro.length} mês(es): ${mesesComErro.join(", ")}.`,
        };
      } else {
        diagnostico = {
          codigo: "GROWATT_SEM_GERACAO",
          mensagem:
            "A Growatt respondeu, mas não há geração registrada nos últimos 12 meses " +
            "(datalogger parado ou usina sem inversor vinculado).",
        };
      }
    }

    return NextResponse.json({
      message: "Sincronizacao Growatt concluida",
      logsUpserted,
      mesesComDado,
      mesesLimitados,
      mesesComErro,
      geracaoMesAtual: geracaoMes,
      performanceRatio: pr,
      isOnline,
      currentPowerKw,
      dayEnergyKwh,
      ...(diagnostico ? { diagnostico } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

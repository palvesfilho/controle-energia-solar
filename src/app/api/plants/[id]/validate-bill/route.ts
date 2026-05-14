import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import {
  getMonthlyTotal as froniusMonthlyTotal,
  getRangeTotal as froniusRangeTotal,
} from "@/lib/fronius";
import {
  getMonthlyTotal as huaweiMonthlyTotal,
  getRangeTotal as huaweiRangeTotal,
} from "@/lib/huawei";
import {
  getMonthlyTotal as sungrowMonthlyTotal,
  getRangeTotal as sungrowRangeTotal,
} from "@/lib/sungrow";
import {
  getMonthlyTotal as solaredgeMonthlyTotal,
  getRangeTotal as solaredgeRangeTotal,
} from "@/lib/solaredge";

const TOLERANCE_PCT = 2;

/**
 * GET /api/plants/[id]/validate-bill?ano=2026&mes=4
 *
 * Compara o total injetado pelos inversores das usinas monitoradas vinculadas
 * a esta Plant com o valor de "Energia Injetada" lido do medidor (ConsumerBill).
 *
 * A janela de soma do inversor segue o **ciclo de leitura da distribuidora**
 * (dataLeituraAnterior → dataLeituraAtual), não o mês calendário. Quando esses
 * campos não estão preenchidos (faturas antigas), cai no mês calendário e
 * sinaliza no campo `janela.fonte`.
 *
 * Tolerância: 2%.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const ano = Number(searchParams.get("ano"));
  const mes = Number(searchParams.get("mes"));

  if (!Number.isInteger(ano) || !Number.isInteger(mes) || mes < 1 || mes > 12) {
    return NextResponse.json(
      { error: "Parâmetros ano e mes (1-12) são obrigatórios" },
      { status: 400 },
    );
  }

  const plant = await prisma.plant.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!plant) {
    return NextResponse.json({ error: "Plant não encontrada" }, { status: 404 });
  }

  const [bill, monitoringClients] = await Promise.all([
    prisma.consumerBill.findFirst({
      where: { plantId: id, anoReferencia: ano, mesReferencia: mes },
      orderBy: { syncedAt: "desc" },
      select: {
        id: true,
        energiaInjetadaMedidorKwh: true,
        leituraInjetadaAnterior: true,
        leituraInjetadaAtual: true,
        constanteMedidorInjetada: true,
        dataLeituraAnterior: true,
        dataLeituraAtual: true,
        diasFaturamento: true,
        syncedAt: true,
      },
    }),
    prisma.brasilSolarClient.findMany({
      where: { plantId: id, active: true },
      select: {
        id: true,
        nome: true,
        plataformaMonitoramento: true,
        monitoramentoPlantId: true,
        potenciaInstalada: true,
      },
    }),
  ]);

  // Define a janela de comparação:
  //  - Preferida: ciclo de leitura da fatura (dataLeituraAnterior → dataLeituraAtual).
  //  - Fallback: mês calendário, marcando fonte = "MES_CALENDARIO".
  let janelaInicio: Date | null = bill?.dataLeituraAnterior ?? null;
  let janelaFim: Date | null = bill?.dataLeituraAtual ?? null;
  let janelaFonte: "CICLO_LEITURA" | "MES_CALENDARIO" = "CICLO_LEITURA";
  if (!janelaInicio || !janelaFim) {
    janelaFonte = "MES_CALENDARIO";
    janelaInicio = new Date(Date.UTC(ano, mes - 1, 1));
    janelaFim = new Date(Date.UTC(ano, mes, 1)); // primeiro dia do mês seguinte
  }

  const inverters = await Promise.all(
    monitoringClients.map(async (c) => {
      const platform = c.plataformaMonitoramento?.toUpperCase() ?? null;
      const baseInfo = {
        clientId: c.id,
        nome: c.nome,
        platform,
        monitoringId: c.monitoramentoPlantId,
        potenciaInstalada: c.potenciaInstalada,
      };
      if (!platform || !c.monitoramentoPlantId) {
        return { ...baseInfo, totalKwh: null as number | null, days: null as number | null, error: "Monitoramento não configurado" };
      }

      try {
        if (platform === "FRONIUS") {
          const r = janelaFonte === "CICLO_LEITURA"
            ? await froniusRangeTotal(c.monitoramentoPlantId, janelaInicio!, janelaFim!)
            : await froniusMonthlyTotal(c.monitoramentoPlantId, ano, mes);
          return { ...baseInfo, totalKwh: r.totalKwh, days: r.days, error: null as string | null };
        }
        if (platform === "HUAWEI") {
          const r = janelaFonte === "CICLO_LEITURA"
            ? await huaweiRangeTotal(c.monitoramentoPlantId, janelaInicio!, janelaFim!)
            : await huaweiMonthlyTotal(c.monitoramentoPlantId, ano, mes);
          return { ...baseInfo, totalKwh: r.totalKwh, days: r.days, error: null as string | null };
        }
        if (platform === "SUNGROW") {
          const r = janelaFonte === "CICLO_LEITURA"
            ? await sungrowRangeTotal(c.monitoramentoPlantId, janelaInicio!, janelaFim!)
            : await sungrowMonthlyTotal(c.monitoramentoPlantId, ano, mes);
          return { ...baseInfo, totalKwh: r.totalKwh, days: r.days, error: null as string | null };
        }
        if (platform === "SOLAREDGE") {
          const siteId = parseInt(c.monitoramentoPlantId, 10);
          if (Number.isNaN(siteId)) {
            return { ...baseInfo, totalKwh: null, days: null, error: "Site ID SolarEdge inválido (não numérico)" };
          }
          const r = janelaFonte === "CICLO_LEITURA"
            ? await solaredgeRangeTotal(siteId, janelaInicio!, janelaFim!)
            : await solaredgeMonthlyTotal(siteId, ano, mes);
          return { ...baseInfo, totalKwh: r.totalKwh, days: r.days, error: null as string | null };
        }
        return { ...baseInfo, totalKwh: null, days: null, error: `Plataforma '${platform}' não suportada` };
      } catch (e) {
        return { ...baseInfo, totalKwh: null, days: null, error: e instanceof Error ? e.message : "Erro desconhecido" };
      }
    }),
  );

  const totalInversoresKwh = inverters.reduce((sum, i) => sum + (i.totalKwh ?? 0), 0);
  const leituraMedidorKwh = bill?.energiaInjetadaMedidorKwh ?? null;

  let diffKwh: number | null = null;
  let diffPct: number | null = null;
  let status: "OK" | "ALERTA" | "SEM_FATURA" | "SEM_INVERSOR" = "SEM_INVERSOR";

  if (leituraMedidorKwh == null) {
    status = "SEM_FATURA";
  } else if (inverters.length === 0 || inverters.every((i) => i.totalKwh == null)) {
    status = "SEM_INVERSOR";
  } else {
    diffKwh = totalInversoresKwh - leituraMedidorKwh;
    diffPct = leituraMedidorKwh > 0 ? (diffKwh / leituraMedidorKwh) * 100 : null;
    status = diffPct != null && Math.abs(diffPct) <= TOLERANCE_PCT ? "OK" : "ALERTA";
  }

  // Persiste o resultado na fatura — assim a UI recupera o estado ao reabrir
  // a tela sem precisar revalidar.
  if (bill?.id) {
    await prisma.consumerBill.update({
      where: { id: bill.id },
      data: {
        validacaoStatus: status,
        validacaoDiffPct: diffPct,
        validacaoEm: new Date(),
      },
    });
  }

  return NextResponse.json({
    plant: { id: plant.id, name: plant.name },
    periodo: { ano, mes },
    janela: {
      inicio: janelaInicio,
      fim: janelaFim,
      fonte: janelaFonte, // "CICLO_LEITURA" (correto) ou "MES_CALENDARIO" (fallback)
      diasFaturamento: bill?.diasFaturamento ?? null,
    },
    fatura: bill
      ? {
          id: bill.id,
          energiaInjetadaMedidorKwh: bill.energiaInjetadaMedidorKwh,
          leituraAnterior: bill.leituraInjetadaAnterior,
          leituraAtual: bill.leituraInjetadaAtual,
          constante: bill.constanteMedidorInjetada,
          dataLeituraAnterior: bill.dataLeituraAnterior,
          dataLeituraAtual: bill.dataLeituraAtual,
          syncedAt: bill.syncedAt,
        }
      : null,
    inversores: inverters,
    totais: {
      inversoresKwh: totalInversoresKwh,
      medidorKwh: leituraMedidorKwh,
      diffKwh,
      diffPct,
      tolerancePct: TOLERANCE_PCT,
      status,
    },
  });
}

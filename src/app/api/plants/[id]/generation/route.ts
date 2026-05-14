import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { getDailyGeneration as froniusDaily, getYearlyMonthlyBreakdown as froniusMonthly } from "@/lib/fronius";
import { getDailyGeneration as huaweiDaily, getMonthlyGeneration as huaweiMonthly } from "@/lib/huawei";
import { getDailyGeneration as sungrowDaily, getMonthlyGeneration as sungrowMonthly } from "@/lib/sungrow";
import { getDailyGeneration as solaredgeDaily, getMonthlyGeneration as solaredgeMonthly } from "@/lib/solaredge";

type Platform = "FRONIUS" | "HUAWEI" | "SUNGROW" | "SOLAREDGE";

interface Inverter {
  id: string;
  platform: Platform;
  monitoringId: string;
}

async function dailyForInverter(inv: Inverter, ano: number, mes: number): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  try {
    if (inv.platform === "FRONIUS") {
      const r = await froniusDaily(inv.monitoringId, ano, mes);
      r.forEach((d) => map.set(d.day, (map.get(d.day) ?? 0) + d.energyKwh));
    } else if (inv.platform === "HUAWEI") {
      const r = await huaweiDaily(inv.monitoringId, ano, mes);
      r.forEach((d) => map.set(d.day, (map.get(d.day) ?? 0) + d.energyKwh));
    } else if (inv.platform === "SUNGROW") {
      const r = await sungrowDaily(inv.monitoringId, ano, mes);
      r.forEach((d) => map.set(d.day, (map.get(d.day) ?? 0) + d.energyKwh));
    } else if (inv.platform === "SOLAREDGE") {
      const siteId = parseInt(inv.monitoringId, 10);
      if (!Number.isNaN(siteId)) {
        const r = await solaredgeDaily(siteId, ano, mes);
        r.forEach((d) => map.set(d.day, (map.get(d.day) ?? 0) + d.energyKwh));
      }
    }
  } catch {
    // silencia erros de rede/plataforma; a soma agregada continua
  }
  return map;
}

async function monthlyForInverter(inv: Inverter, ano: number): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  try {
    if (inv.platform === "FRONIUS") {
      const r = await froniusMonthly(inv.monitoringId, ano);
      r.forEach((m) => map.set(m.month, (map.get(m.month) ?? 0) + m.totalKwh));
    } else if (inv.platform === "HUAWEI") {
      const r = await huaweiMonthly(inv.monitoringId, ano);
      r.forEach((m) => map.set(m.month, (map.get(m.month) ?? 0) + m.totalKwh));
    } else if (inv.platform === "SUNGROW") {
      const r = await sungrowMonthly(inv.monitoringId, ano);
      r.forEach((m) => map.set(m.month, (map.get(m.month) ?? 0) + m.totalKwh));
    } else if (inv.platform === "SOLAREDGE") {
      const siteId = parseInt(inv.monitoringId, 10);
      if (!Number.isNaN(siteId)) {
        const r = await solaredgeMonthly(siteId, ano);
        r.forEach((m) => map.set(m.month, (map.get(m.month) ?? 0) + m.totalKwh));
      }
    }
  } catch {
    // ignora falhas para não quebrar o agregado
  }
  return map;
}

function mergeMaps(maps: Map<number, number>[]): Map<number, number> {
  const merged = new Map<number, number>();
  for (const m of maps) {
    for (const [k, v] of m.entries()) {
      merged.set(k, (merged.get(k) ?? 0) + v);
    }
  }
  return merged;
}

const MESES_LABEL = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const view = searchParams.get("view");

  if (view !== "diario" && view !== "mensal" && view !== "anual") {
    return NextResponse.json(
      { error: "Parâmetro 'view' deve ser 'diario', 'mensal' ou 'anual'" },
      { status: 400 },
    );
  }

  const clients = await prisma.brasilSolarClient.findMany({
    where: { plantId: id, active: true },
    select: { id: true, plataformaMonitoramento: true, monitoramentoPlantId: true },
  });

  const inverters: Inverter[] = clients
    .filter((c) => !!c.monitoramentoPlantId && !!c.plataformaMonitoramento)
    .map((c) => ({
      id: c.id,
      platform: c.plataformaMonitoramento!.toUpperCase() as Platform,
      monitoringId: c.monitoramentoPlantId!,
    }))
    .filter((i) => ["FRONIUS", "HUAWEI", "SUNGROW", "SOLAREDGE"].includes(i.platform));

  if (inverters.length === 0) {
    return NextResponse.json({ data: [], empty: true, reason: "SEM_INVERSOR" });
  }

  if (view === "diario") {
    const ano = Number(searchParams.get("ano"));
    const mes = Number(searchParams.get("mes"));
    if (!Number.isInteger(ano) || !Number.isInteger(mes) || mes < 1 || mes > 12) {
      return NextResponse.json(
        { error: "Parâmetros 'ano' e 'mes' (1-12) são obrigatórios para view=diario" },
        { status: 400 },
      );
    }

    const perInv = await Promise.all(inverters.map((inv) => dailyForInverter(inv, ano, mes)));
    const merged = mergeMaps(perInv);
    const diasNoMes = new Date(ano, mes, 0).getDate();
    const data = Array.from({ length: diasNoMes }, (_, i) => {
      const dia = i + 1;
      return {
        dia: String(dia).padStart(2, "0"),
        geracao: Math.round((merged.get(dia) ?? 0) * 100) / 100,
      };
    });
    return NextResponse.json({ data, empty: merged.size === 0 });
  }

  if (view === "mensal") {
    const ano = Number(searchParams.get("ano"));
    if (!Number.isInteger(ano)) {
      return NextResponse.json(
        { error: "Parâmetro 'ano' é obrigatório para view=mensal" },
        { status: 400 },
      );
    }

    const perInv = await Promise.all(inverters.map((inv) => monthlyForInverter(inv, ano)));
    const merged = mergeMaps(perInv);
    const data = MESES_LABEL.map((label, i) => ({
      mes: label,
      mesNum: i + 1,
      geracao: Math.round(merged.get(i + 1) ?? 0),
    }));
    return NextResponse.json({ data, empty: merged.size === 0 });
  }

  const anoAtual = new Date().getFullYear();
  const anos = [anoAtual - 4, anoAtual - 3, anoAtual - 2, anoAtual - 1, anoAtual];

  const perYear = await Promise.all(
    anos.map(async (ano) => {
      const perInv = await Promise.all(inverters.map((inv) => monthlyForInverter(inv, ano)));
      const merged = mergeMaps(perInv);
      let total = 0;
      for (const v of merged.values()) total += v;
      return { ano: String(ano), geracao: Math.round(total) };
    }),
  );

  return NextResponse.json({
    data: perYear,
    empty: perYear.every((y) => y.geracao === 0),
  });
}

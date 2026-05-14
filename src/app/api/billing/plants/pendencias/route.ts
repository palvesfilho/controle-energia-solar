import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";

/**
 * GET /api/billing/plants/pendencias
 * Lista usinas ativas com indicador do próximo mês pendente de pagamento ao
 * investidor (mais antigo com payable em status ≠ PAGO) e contagem total de
 * meses pendentes. Alimenta a landing /admin/faturamento/usinas.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [plants, payables] = await Promise.all([
    prisma.plant.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        numeroUsina: true,
        investors: {
          select: {
            investor: {
              select: {
                id: true,
                user: { select: { name: true, email: true } },
              },
            },
          },
        },
      },
    }),
    prisma.investorPayable.findMany({
      where: { status: { not: "PAGO" } },
      select: {
        plantId: true,
        anoReferencia: true,
        mesReferencia: true,
        valorLiquido: true,
        valorRealPago: true,
      },
    }),
  ]);

  type Pendencia = {
    plantId: string;
    name: string;
    numeroUsina: string | null;
    investorNames: string[];
    proximoMes: { ano: number; mes: number } | null;
    qtdPendentes: number;
    totalDevidoPendente: number;
  };

  const byPlant = new Map<string, {
    proximoMes: { ano: number; mes: number } | null;
    mesesSet: Set<string>;
    totalDevido: number;
  }>();

  for (const p of payables) {
    let acc = byPlant.get(p.plantId);
    if (!acc) {
      acc = { proximoMes: null, mesesSet: new Set(), totalDevido: 0 };
      byPlant.set(p.plantId, acc);
    }
    const mesKey = `${p.anoReferencia}-${String(p.mesReferencia).padStart(2, "0")}`;
    acc.mesesSet.add(mesKey);
    if (
      !acc.proximoMes ||
      p.anoReferencia < acc.proximoMes.ano ||
      (p.anoReferencia === acc.proximoMes.ano && p.mesReferencia < acc.proximoMes.mes)
    ) {
      acc.proximoMes = { ano: p.anoReferencia, mes: p.mesReferencia };
    }
    const restante = p.valorLiquido - (p.valorRealPago ?? 0);
    if (restante > 0) acc.totalDevido += restante;
  }

  const result: Pendencia[] = plants.map((p) => {
    const agg = byPlant.get(p.id);
    const investorNames = p.investors
      .map((ip) => ip.investor.user?.name ?? ip.investor.user?.email ?? "(sem nome)")
      .sort();
    return {
      plantId: p.id,
      name: p.name,
      numeroUsina: p.numeroUsina,
      investorNames,
      proximoMes: agg?.proximoMes ?? null,
      qtdPendentes: agg?.mesesSet.size ?? 0,
      totalDevidoPendente: agg?.totalDevido ?? 0,
    };
  });

  // Ordena: usinas com pendência primeiro (mais antiga no topo), depois sem pendência por nome.
  result.sort((a, b) => {
    if (a.proximoMes && !b.proximoMes) return -1;
    if (!a.proximoMes && b.proximoMes) return 1;
    if (a.proximoMes && b.proximoMes) {
      if (a.proximoMes.ano !== b.proximoMes.ano) return a.proximoMes.ano - b.proximoMes.ano;
      if (a.proximoMes.mes !== b.proximoMes.mes) return a.proximoMes.mes - b.proximoMes.mes;
    }
    return (a.numeroUsina ?? a.name).localeCompare(b.numeroUsina ?? b.name);
  });

  return NextResponse.json(result);
}

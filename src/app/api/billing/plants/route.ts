import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";

/**
 * GET /api/billing/plants?ano=2026&mes=4
 *   Lista faturamentos de usinas do mês.
 *   Cria placeholders (em memória) para usinas sem faturamento ainda.
 *
 * GET /api/billing/plants?meses=1
 *   Lista os meses distintos que possuem faturamento.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const listMeses = searchParams.get("meses");

  if (listMeses) {
    // Retorna meses distintos a partir de PlantBilling
    const rows = await prisma.plantBilling.findMany({
      select: { ano: true, mes: true },
      orderBy: [{ ano: "desc" }, { mes: "desc" }],
    });
    const seen = new Set<string>();
    const meses = rows
      .filter((r) => {
        const key = `${r.ano}-${r.mes}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((r) => ({ ano: r.ano, mes: r.mes }));
    return NextResponse.json(meses);
  }

  const ano = Number(searchParams.get("ano"));
  const mes = Number(searchParams.get("mes"));
  if (!ano || !mes) {
    return NextResponse.json({ error: "ano e mes são obrigatórios" }, { status: 400 });
  }

  const [plants, billings, ucGeradoraBills] = await Promise.all([
    prisma.plant.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        numeroUsina: true,
        cpfCnpj: true,
        distribuidora: true,
      },
    }),
    prisma.plantBilling.findMany({ where: { ano, mes } }),
    // Fatura da UC geradora pra recuperar a última validação salva.
    prisma.consumerBill.findMany({
      where: {
        consumerUnitId: null,
        anoReferencia: ano,
        mesReferencia: mes,
      },
      orderBy: { syncedAt: "desc" },
      select: {
        plantId: true,
        validacaoStatus: true,
        validacaoDiffPct: true,
        validacaoEm: true,
      },
    }),
  ]);

  const billingByPlant = new Map(billings.map((b) => [b.plantId, b]));
  // Pega a fatura mais recente por plant (já vem ordenada por syncedAt desc).
  const ucBillByPlant = new Map<string, (typeof ucGeradoraBills)[number]>();
  for (const ub of ucGeradoraBills) {
    if (ub.plantId && !ucBillByPlant.has(ub.plantId)) {
      ucBillByPlant.set(ub.plantId, ub);
    }
  }

  const data = plants.map((p) => {
    const b = billingByPlant.get(p.id);
    const ub = ucBillByPlant.get(p.id);
    return {
      plant: p,
      billing: b ?? null,
      status: b?.status ?? "PENDENTE",
      validacao: ub
        ? {
            status: ub.validacaoStatus,
            diffPct: ub.validacaoDiffPct,
            em: ub.validacaoEm,
          }
        : null,
    };
  });

  return NextResponse.json(data);
}

/**
 * POST /api/billing/plants
 *   Cria (ou recupera) o registro de faturamento para uma usina/mês.
 *   Body: { plantId, ano, mes }
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { plantId, ano, mes } = body;
  if (!plantId || !ano || !mes) {
    return NextResponse.json({ error: "plantId, ano e mes são obrigatórios" }, { status: 400 });
  }

  const billing = await prisma.plantBilling.upsert({
    where: { plantId_ano_mes: { plantId, ano: Number(ano), mes: Number(mes) } },
    create: { plantId, ano: Number(ano), mes: Number(mes), status: "PENDENTE" },
    update: {},
  });

  return NextResponse.json(billing);
}

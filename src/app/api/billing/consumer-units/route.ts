import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";

/**
 * GET /api/billing/consumer-units?ano=2026&mes=4  → lista do mês
 * GET /api/billing/consumer-units?meses=1         → lista de meses distintos
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const listMeses = searchParams.get("meses");

  if (listMeses) {
    const rows = await prisma.consumerUnitBilling.findMany({
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

  const [units, billings, consumerBills] = await Promise.all([
    prisma.consumerUnit.findMany({
      where: { active: true },
      orderBy: { nome: "asc" },
      select: {
        id: true,
        nome: true,
        codigoUc: true,
        cpfCnpj: true,
        distribuidora: true,
        consumer: { select: { id: true, name: true } },
      },
    }),
    prisma.consumerUnitBilling.findMany({ where: { ano, mes } }),
    prisma.consumerBill.findMany({
      where: { anoReferencia: ano, mesReferencia: mes },
      select: { consumerUnitId: true },
    }),
  ]);

  const billingByUc = new Map(billings.map((b) => [b.consumerUnitId, b]));
  const ucsComFatura = new Set(
    consumerBills
      .map((b) => b.consumerUnitId)
      .filter((id): id is string => !!id),
  );

  const data = units.map((u) => ({
    consumerUnit: u,
    billing: billingByUc.get(u.id) ?? null,
    status: billingByUc.get(u.id)?.status ?? "PENDENTE",
    faturaDistribuidoraDisponivel: ucsComFatura.has(u.id),
  }));

  return NextResponse.json(data);
}

/**
 * POST /api/billing/consumer-units
 * Body: { consumerUnitId, ano, mes }
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { consumerUnitId, ano, mes } = body;
  if (!consumerUnitId || !ano || !mes) {
    return NextResponse.json(
      { error: "consumerUnitId, ano e mes são obrigatórios" },
      { status: 400 },
    );
  }

  const billing = await prisma.consumerUnitBilling.upsert({
    where: {
      consumerUnitId_ano_mes: {
        consumerUnitId,
        ano: Number(ano),
        mes: Number(mes),
      },
    },
    create: {
      consumerUnitId,
      ano: Number(ano),
      mes: Number(mes),
      status: "PENDENTE",
    },
    update: {},
  });

  return NextResponse.json(billing);
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";
import { emitBillingToAsaas } from "@/lib/billing-asaas";
import type { AsaasBillingType } from "@/lib/asaas";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.ASAAS_API_KEY) {
    return NextResponse.json(
      { error: "ASAAS_API_KEY não configurado no servidor" },
      { status: 500 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    ano?: number;
    mes?: number;
    billingType?: AsaasBillingType;
    billingIds?: string[];
  };

  const billingType: AsaasBillingType = body.billingType || "UNDEFINED";

  let ids: string[] = [];
  if (body.billingIds && body.billingIds.length > 0) {
    ids = body.billingIds;
  } else if (body.ano && body.mes) {
    const rows = await prisma.consumerUnitBilling.findMany({
      where: {
        ano: body.ano,
        mes: body.mes,
        asaasChargeId: null,
        valorCobranca: { gt: 0 },
      },
      select: { id: true },
    });
    ids = rows.map((r) => r.id);
  } else {
    return NextResponse.json(
      { error: "Informe billingIds ou {ano, mes}" },
      { status: 400 },
    );
  }

  const results = [];
  for (const id of ids) {
    const r = await emitBillingToAsaas(id, { billingType });
    results.push(r);
  }

  const summary = {
    total: results.length,
    ok: results.filter((r) => r.ok).length,
    skipped: results.filter((r) => r.skipped).length,
    failed: results.filter((r) => !r.ok && r.error).length,
  };

  return NextResponse.json({ summary, results });
}

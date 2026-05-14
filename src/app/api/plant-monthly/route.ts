import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const plantId = searchParams.get("plantId");
  const ano = searchParams.get("ano");

  const where: Record<string, unknown> = {};
  if (plantId) where.plantId = plantId;
  if (ano) where.ano = Number(ano);

  const data = await prisma.plantMonthly.findMany({
    where,
    include: { plant: { select: { name: true } } },
    orderBy: [{ ano: "desc" }, { mes: "desc" }],
  });

  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const plantId = body.plantId;
    const ano = Number(body.ano);
    const mes = Number(body.mes);

    if (!plantId || !ano || !mes) {
      return NextResponse.json({ error: "plantId, ano e mes sao obrigatorios" }, { status: 400 });
    }

    const toFloat = (v: unknown) => {
      if (v === null || v === undefined || v === "") return null;
      const n = Number(v);
      return isNaN(n) ? null : n;
    };

    const fields = {
      geracaoTotal: toFloat(body.geracaoTotal),
      injecaoTotal: toFloat(body.injecaoTotal),
      autoConsumo: toFloat(body.autoConsumo),
      disponibilidade: toFloat(body.disponibilidade),
      observacoes: body.observacoes || null,
    };

    const data = await prisma.plantMonthly.upsert({
      where: { plantId_ano_mes: { plantId, ano, mes } },
      update: fields,
      create: { plantId, ano, mes, ...fields },
    });

    return NextResponse.json(data);
  } catch (e) {
    console.error("plant-monthly POST error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

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
  const consumerId = searchParams.get("consumerId");
  const plantId = searchParams.get("plantId");
  const ano = searchParams.get("ano");

  const where: Record<string, unknown> = {};
  if (consumerId) where.consumerId = consumerId;
  if (plantId) where.plantId = plantId;
  if (ano) where.ano = Number(ano);

  const data = await prisma.consumerMonthly.findMany({
    where,
    include: {
      consumer: { select: { name: true, unidadeConsumidora: true } },
      plant: { select: { name: true } },
    },
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
    const consumerId = body.consumerId;
    const plantId = body.plantId;
    const ano = Number(body.ano);
    const mes = Number(body.mes);

    if (!consumerId || !plantId || !ano || !mes) {
      return NextResponse.json({ error: "consumerId, plantId, ano e mes sao obrigatorios" }, { status: 400 });
    }

    const toFloat = (v: unknown) => {
      if (v === null || v === undefined || v === "") return null;
      const n = Number(v);
      return isNaN(n) ? null : n;
    };

    const fields = {
      consumoTotal: toFloat(body.consumoTotal),
      creditosRecebidos: toFloat(body.creditosRecebidos),
      creditosUtilizados: toFloat(body.creditosUtilizados),
      saldoCreditos: toFloat(body.saldoCreditos),
      economiaGerada: toFloat(body.economiaGerada),
      observacoes: body.observacoes || null,
    };

    const data = await prisma.consumerMonthly.upsert({
      where: { consumerId_plantId_ano_mes: { consumerId, plantId, ano, mes } },
      update: fields,
      create: { consumerId, plantId, ano, mes, ...fields },
    });

    return NextResponse.json(data);
  } catch (e) {
    console.error("consumer-monthly POST error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

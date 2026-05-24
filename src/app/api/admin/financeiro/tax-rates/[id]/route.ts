import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";

type Body = {
  ano?: number;
  mes?: number;
  percentual?: number;
  observacao?: string | null;
};

function monthToDate(ano: number, mes: number): Date {
  return new Date(Date.UTC(ano, mes - 1, 1, 12, 0, 0));
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as Body;
  const data: Record<string, unknown> = {};

  if (body.ano !== undefined || body.mes !== undefined) {
    const ano = Number(body.ano);
    const mes = Number(body.mes);
    if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
      return NextResponse.json({ error: "Ano inválido." }, { status: 400 });
    }
    if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
      return NextResponse.json({ error: "Mês inválido." }, { status: 400 });
    }
    data.vigenciaInicio = monthToDate(ano, mes);
  }

  if (body.percentual !== undefined) {
    const percentual = Number(body.percentual);
    if (!Number.isFinite(percentual) || percentual < 0 || percentual > 100) {
      return NextResponse.json(
        { error: "Percentual deve estar entre 0 e 100." },
        { status: 400 },
      );
    }
    data.percentual = percentual;
  }

  if (body.observacao !== undefined) {
    data.observacao = body.observacao?.trim() || null;
  }

  try {
    const row = await prisma.taxRate.update({ where: { id }, data });
    return NextResponse.json({
      id: row.id,
      ano: row.vigenciaInicio.getUTCFullYear(),
      mes: row.vigenciaInicio.getUTCMonth() + 1,
      percentual: row.percentual,
      observacao: row.observacao,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Unique constraint")) {
      return NextResponse.json(
        { error: "Já existe alíquota cadastrada com vigência neste mês." },
        { status: 409 },
      );
    }
    console.error("[PUT tax-rates]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await prisma.taxRate.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[DELETE tax-rates]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

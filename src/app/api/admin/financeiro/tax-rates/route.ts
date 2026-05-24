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
  // UTC noon do dia 1 do mês — evita drift de timezone (mesma estratégia das
  // datas "calendar-only" do projeto).
  return new Date(Date.UTC(ano, mes - 1, 1, 12, 0, 0));
}

function dateToMonth(d: Date): { ano: number; mes: number } {
  return { ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await prisma.taxRate.findMany({
    orderBy: { vigenciaInicio: "desc" },
  });
  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      ...dateToMonth(r.vigenciaInicio),
      percentual: r.percentual,
      observacao: r.observacao,
      criadoEm: r.criadoEm.toISOString(),
      atualizadoEm: r.atualizadoEm.toISOString(),
    })),
  );
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as Body;
  const ano = Number(body.ano);
  const mes = Number(body.mes);
  const percentual = Number(body.percentual);

  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
    return NextResponse.json({ error: "Ano inválido." }, { status: 400 });
  }
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    return NextResponse.json({ error: "Mês inválido." }, { status: 400 });
  }
  if (!Number.isFinite(percentual) || percentual < 0 || percentual > 100) {
    return NextResponse.json(
      { error: "Percentual deve estar entre 0 e 100." },
      { status: 400 },
    );
  }

  try {
    const row = await prisma.taxRate.create({
      data: {
        vigenciaInicio: monthToDate(ano, mes),
        percentual,
        observacao: body.observacao?.trim() || null,
      },
    });
    return NextResponse.json(
      {
        id: row.id,
        ...dateToMonth(row.vigenciaInicio),
        percentual: row.percentual,
        observacao: row.observacao,
      },
      { status: 201 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Unique constraint")) {
      return NextResponse.json(
        { error: "Já existe alíquota cadastrada com vigência neste mês." },
        { status: 409 },
      );
    }
    console.error("[POST tax-rates]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

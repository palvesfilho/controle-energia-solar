import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";

type EntryInput = {
  recurringCostId: string;
  valor: number;
  observacao?: string | null;
};

type Body = {
  ano: number;
  mes: number;
  entries: EntryInput[];
};

// Upsert em massa das entries de um mês. Usado pelo botão "Confirmar valores
// do mês" na tela do fechamento financeiro.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as Body;
  const ano = Number(body.ano);
  const mes = Number(body.mes);

  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
    return NextResponse.json({ error: "Ano inválido." }, { status: 400 });
  }
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    return NextResponse.json({ error: "Mês inválido." }, { status: 400 });
  }
  if (!Array.isArray(body.entries) || body.entries.length === 0) {
    return NextResponse.json(
      { error: "Lista de entries vazia." },
      { status: 400 },
    );
  }

  for (const e of body.entries) {
    if (!e.recurringCostId) {
      return NextResponse.json(
        { error: "recurringCostId é obrigatório em cada entry." },
        { status: 400 },
      );
    }
    const v = Number(e.valor);
    if (!Number.isFinite(v) || v < 0) {
      return NextResponse.json(
        { error: `Valor inválido para rubrica ${e.recurringCostId}.` },
        { status: 400 },
      );
    }
  }

  try {
    const rubricas = await prisma.recurringCost.findMany({
      where: { id: { in: body.entries.map((e) => e.recurringCostId) } },
      select: { id: true, valorPadrao: true },
    });
    const valorPadraoById = new Map(rubricas.map((r) => [r.id, r.valorPadrao]));
    const userId = session.user.id ?? null;

    const results = await prisma.$transaction(
      body.entries.map((e) =>
        prisma.recurringCostEntry.upsert({
          where: {
            recurringCostId_ano_mes: {
              recurringCostId: e.recurringCostId,
              ano,
              mes,
            },
          },
          create: {
            recurringCostId: e.recurringCostId,
            ano,
            mes,
            valor: Number(e.valor),
            valorPadraoNoMes: valorPadraoById.get(e.recurringCostId) ?? null,
            confirmadoPorUserId: userId,
            observacao: e.observacao?.trim() || null,
          },
          update: {
            valor: Number(e.valor),
            valorPadraoNoMes: valorPadraoById.get(e.recurringCostId) ?? null,
            confirmadoEm: new Date(),
            confirmadoPorUserId: userId,
            observacao: e.observacao?.trim() || null,
          },
        }),
      ),
    );

    return NextResponse.json({ confirmadas: results.length });
  } catch (err) {
    console.error("[POST recurring-cost-entries]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

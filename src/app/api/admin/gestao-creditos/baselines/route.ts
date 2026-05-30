import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { canAccessSection } from "@/lib/roles";

// POST /api/admin/gestao-creditos/baselines
// Body: { consumerUnitId, motivo, observacao?, meses? (default 3) }
// Cria baseline que silencia CONSUMO_ANOMALO da UC pelos próximos N meses.
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !canAccessSection(session.user.role, "gestaoCreditos")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  let body: {
    consumerUnitId?: string;
    motivo?: string;
    observacao?: string;
    meses?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!body.consumerUnitId) {
    return NextResponse.json(
      { error: "consumerUnitId obrigatório" },
      { status: 400 },
    );
  }
  const motivosValidos = [
    "SAZONAL",
    "DESOCUPADA",
    "ATIVIDADE_BAIXA",
    "CONFIRMADO_PELO_CLIENTE",
    "OUTRO",
  ];
  const motivo = body.motivo && motivosValidos.includes(body.motivo)
    ? body.motivo
    : "CONFIRMADO_PELO_CLIENTE";

  const meses = body.meses && body.meses > 0 && body.meses <= 12 ? body.meses : 3;

  // Calcula mes/ano de validade
  const hoje = new Date();
  const dataValidade = new Date(hoje.getFullYear(), hoje.getMonth() + meses, 1);
  const validoAteMes = dataValidade.getMonth() + 1;
  const validoAteAno = dataValidade.getFullYear();

  try {
    const created = await prisma.consumoBaseline.create({
      data: {
        consumerUnitId: body.consumerUnitId,
        motivo,
        observacao: body.observacao || null,
        validoAteMes,
        validoAteAno,
        criadoPorUserId: session.user.id,
      },
    });
    return NextResponse.json(created);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /baselines]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/admin/gestao-creditos/baselines?consumerUnitId=X
// Remove TODAS as baselines ativas da UC. Útil pra reabrir investigação.
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !canAccessSection(session.user.role, "gestaoCreditos")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const consumerUnitId = request.nextUrl.searchParams.get("consumerUnitId");
  if (!consumerUnitId) {
    return NextResponse.json(
      { error: "consumerUnitId obrigatório (query string)" },
      { status: 400 },
    );
  }

  const hoje = new Date();
  const mes = hoje.getMonth() + 1;
  const ano = hoje.getFullYear();
  try {
    const res = await prisma.consumoBaseline.deleteMany({
      where: {
        consumerUnitId,
        OR: [
          { validoAteAno: { gt: ano } },
          { validoAteAno: ano, validoAteMes: { gte: mes } },
        ],
      },
    });
    return NextResponse.json({ removidas: res.count });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[DELETE /baselines]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

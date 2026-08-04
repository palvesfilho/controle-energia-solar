import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import {
  GeracaoManualError,
  lancarGeracaoManual,
  listarLancamentosDaUsina,
  removerGeracaoManualDoMes,
  removerGeracaoManualPorId,
  type TipoPeriodoManual,
} from "@/lib/geracao-manual";

// GET /api/brasil-solar/[id]/geracao-manual — lancamentos manuais da usina
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const { id } = await params;
  return NextResponse.json({ lancamentos: await listarLancamentosDaUsina(id) });
}

// POST /api/brasil-solar/[id]/geracao-manual — lanca/regrava o total de um periodo.
// Body MENSAL:        { tipoPeriodo: "MENSAL", ano, mes, kwhTotal, fonte?, observacao? }
// Body PERSONALIZADO: { tipoPeriodo: "PERSONALIZADO", dataInicio, dataFim, kwhTotal, ... }
// `entryId` opcional identifica a correcao de um lancamento existente.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();

  try {
    const resultado = await lancarGeracaoManual({
      clientId: id,
      tipoPeriodo: (body.tipoPeriodo as TipoPeriodoManual) ?? undefined,
      ano: body.ano != null ? Number(body.ano) : undefined,
      mes: body.mes != null ? Number(body.mes) : undefined,
      dataInicio: body.dataInicio ?? undefined,
      dataFim: body.dataFim ?? undefined,
      kwhTotal: Number(body.kwhTotal),
      fonte: body.fonte ?? null,
      observacao: body.observacao ?? null,
      entryId: body.entryId ?? undefined,
      registradoPor: session.user.email ?? session.user.name ?? "desconhecido",
    });
    return NextResponse.json(resultado, { status: 201 });
  } catch (e) {
    if (e instanceof GeracaoManualError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}

// DELETE /api/brasil-solar/[id]/geracao-manual?entryId=...
// (ou ?ano=&mes= pra remover o lancamento MENSAL daquela competencia)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const entryId = req.nextUrl.searchParams.get("entryId");

  if (entryId) {
    const r = await removerGeracaoManualPorId(entryId);
    if (!r) {
      return NextResponse.json({ error: "Lancamento nao encontrado" }, { status: 404 });
    }
    if (r.clientId !== id) {
      return NextResponse.json({ error: "Lancamento de outra usina" }, { status: 400 });
    }
    return NextResponse.json({ linhasRemovidas: r.linhasRemovidas });
  }

  const ano = Number(req.nextUrl.searchParams.get("ano"));
  const mes = Number(req.nextUrl.searchParams.get("mes"));
  if (!Number.isInteger(ano) || !Number.isInteger(mes) || mes < 1 || mes > 12) {
    return NextResponse.json({ error: "Informe entryId ou ano e mes validos" }, { status: 400 });
  }

  return NextResponse.json(await removerGeracaoManualDoMes(id, ano, mes));
}

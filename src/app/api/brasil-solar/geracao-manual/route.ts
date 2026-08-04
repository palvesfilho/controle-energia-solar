import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import {
  GeracaoManualError,
  lancarGeracaoManual,
  removerGeracaoManualDoMes,
  usinasDoMes,
} from "@/lib/geracao-manual";

function competencia(req: NextRequest) {
  const hoje = new Date();
  const ano = Number(req.nextUrl.searchParams.get("ano")) || hoje.getUTCFullYear();
  const mes = Number(req.nextUrl.searchParams.get("mes")) || hoje.getUTCMonth() + 1;
  return { ano, mes };
}

// GET /api/brasil-solar/geracao-manual?ano=&mes=&somenteSemDado=1&busca=
// Retrato do mes por usina — alimenta a tela de lancamento em lote.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const { ano, mes } = competencia(req);
  if (mes < 1 || mes > 12) {
    return NextResponse.json({ error: "Mes invalido" }, { status: 400 });
  }

  const somenteSemDado = req.nextUrl.searchParams.get("somenteSemDado") !== "0";
  const busca = req.nextUrl.searchParams.get("busca")?.trim() || undefined;

  const usinas = await usinasDoMes(ano, mes, { somenteSemDado, busca });
  return NextResponse.json({ ano, mes, somenteSemDado, usinas });
}

// POST /api/brasil-solar/geracao-manual — lancamento em lote.
// Body: { ano, mes, fonte?, itens: [{ clientId, kwhTotal, observacao? }] }
// kwhTotal null/"" remove o lancamento daquela usina no mes.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const body = await req.json();
  const ano = Number(body.ano);
  const mes = Number(body.mes);
  type ItemLote = { clientId: string; kwhTotal: unknown; observacao?: string | null };
  const itens: ItemLote[] = Array.isArray(body.itens) ? body.itens : [];

  if (itens.length === 0) {
    return NextResponse.json({ error: "Nenhuma usina informada" }, { status: 400 });
  }

  const registradoPor = session.user.email ?? session.user.name ?? "desconhecido";
  const ok: { clientId: string; kwhTotal: number; kwhRateado: number; avisos: string[] }[] = [];
  const removidos: string[] = [];
  const erros: { clientId: string; erro: string }[] = [];

  // Sequencial de proposito: cada lancamento roda uma transacao e recalcula os
  // desnormalizados da usina. Em paralelo isso viraria contencao no Postgres.
  for (const item of itens) {
    try {
      const vazio =
        item.kwhTotal === null || item.kwhTotal === undefined || String(item.kwhTotal).trim() === "";
      if (vazio) {
        const r = await removerGeracaoManualDoMes(item.clientId, ano, mes);
        if (r.linhasRemovidas > 0) removidos.push(item.clientId);
        continue;
      }
      // A tela em lote trabalha sempre por mês calendário; período
      // personalizado só pela tela da usina.
      const r = await lancarGeracaoManual({
        clientId: item.clientId,
        tipoPeriodo: "MENSAL",
        ano,
        mes,
        kwhTotal: Number(item.kwhTotal),
        fonte: body.fonte ?? null,
        observacao: item.observacao ?? null,
        registradoPor,
      });
      ok.push({
        clientId: item.clientId,
        kwhTotal: r.kwhTotal,
        kwhRateado: r.kwhRateado,
        avisos: r.avisos,
      });
    } catch (e) {
      erros.push({
        clientId: item.clientId,
        erro:
          e instanceof GeracaoManualError
            ? e.message
            : e instanceof Error
              ? e.message
              : String(e),
      });
    }
  }

  return NextResponse.json({ ano, mes, lancados: ok, removidos, erros });
}

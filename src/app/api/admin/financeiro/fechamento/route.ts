import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import {
  calcularFechamentoAgregado,
  type TipoPeriodo,
} from "@/lib/fechamento-financeiro";

const TIPOS_VALIDOS: TipoPeriodo[] = [
  "mensal",
  "trimestral",
  "semestral",
  "anual",
];

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const ano = Number(url.searchParams.get("ano"));
  const mes = Number(url.searchParams.get("mes"));
  const tipoRaw = (url.searchParams.get("tipo") ?? "mensal").toLowerCase();
  const tipo = (TIPOS_VALIDOS as string[]).includes(tipoRaw)
    ? (tipoRaw as TipoPeriodo)
    : "mensal";

  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
    return NextResponse.json({ error: "Ano inválido." }, { status: 400 });
  }
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    return NextResponse.json({ error: "Mês inválido." }, { status: 400 });
  }

  try {
    const dre = await calcularFechamentoAgregado(tipo, ano, mes);
    return NextResponse.json(dre);
  } catch (err) {
    console.error("[GET fechamento-financeiro]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

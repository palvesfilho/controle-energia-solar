import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { renderToBuffer } from "@react-pdf/renderer";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import {
  calcularFechamentoAgregado,
  type TipoPeriodo,
} from "@/lib/fechamento-financeiro";
import { FechamentoFinanceiroPDF } from "@/components/billing/fechamento-financeiro-pdf";

export const runtime = "nodejs";

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
    const ultimo = dre.meses[dre.meses.length - 1];

    const geradoEm = new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date());

    const pdf = await renderToBuffer(
      FechamentoFinanceiroPDF({
        data: {
          tipo: dre.tipo,
          ano: dre.ano,
          mes: dre.mes,
          periodoLabel: dre.periodoLabel,
          geradoEm,
          totais: dre.totais,
          meses: dre.meses.map((m) => ({
            ano: m.ano,
            mes: m.mes,
            receitaBruta: m.receitaBruta,
            custoDireto: m.custoDireto,
            custosFixosTotal: m.custosFixosTotal,
            imposto: m.imposto,
            lucroLiquido: m.lucroLiquido,
          })),
          rubricasUltimoMes: ultimo.rubricas.map((r) => ({
            label: r.label,
            categoria: r.categoria ?? null,
            valor: r.valor,
            confirmado: !!r.confirmado,
          })),
          inadimplencia: {
            total: dre.inadimplencia.total,
            qtdTotal: dre.inadimplencia.qtdTotal,
            pctSobreReceita: dre.inadimplencia.pctSobreReceita,
            faixas: dre.inadimplencia.faixas,
          },
          alertas: dre.alertas,
          taxRatePercentual: ultimo.taxRatePercentual,
        },
      }),
    );

    const slug = `${tipo}-${ano}-${String(mes).padStart(2, "0")}`;
    const filename = `fechamento-financeiro-${slug}.pdf`;

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[GET fechamento-financeiro/pdf]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * POST /api/admin/faturamento/conferencia-fatura/[billId]
 * Body: { acao: "USAR_PDF" | "MANTER_INFOSIMPLES" | "RECONFERIR" }
 *
 * Destrava a fatura que a DUPLA CONFERÊNCIA (Infosimples × PDF) travou —
 * ver lib/fatura-conferencia.ts. Quem decide é uma pessoa; fica registrado
 * quem e quando.
 *
 *   - USAR_PDF            grava os valores lidos do PDF nos campos divergentes,
 *                         recalcula a cobrança e o repasse → CORRIGIDA.
 *   - MANTER_INFOSIMPLES  mantém o que está gravado → LIBERADA.
 *   - RECONFERIR          lê o PDF de novo (ex.: depois de ajustar o leitor).
 *
 * Quem pode: FULL_ADMIN_TRIO (ADMIN, GESTOR, FINANCEIRO).
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { CAMPOS_CONFERIDOS, conferirEGravar, type Divergencia } from "@/lib/fatura-conferencia";
import { populateBillingFromBill } from "@/lib/billing-populate";
import { syncInvestorPayablesFromBill } from "@/lib/investor-payables";

interface RouteCtx {
  params: Promise<{ billId: string }>;
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { billId } = await ctx.params;
  const { acao } = (await req.json().catch(() => ({}))) as { acao?: string };

  const bill = await prisma.consumerBill.findUnique({
    where: { id: billId },
    select: { id: true, consumerUnitId: true, conferenciaStatus: true, conferenciaDivergencias: true },
  });
  if (!bill) return NextResponse.json({ error: "Fatura não encontrada" }, { status: 404 });

  const quem =
    session.user.name ?? session.user.email ?? (session.user as { id?: string }).id ?? "—";

  if (acao === "RECONFERIR") {
    const r = await conferirEGravar(billId);
    return NextResponse.json({ ok: true, status: r.status, divergencias: r.divergencias, erro: r.erro });
  }

  if (bill.conferenciaStatus !== "DIVERGENTE" && bill.conferenciaStatus !== "ERRO_PDF") {
    return NextResponse.json({ error: "Esta fatura não está travada pela conferência" }, { status: 400 });
  }

  if (acao === "MANTER_INFOSIMPLES") {
    await prisma.consumerBill.update({
      where: { id: billId },
      data: { conferenciaStatus: "LIBERADA", conferenciaLiberadaPor: quem, conferenciaLiberadaEm: new Date() },
    });
    return NextResponse.json({ ok: true, status: "LIBERADA" });
  }

  if (acao === "USAR_PDF") {
    if (bill.conferenciaStatus === "ERRO_PDF") {
      return NextResponse.json(
        { error: "O PDF não pôde ser lido — não há valores do PDF para usar" },
        { status: 400 },
      );
    }
    const salvo = JSON.parse(bill.conferenciaDivergencias ?? "{}") as {
      divergencias?: Divergencia[];
      valoresPdf?: Record<string, number | string | null>;
    };
    const valoresPdf = salvo.valoresPdf ?? {};
    const tipos = new Map(CAMPOS_CONFERIDOS.map((c) => [c.campo, c.tipo]));
    const data: Record<string, unknown> = {};
    for (const d of salvo.divergencias ?? []) {
      const v = valoresPdf[d.campo] ?? null;
      data[d.campo] = tipos.get(d.campo) === "data" && v != null ? new Date(String(v)) : v;
    }
    await prisma.consumerBill.update({
      where: { id: billId },
      data: {
        ...data,
        conferenciaStatus: "CORRIGIDA",
        conferenciaLiberadaPor: quem,
        conferenciaLiberadaEm: new Date(),
      },
    });
    // Recalcula com os valores certos. `populateBillingFromBill` não mexe em
    // cobrança já emitida no Asaas; o repasse preserva status final.
    if (bill.consumerUnitId) {
      await populateBillingFromBill(billId);
      await syncInvestorPayablesFromBill(billId);
    }
    return NextResponse.json({ ok: true, status: "CORRIGIDA", camposCorrigidos: Object.keys(data) });
  }

  return NextResponse.json({ error: "acao inválida" }, { status: 400 });
}

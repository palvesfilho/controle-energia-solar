import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/faturas-energia/abertas
 * Lista UCs (consumerUnit) com faturas em aberto na distribuidora (contaPaga=false
 * E pagoEm=null), ordenadas pelo MENOR vencimento da UC.
 *
 * Pra cada UC retorna o array de faturas em aberto (cada uma com ano/mes/valor/
 * vencimento/codigoBarras/pixCopiaCola) ordenado por vencimento crescente.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  // Bills em aberto: não pagas (contaPaga=false) e ainda não registramos
  // pagamento manual (pagoEm null). Ignora UC geradora (consumerUnitId null).
  const bills = await prisma.consumerBill.findMany({
    where: {
      contaPaga: false,
      pagoEm: null,
      consumerUnitId: { not: null },
    },
    select: {
      id: true,
      consumerUnitId: true,
      anoReferencia: true,
      mesReferencia: true,
      valorTotal: true,
      vencimento: true,
      codigoBarras: true,
      pixCopiaCola: true,
      pdfUrl: true,
      consumerUnit: {
        select: {
          id: true,
          codigoUc: true,
          nome: true,
          distribuidora: true,
          active: true,
        },
      },
    },
    orderBy: { vencimento: "asc" },
  });

  type FaturaAberta = {
    id: string;
    ano: number;
    mes: number;
    valorTotal: number | null;
    vencimento: string | null;
    codigoBarras: string | null;
    pixCopiaCola: string | null;
    pdfUrl: string | null;
  };

  type UcAgrupada = {
    ucId: string;
    codigoUc: string;
    nome: string;
    distribuidora: string | null;
    active: boolean;
    menorVencimento: string | null;
    qtdAbertas: number;
    valorTotalAbertas: number;
    faturas: FaturaAberta[];
  };

  const map = new Map<string, UcAgrupada>();
  for (const b of bills) {
    if (!b.consumerUnit) continue;
    const ucId = b.consumerUnit.id;
    let acc = map.get(ucId);
    if (!acc) {
      acc = {
        ucId,
        codigoUc: b.consumerUnit.codigoUc,
        nome: b.consumerUnit.nome,
        distribuidora: b.consumerUnit.distribuidora,
        active: b.consumerUnit.active,
        menorVencimento: null,
        qtdAbertas: 0,
        valorTotalAbertas: 0,
        faturas: [],
      };
      map.set(ucId, acc);
    }
    acc.faturas.push({
      id: b.id,
      ano: b.anoReferencia,
      mes: b.mesReferencia,
      valorTotal: b.valorTotal,
      vencimento: b.vencimento?.toISOString() ?? null,
      codigoBarras: b.codigoBarras,
      pixCopiaCola: b.pixCopiaCola,
      pdfUrl: b.pdfUrl,
    });
    acc.qtdAbertas += 1;
    acc.valorTotalAbertas += b.valorTotal ?? 0;
    if (b.vencimento) {
      const v = b.vencimento.toISOString();
      if (acc.menorVencimento == null || v < acc.menorVencimento) {
        acc.menorVencimento = v;
      }
    }
  }

  const ucs = Array.from(map.values());
  // Ordena UCs pelo menor vencimento (UCs sem vencimento vão pro fim).
  ucs.sort((a, b) => {
    if (a.menorVencimento && b.menorVencimento) {
      return a.menorVencimento < b.menorVencimento ? -1 : 1;
    }
    if (a.menorVencimento) return -1;
    if (b.menorVencimento) return 1;
    return a.codigoUc.localeCompare(b.codigoUc);
  });

  return NextResponse.json({ ucs });
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/plants/[id]/balanco-investidor
 * Retorna todas as InvestorPayable desta usina, agrupadas por investidor, com
 * a reconciliação mês a mês: devido × pago × diferença × saldo acumulado.
 *
 * Query: ?investorId=... (opcional, filtra por investidor)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id: plantId } = await params;
  const { searchParams } = new URL(req.url);
  const investorFilter = searchParams.get("investorId");

  const plant = await prisma.plant.findUnique({
    where: { id: plantId },
    select: { id: true, name: true, numeroUsina: true },
  });
  if (!plant) {
    return NextResponse.json({ error: "Usina não encontrada" }, { status: 404 });
  }

  const payables = await prisma.investorPayable.findMany({
    where: {
      plantId,
      ...(investorFilter ? { investorId: investorFilter } : {}),
    },
    select: {
      id: true,
      investorId: true,
      anoReferencia: true,
      mesReferencia: true,
      parcelaIndex: true,
      kwhCompensadoBase: true,
      valorKwhContrato: true,
      valorBruto: true,
      valorAjuste: true,
      valorAbatidoDebito: true,
      valorLiquido: true,
      valorRealPago: true,
      motivoValorRealPago: true,
      status: true,
      pagoInvestidorEm: true,
      consumerUnit: { select: { codigoUc: true, nome: true } },
      investor: {
        select: {
          id: true,
          user: { select: { name: true, email: true } },
        },
      },
    },
    orderBy: [
      { investorId: "asc" },
      { anoReferencia: "asc" },
      { mesReferencia: "asc" },
      { parcelaIndex: "asc" },
    ],
  });

  // Agrupa por investidor e calcula saldo acumulado.
  const byInvestor = new Map<
    string,
    {
      investorId: string;
      investorNome: string;
      totalDevido: number;
      totalPago: number;
      saldoAcumulado: number;
      linhas: Array<{
        payableId: string;
        anoReferencia: number;
        mesReferencia: number;
        parcelaIndex: number;
        ucCodigo: string | null;
        ucNome: string;
        kwh: number;
        valorBruto: number;
        valorAjuste: number;
        valorAbatidoDebito: number;
        valorLiquido: number;
        valorRealPago: number | null;
        motivoValorRealPago: string | null;
        delta: number | null;
        saldoAcumulado: number;
        status: string;
        pagoInvestidorEm: string | null;
      }>;
    }
  >();

  for (const p of payables) {
    const nomeInvestor =
      p.investor.user?.name ?? p.investor.user?.email ?? "(sem nome)";
    let acc = byInvestor.get(p.investorId);
    if (!acc) {
      acc = {
        investorId: p.investorId,
        investorNome: nomeInvestor,
        totalDevido: 0,
        totalPago: 0,
        saldoAcumulado: 0,
        linhas: [],
      };
      byInvestor.set(p.investorId, acc);
    }

    const devido = p.valorLiquido;
    const pago = p.valorRealPago;
    const delta = pago != null ? pago - devido : null;
    if (delta != null) acc.saldoAcumulado += delta;
    acc.totalDevido += devido;
    if (pago != null) acc.totalPago += pago;

    acc.linhas.push({
      payableId: p.id,
      anoReferencia: p.anoReferencia,
      mesReferencia: p.mesReferencia,
      parcelaIndex: p.parcelaIndex,
      ucCodigo: p.consumerUnit.codigoUc,
      ucNome: p.consumerUnit.nome,
      kwh: p.kwhCompensadoBase,
      valorBruto: p.valorBruto,
      valorAjuste: p.valorAjuste,
      valorAbatidoDebito: p.valorAbatidoDebito,
      valorLiquido: p.valorLiquido,
      valorRealPago: p.valorRealPago,
      motivoValorRealPago: p.motivoValorRealPago,
      delta,
      saldoAcumulado: acc.saldoAcumulado,
      status: p.status,
      pagoInvestidorEm: p.pagoInvestidorEm?.toISOString() ?? null,
    });
  }

  return NextResponse.json({
    plant,
    investidores: Array.from(byInvestor.values()),
  });
}

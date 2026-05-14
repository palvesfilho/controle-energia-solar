import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/investors/[id]/debits
 * Lista todos os débitos do investidor (ABERTO, QUITADO, CANCELADO) com
 * aplicações resumidas. Ordenação: mais recentes primeiro.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id: investorId } = await params;

  const investor = await prisma.investor.findUnique({
    where: { id: investorId },
    select: { id: true, user: { select: { name: true, email: true } } },
  });
  if (!investor) {
    return NextResponse.json({ error: "Investidor não encontrado" }, { status: 404 });
  }

  const debits = await prisma.investorDebit.findMany({
    where: { investorId },
    orderBy: { criadoEm: "desc" },
    include: {
      applications: {
        select: {
          id: true,
          valorAbatido: true,
          aplicadoEm: true,
          payable: {
            select: {
              id: true,
              anoReferencia: true,
              mesReferencia: true,
              consumerUnit: { select: { codigoUc: true, nome: true } },
            },
          },
        },
        orderBy: { aplicadoEm: "asc" },
      },
    },
  });

  const saldoDevedorTotal = debits
    .filter((d) => d.status === "ABERTO")
    .reduce((s, d) => s + d.valorRestante, 0);

  return NextResponse.json({
    investor: {
      id: investor.id,
      nome: investor.user?.name ?? investor.user?.email ?? "(sem nome)",
    },
    saldoDevedorTotal,
    debits,
  });
}

/**
 * POST /api/investors/[id]/debits
 * Cria um novo débito (saldo devedor) pro investidor. O valor será
 * amortizado automaticamente nas próximas payables criadas/atualizadas.
 *
 * Body: { valor: number, motivo?: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id: investorId } = await params;
  const body = (await req.json().catch(() => null)) as {
    valor?: number;
    motivo?: string;
  } | null;

  if (!body || typeof body.valor !== "number" || !(body.valor > 0)) {
    return NextResponse.json(
      { error: "Informe um valor maior que zero." },
      { status: 400 },
    );
  }

  const investor = await prisma.investor.findUnique({
    where: { id: investorId },
    select: { id: true },
  });
  if (!investor) {
    return NextResponse.json({ error: "Investidor não encontrado" }, { status: 404 });
  }

  const debit = await prisma.investorDebit.create({
    data: {
      investorId,
      valorOriginal: body.valor,
      valorRestante: body.valor,
      motivo: body.motivo?.trim() || null,
      criadoPorUserId: session.user.id,
    },
    select: {
      id: true,
      valorOriginal: true,
      valorRestante: true,
      motivo: true,
      status: true,
      criadoEm: true,
    },
  });

  return NextResponse.json(debit, { status: 201 });
}

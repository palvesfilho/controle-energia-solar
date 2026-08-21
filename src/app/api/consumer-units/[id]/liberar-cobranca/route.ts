import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";
import { FATURA_COMPENSADA } from "@/lib/uc-implantacao";

/**
 * POST /api/consumer-units/[id]/liberar-cobranca   → marca "ok, pode cobrar"
 * DELETE                                           → desfaz (volta o aviso)
 *
 * Só registra a decisão de quem opera: a UC já mudou de fase sozinha quando a
 * primeira fatura compensada entrou. O que este endpoint faz é tirar a UC do
 * sino e apagar o selo "NOVA" da lista.
 *
 * Recusa liberar UC que ainda não compensou — sem essa guarda um clique
 * apressado apagaria o aviso ANTES de ele existir, e a UC ficaria pra sempre
 * fora do radar sem nunca ter sido cobrada. É o tipo de erro que falha calado.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const uc = await prisma.consumerUnit.findUnique({
    where: { id },
    select: { id: true, nome: true, cobrancaLiberadaEm: true },
  });
  if (!uc) {
    return NextResponse.json({ error: "UC não encontrada" }, { status: 404 });
  }

  const compensada = await prisma.consumerBill.findFirst({
    where: { consumerUnitId: id, ...FATURA_COMPENSADA },
    select: { anoReferencia: true, mesReferencia: true },
    orderBy: [{ anoReferencia: "asc" }, { mesReferencia: "asc" }],
  });
  if (!compensada) {
    return NextResponse.json(
      {
        error:
          `"${uc.nome}" ainda não teve nenhuma fatura com energia compensada — ` +
          `ela continua em implantação. Liberar agora esconderia o aviso da ` +
          `primeira compensação quando ele finalmente acontecer.`,
      },
      { status: 400 },
    );
  }

  const quem =
    session.user.name?.trim() || session.user.email?.trim() || "Operador";

  const atualizada = await prisma.consumerUnit.update({
    where: { id },
    data: { cobrancaLiberadaEm: new Date(), cobrancaLiberadaPor: quem },
    select: { id: true, cobrancaLiberadaEm: true, cobrancaLiberadaPor: true },
  });

  return NextResponse.json({
    ...atualizada,
    primeiraCompensacao: {
      ano: compensada.anoReferencia,
      mes: compensada.mesReferencia,
    },
  });
}

/** Desfaz a liberação — a UC volta a aparecer no sino. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const atualizada = await prisma.consumerUnit.update({
    where: { id },
    data: { cobrancaLiberadaEm: null, cobrancaLiberadaPor: null },
    select: { id: true, cobrancaLiberadaEm: true },
  });

  return NextResponse.json(atualizada);
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";
import { avisoDivergenciaDommo } from "@/lib/usina-dommo";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: plantId } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { investorId, sharePercent, valorKwhContrato, gestaoFixaContrato } = body;
  const isUsinaDommo = body.isUsinaDommo === true;

  if (!investorId) {
    return NextResponse.json({ error: "investorId é obrigatório" }, { status: 400 });
  }

  const [plant, investor] = await Promise.all([
    prisma.plant.findUnique({ where: { id: plantId }, select: { id: true } }),
    prisma.investor.findUnique({
      where: { id: investorId },
      select: { id: true, cnpj: true, document: true },
    }),
  ]);
  if (!plant) return NextResponse.json({ error: "Usina não encontrada" }, { status: 404 });
  if (!investor) return NextResponse.json({ error: "Investidor não encontrado" }, { status: 404 });

  const existing = await prisma.investorPlant.findFirst({
    where: { plantId, investorId },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Este investidor já está vinculado a esta usina" },
      { status: 400 },
    );
  }

  // No regime Dommo a gestora fica com 100% do lucro: gestão fixa e R$/kWh de
  // contrato não existem. Gravar null (em vez de aceitar o que veio da tela)
  // evita que algum leitor futuro encontre um valor que não vale.
  const link = await prisma.investorPlant.create({
    data: {
      plantId,
      investorId,
      sharePercent: sharePercent ? Number(sharePercent) : null,
      valorKwhContrato:
        isUsinaDommo || !valorKwhContrato ? null : Number(valorKwhContrato),
      gestaoFixaContrato:
        isUsinaDommo || !gestaoFixaContrato ? null : Number(gestaoFixaContrato),
      isUsinaDommo,
    },
  });

  return NextResponse.json(
    { success: true, id: link.id, aviso: avisoDivergenciaDommo(isUsinaDommo, investor) },
    { status: 201 },
  );
}

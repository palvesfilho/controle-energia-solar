import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";

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

  if (!investorId) {
    return NextResponse.json({ error: "investorId é obrigatório" }, { status: 400 });
  }

  const [plant, investor] = await Promise.all([
    prisma.plant.findUnique({ where: { id: plantId }, select: { id: true } }),
    prisma.investor.findUnique({ where: { id: investorId }, select: { id: true } }),
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

  const link = await prisma.investorPlant.create({
    data: {
      plantId,
      investorId,
      sharePercent: sharePercent ? Number(sharePercent) : null,
      valorKwhContrato: valorKwhContrato ? Number(valorKwhContrato) : null,
      gestaoFixaContrato: gestaoFixaContrato ? Number(gestaoFixaContrato) : null,
    },
  });

  return NextResponse.json({ success: true, id: link.id }, { status: 201 });
}

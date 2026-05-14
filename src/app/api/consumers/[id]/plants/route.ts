import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { plantId, cotaPercent, descontoPercent } = body;

  if (!plantId) {
    return NextResponse.json({ error: "plantId e obrigatorio" }, { status: 400 });
  }

  const existing = await prisma.consumerPlant.findUnique({
    where: { consumerId_plantId: { consumerId: id, plantId } },
  });

  if (existing) {
    return NextResponse.json({ error: "Consumidor ja vinculado a esta usina" }, { status: 400 });
  }

  const link = await prisma.consumerPlant.create({
    data: {
      consumerId: id,
      plantId,
      cotaPercent: cotaPercent ? Number(cotaPercent) : null,
      descontoPercent: descontoPercent ? Number(descontoPercent) : null,
    },
  });

  return NextResponse.json(link, { status: 201 });
}

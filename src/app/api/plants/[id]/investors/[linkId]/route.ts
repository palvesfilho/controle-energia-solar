import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; linkId: string }> }
) {
  const { linkId } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  await prisma.investorPlant.update({
    where: { id: linkId },
    data: {
      valorKwhContrato: body.valorKwhContrato ? Number(body.valorKwhContrato) : undefined,
      gestaoFixaContrato: body.gestaoFixaContrato ? Number(body.gestaoFixaContrato) : undefined,
      sharePercent: body.sharePercent ? Number(body.sharePercent) : undefined,
    },
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; linkId: string }> }
) {
  const { linkId } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.investorPlant.delete({ where: { id: linkId } });

  return NextResponse.json({ success: true });
}

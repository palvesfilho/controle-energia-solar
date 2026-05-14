import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const ano = searchParams.get("ano");

  const where: Record<string, unknown> = { consumerUnitId: id };
  if (ano) where.anoReferencia = parseInt(ano);

  const bills = await prisma.consumerBill.findMany({
    where,
    orderBy: [{ anoReferencia: "desc" }, { mesReferencia: "desc" }],
    include: { plant: { select: { id: true, name: true } } },
  });

  return NextResponse.json(bills);
}

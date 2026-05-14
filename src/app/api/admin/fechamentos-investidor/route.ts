import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const ano = searchParams.get("ano");
  const mes = searchParams.get("mes");

  const settlements = await prisma.investorSettlement.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(ano ? { anoFechamento: Number(ano) } : {}),
      ...(mes ? { mesFechamento: Number(mes) } : {}),
    },
    orderBy: [
      { anoFechamento: "desc" },
      { mesFechamento: "desc" },
      { createdAt: "desc" },
    ],
    include: {
      investor: {
        select: {
          id: true,
          user: { select: { name: true, email: true } },
        },
      },
    },
  });

  return NextResponse.json({ settlements });
}

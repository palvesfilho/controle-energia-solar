import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";
import { hashSync } from "bcryptjs";

function generateTempPassword(length = 10): string {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const investor = await prisma.investor.findUnique({
    where: { id },
    include: { user: { select: { id: true, email: true, name: true } } },
  });

  if (!investor) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const tempPassword = generateTempPassword();

  await prisma.user.update({
    where: { id: investor.userId },
    data: { passwordHash: hashSync(tempPassword, 10) },
  });

  return NextResponse.json({
    success: true,
    tempPassword,
    message: `Senha resetada para ${investor.user.name}. Informe a senha temporaria ao investidor.`,
  });
}

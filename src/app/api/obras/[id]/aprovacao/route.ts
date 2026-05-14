import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";

const VALORES_VALIDOS = new Set(["PENDENTE", "ACEITA", "RECUSADA"]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const aprovacao = String(body.aprovacao || "").toUpperCase();
  if (!VALORES_VALIDOS.has(aprovacao)) {
    return NextResponse.json(
      { error: "Valor inválido. Use PENDENTE, ACEITA ou RECUSADA." },
      { status: 400 }
    );
  }

  const obra = await prisma.obra.update({
    where: { id },
    data: { aprovacao },
  });

  return NextResponse.json(obra);
}

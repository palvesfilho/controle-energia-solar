import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

/**
 * DELETE /api/plants/[id]/monitoring/[clientId] — desvincula o
 * BrasilSolarClient da Plant (set plantId = null).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; clientId: string }> },
) {
  const { id, clientId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const client = await prisma.brasilSolarClient.findUnique({
    where: { id: clientId },
    select: { id: true, plantId: true },
  });
  if (!client) {
    return NextResponse.json({ error: "BrasilSolarClient não encontrado" }, { status: 404 });
  }
  if (client.plantId !== id) {
    return NextResponse.json(
      { error: "Este cliente não está vinculado a esta Plant" },
      { status: 409 },
    );
  }

  await prisma.brasilSolarClient.update({
    where: { id: clientId },
    data: { plantId: null },
  });

  return NextResponse.json({ ok: true });
}

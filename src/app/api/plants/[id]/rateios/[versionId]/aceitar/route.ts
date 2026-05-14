import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/plants/[id]/rateios/[versionId]/aceitar — marca o rateio pendente
 * como VIGENTE. O rateio que estava VIGENTE (se houver) vira SUBSTITUIDO.
 * Transação atômica.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id: plantId, versionId } = await params;

  const version = await prisma.rateioVersion.findUnique({
    where: { id: versionId },
    select: { id: true, plantId: true, status: true },
  });

  if (!version || version.plantId !== plantId) {
    return NextResponse.json({ error: "Rateio não encontrado" }, { status: 404 });
  }
  if (version.status !== "PENDENTE_ACEITE") {
    return NextResponse.json(
      { error: `Só é possível aceitar rateios pendentes (status atual: ${version.status})` },
      { status: 400 },
    );
  }

  const now = new Date();

  await prisma.$transaction([
    prisma.rateioVersion.updateMany({
      where: { plantId, status: "VIGENTE" },
      data: { status: "SUBSTITUIDO", substituidoEm: now },
    }),
    prisma.rateioVersion.update({
      where: { id: versionId },
      data: { status: "VIGENTE", aceitoEm: now },
    }),
  ]);

  return NextResponse.json({ ok: true });
}

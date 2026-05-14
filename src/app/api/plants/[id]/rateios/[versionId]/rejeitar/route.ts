import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/plants/[id]/rateios/[versionId]/rejeitar — marca o rateio pendente
 * como REJEITADO. O rateio VIGENTE permanece válido.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id: plantId, versionId } = await params;
  const body = (await req.json().catch(() => null)) as { motivo?: string } | null;

  const version = await prisma.rateioVersion.findUnique({
    where: { id: versionId },
    select: { id: true, plantId: true, status: true, observacao: true },
  });

  if (!version || version.plantId !== plantId) {
    return NextResponse.json({ error: "Rateio não encontrado" }, { status: 404 });
  }
  if (version.status !== "PENDENTE_ACEITE") {
    return NextResponse.json(
      { error: `Só é possível rejeitar rateios pendentes (status atual: ${version.status})` },
      { status: 400 },
    );
  }

  const motivo = body?.motivo?.trim();
  const novaObs = motivo
    ? version.observacao
      ? `${version.observacao}\n[Rejeitado]: ${motivo}`
      : `[Rejeitado]: ${motivo}`
    : version.observacao;

  await prisma.rateioVersion.update({
    where: { id: versionId },
    data: {
      status: "REJEITADO",
      rejeitadoEm: new Date(),
      observacao: novaObs,
    },
  });

  return NextResponse.json({ ok: true });
}

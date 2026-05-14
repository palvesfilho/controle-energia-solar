import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/plants/[id]/rateios/[versionId]/enviar — marca o rateio como
 * "enviado à concessionária" (preenche enviadoEm). O envio real por email
 * (com o anexo/documento do rateio) ainda NÃO está implementado — será feito
 * numa fase posterior via Resend/SMTP + monitoramento de inbox para captar
 * o aceite/rejeição.
 *
 * Por ora o botão apenas registra o timestamp para a UI marcar "já enviado"
 * e evitar reenvio involuntário.
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
    select: { id: true, plantId: true, status: true, enviadoEm: true },
  });

  if (!version || version.plantId !== plantId) {
    return NextResponse.json({ error: "Rateio não encontrado" }, { status: 404 });
  }
  if (version.status !== "PENDENTE_ACEITE") {
    return NextResponse.json(
      { error: `Só é possível enviar rateios pendentes (status atual: ${version.status})` },
      { status: 400 },
    );
  }

  await prisma.rateioVersion.update({
    where: { id: versionId },
    data: { enviadoEm: new Date() },
  });

  return NextResponse.json({
    ok: true,
    stub: true,
    message:
      "Registrado como enviado. O disparo de email para a concessionária será implementado em fase posterior.",
  });
}

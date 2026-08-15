import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";
import { avisoDivergenciaDommo } from "@/lib/usina-dommo";

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

  // `isUsinaDommo` só é tocado quando vem explicitamente no body — chamadas
  // antigas que não conhecem o campo não podem desmarcar o regime por omissão.
  const isUsinaDommo =
    typeof body.isUsinaDommo === "boolean" ? body.isUsinaDommo : undefined;

  // No regime Dommo não existe gestão fixa nem R$/kWh de contrato: ao marcar,
  // limpa os dois. Deixá-los gravados seria um valor que não vale esperando
  // alguém ler (a formatação da tela some, o número no banco não).
  const limpaContrato = isUsinaDommo === true;

  await prisma.investorPlant.update({
    where: { id: linkId },
    data: {
      valorKwhContrato: limpaContrato
        ? null
        : body.valorKwhContrato
          ? Number(body.valorKwhContrato)
          : undefined,
      gestaoFixaContrato: limpaContrato
        ? null
        : body.gestaoFixaContrato
          ? Number(body.gestaoFixaContrato)
          : undefined,
      sharePercent: body.sharePercent ? Number(body.sharePercent) : undefined,
      isUsinaDommo,
    },
  });

  const link = await prisma.investorPlant.findUnique({
    where: { id: linkId },
    select: {
      isUsinaDommo: true,
      investor: { select: { cnpj: true, document: true } },
    },
  });

  return NextResponse.json({
    success: true,
    aviso: link
      ? avisoDivergenciaDommo(link.isUsinaDommo, link.investor)
      : null,
  });
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

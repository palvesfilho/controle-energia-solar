import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { getChavePublicaVapid } from "@/lib/push-notificacoes";

export const runtime = "nodejs";

/**
 * GET /api/admin/brasil-solar/push/dispositivos?proprietarioId=
 *
 * Aparelhos que autorizaram notificação para este proprietário.
 *
 * Devolve `configurado` junto: sem as chaves VAPID no ambiente, ninguém
 * consegue nem se inscrever nem receber. A tela precisa dizer isso, senão o
 * operador fica esperando um push que nunca sairia.
 *
 * Não devolve `p256dh` nem `auth` — são as chaves de criptografia da inscrição
 * e não têm razão de trafegar até o navegador do admin.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const proprietarioId = new URL(req.url).searchParams.get("proprietarioId");
  if (!proprietarioId) {
    return NextResponse.json({ error: "proprietarioId obrigatório" }, { status: 400 });
  }

  const dispositivos = await prisma.pushSubscription.findMany({
    where: { proprietarioId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      userAgent: true,
      createdAt: true,
      ultimoEnvioEm: true,
    },
  });

  return NextResponse.json({
    configurado: getChavePublicaVapid() !== null,
    dispositivos,
  });
}

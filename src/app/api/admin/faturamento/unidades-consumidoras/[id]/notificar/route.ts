/**
 * POST /api/admin/faturamento/unidades-consumidoras/[id]/notificar
 *
 * Reenvia o aviso da cobrança ao cliente (email + WhatsApp) SEM tocar na
 * cobrança do Asaas. É o botão "Reenviar" da tela do mês: o operador conserta
 * o email ou o telefone no cadastro e manda de novo, sem precisar cancelar e
 * reemitir o boleto — que criaria uma segunda cobrança para o mesmo mês.
 *
 * Só funciona depois de a cobrança existir: sem `asaasChargeId` (ou parcelas)
 * não há link de pagamento para mandar.
 *
 * Body (opcional): { forcarReal: true } — envia de verdade mesmo com
 * NOTIFICACAO_COBRANCA_MODO=simulacao. É o teste ponta a ponta, e por isso
 * exige gesto explícito de um admin.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { notificarCobranca } from "@/lib/notificar-cobranca";
import { avaliarContato, contatoDaUc } from "@/lib/uc-trava-contato";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { forcarReal?: boolean };

  const billing = await prisma.consumerUnitBilling.findUnique({
    where: { id },
    select: { id: true, consumerUnitId: true, asaasChargeId: true, installments: true },
  });
  if (!billing) {
    return NextResponse.json({ error: "Cobrança não encontrada" }, { status: 404 });
  }
  if (!billing.asaasChargeId && !billing.installments) {
    return NextResponse.json(
      {
        error:
          "Esta cobrança ainda não foi emitida — não há boleto nem link de pagamento para avisar o cliente.",
      },
      { status: 409 },
    );
  }

  // 🔒 TRAVA DE CONTATO — reenviar sem contato cadastrado só repetiria a falha.
  const trava = avaliarContato(await contatoDaUc(billing.consumerUnitId));
  if (!trava.liberado) {
    return NextResponse.json({ error: trava.motivo }, { status: 409 });
  }

  const resultado = await notificarCobranca(id, {
    forcarReal: body.forcarReal === true,
  });
  return NextResponse.json(resultado);
}

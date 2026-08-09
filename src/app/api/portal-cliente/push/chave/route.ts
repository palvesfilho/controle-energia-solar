import { NextResponse } from "next/server";
import { getChavePublicaVapid } from "@/lib/push-notificacoes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/portal-cliente/push/chave
 *
 * Chave pública VAPID que o navegador precisa para criar a inscrição.
 *
 * Vem por rota em vez de `NEXT_PUBLIC_`: assim trocar a chave é mudar a env do
 * Railway e reiniciar, sem rebuild. Ela é pública por definição — vai embutida
 * na inscrição que o próprio navegador manda ao serviço de push, e sem a chave
 * privada não envia nada.
 *
 * Ainda assim exige login: o `proxy.ts` protege todo `/api(.*)` que não esteja
 * na lista pública, e esta rota não está. Não é problema — quem chama é o
 * cliente já logado no portal.
 */
export async function GET() {
  const chavePublica = getChavePublicaVapid();
  if (!chavePublica) {
    return NextResponse.json(
      { error: "Notificações push não configuradas neste ambiente" },
      { status: 503 },
    );
  }
  return NextResponse.json({ chavePublica });
}

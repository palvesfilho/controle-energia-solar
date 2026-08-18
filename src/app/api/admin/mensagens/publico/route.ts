import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import {
  opcoesDeFiltro,
  previaPublico,
  type FiltroPublico,
} from "@/lib/mensagens-publico";

export const runtime = "nodejs";

/** GET — valores que existem no banco, para montar os seletores da tela. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "mensagens")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  return NextResponse.json(await opcoesDeFiltro());
}

/**
 * POST — prévia do público. Não envia nada, não grava nada.
 *
 * Existe para o operador ver "142 clientes, 37 com app" ANTES de escrever a
 * campanha. Sem a prévia, o filtro é um chute e a primeira contagem real
 * aparece quando o disparo já saiu.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "mensagens")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const corpo = (await req.json().catch(() => ({}))) as { filtro?: FiltroPublico };
  return NextResponse.json(await previaPublico(corpo.filtro ?? {}));
}

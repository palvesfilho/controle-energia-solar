import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { avaliarAtivacoes } from "@/lib/mensagens-ativacoes";

export const runtime = "nodejs";

/**
 * POST — quantos clientes esta regra alcançaria HOJE, sem enviar nada.
 *
 * É o equivalente da prévia de público da divisão 1, e cumpre o mesmo papel:
 * ninguém deveria ligar um disparo automático sem antes ver o tamanho do que
 * está soltando. Roda também em regra desligada — é justamente antes de ligar
 * que a pergunta importa.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "mensagens")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const [resultado] = await avaliarAtivacoes({ somenteId: id, simular: true });
  if (!resultado) {
    return NextResponse.json({ error: "Ativação não encontrada" }, { status: 404 });
  }
  return NextResponse.json(resultado);
}

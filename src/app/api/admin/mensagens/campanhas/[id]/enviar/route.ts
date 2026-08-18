import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { dispararCampanha } from "@/lib/mensagens-campanha";

export const runtime = "nodejs";

/**
 * Cada push é uma chamada HTTPS ao FCM/Apple; uma base de algumas centenas de
 * clientes não cabe nos 15s padrão. 300s é o teto do plano — acima disso a
 * saída deixa de ser timeout maior e passa a ser fila em background.
 */
export const maxDuration = 300;

/**
 * POST /api/admin/mensagens/campanhas/[id]/enviar
 *
 * ⚠️ TOCA O CELULAR DE CLIENTES REAIS e não tem desfazer. A tela exige
 * confirmação mostrando quantas pessoas vão receber; aqui não há segunda
 * pergunta — chegou, dispara.
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
  try {
    const resultado = await dispararCampanha(id);
    return NextResponse.json(resultado);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha ao disparar a campanha" },
      { status: 400 },
    );
  }
}

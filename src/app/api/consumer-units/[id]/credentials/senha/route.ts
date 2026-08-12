import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";
import { decrypt } from "@/lib/crypto";

/**
 * Revela a senha do portal em texto claro — só sob clique explícito no "olho".
 * A senha NÃO viaja no GET normal de credenciais: quem abre a tela da UC não
 * recebe a senha junto, só quem pede.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const credential = await prisma.cpflCredential.findUnique({
    where: { consumerUnitId: id },
    select: { senhaCpfl: true },
  });

  if (!credential?.senhaCpfl) {
    return NextResponse.json({ error: "Credencial não encontrada" }, { status: 404 });
  }

  let senha: string;
  try {
    senha = decrypt(credential.senhaCpfl);
  } catch {
    // Senha gravada com outra NEXTAUTH_SECRET (ou em texto puro, no legado):
    // não dá pra mostrar, e o robô também não vai conseguir usar.
    return NextResponse.json(
      { error: "Não foi possível decifrar a senha salva — cadastre a senha novamente." },
      { status: 422 }
    );
  }

  console.log(
    `[credenciais] senha da UC ${id} revelada por ${session.user.email ?? session.user.id}`
  );

  return NextResponse.json({ senha });
}

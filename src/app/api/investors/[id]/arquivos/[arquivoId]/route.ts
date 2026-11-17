import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { deleteUploadedFile } from "@/lib/file-storage";

/** DELETE /api/investors/[id]/arquivos/[arquivoId] — remove o arquivo anexado. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; arquivoId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { id, arquivoId } = await params;

  const arquivo = await prisma.investorDocument.findUnique({ where: { id: arquivoId } });
  if (!arquivo || arquivo.investorId !== id) {
    return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  }

  await prisma.investorDocument.delete({ where: { id: arquivoId } });
  // Some do registro primeiro: se o storage falhar, sobra só um arquivo órfão,
  // nunca uma linha apontando para o nada.
  await deleteUploadedFile(arquivo.url).catch((e) =>
    console.warn(`[investidor-arquivos] não apagou ${arquivo.url} do storage:`, e),
  );
  console.info(
    `[investidor-arquivos] ${arquivo.tipo} "${arquivo.fileName}" do investidor ${id} removido por ${session.user.email ?? "?"}`,
  );
  return NextResponse.json({ ok: true });
}

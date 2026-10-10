import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { deleteUploadedFile } from "@/lib/file-storage";
import { validarEntrada } from "@/lib/transferencia-creditos";
import { carregarTransferencias } from "@/lib/transferencia-creditos-db";

/**
 * PATCH  /api/transferencias-credito/[id] — edita a transferência inteira
 *        (cabeçalho + destinos; os destinos são substituídos pela lista nova).
 * DELETE /api/transferencias-credito/[id] — apaga, com o documento anexado.
 */

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { id } = await params;

  const existe = await prisma.creditTransfer.findUnique({ where: { id }, select: { id: true } });
  if (!existe) return NextResponse.json({ error: "Transferência não encontrada" }, { status: 404 });

  const v = validarEntrada(await req.json().catch(() => null));
  if (!v.ok) return NextResponse.json({ error: v.erros.join(" "), erros: v.erros }, { status: 400 });
  const { itens, ...dados } = v.valor;

  await prisma.$transaction([
    prisma.creditTransferItem.deleteMany({ where: { transferId: id } }),
    prisma.creditTransfer.update({
      where: { id },
      data: { ...dados, items: { create: itens } },
    }),
  ]);

  const [t] = await carregarTransferencias({ id });
  return NextResponse.json(t);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { id } = await params;

  const t = await prisma.creditTransfer.findUnique({ where: { id }, select: { documentoUrl: true } });
  if (!t) return NextResponse.json({ error: "Transferência não encontrada" }, { status: 404 });

  await prisma.creditTransfer.delete({ where: { id } });
  await deleteUploadedFile(t.documentoUrl);
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { saveUploadedFile, deleteUploadedFile } from "@/lib/file-storage";

/**
 * POST   /api/transferencias-credito/[id]/documento — anexa (ou troca) o
 *        documento "transferência de créditos" enviado à RGE.
 * DELETE /api/transferencias-credito/[id]/documento — remove o anexo.
 */

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { id } = await params;

  const t = await prisma.creditTransfer.findUnique({ where: { id }, select: { documentoUrl: true } });
  if (!t) return NextResponse.json({ error: "Transferência não encontrada" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Arquivo é obrigatório" }, { status: 400 });
  }

  const saved = await saveUploadedFile(file, `documents/transferencias-credito/${id}`);
  await prisma.creditTransfer.update({
    where: { id },
    data: { documentoUrl: saved.relativePath, documentoNome: file.name },
  });
  // O anterior só sai depois que o novo está gravado e apontado.
  if (t.documentoUrl) await deleteUploadedFile(t.documentoUrl);

  return NextResponse.json({ documentoUrl: saved.relativePath, documentoNome: file.name });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { id } = await params;

  const t = await prisma.creditTransfer.findUnique({ where: { id }, select: { documentoUrl: true } });
  if (!t) return NextResponse.json({ error: "Transferência não encontrada" }, { status: 404 });

  await prisma.creditTransfer.update({ where: { id }, data: { documentoUrl: null, documentoNome: null } });
  await deleteUploadedFile(t.documentoUrl);
  return NextResponse.json({ ok: true });
}

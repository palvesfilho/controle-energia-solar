import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { canAccessSection } from "@/lib/roles";
import { podeSepararLista } from "@/lib/obra-lista-materiais-permissoes";
import { deleteUploadedFile } from "@/lib/file-storage";

export const runtime = "nodejs";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; fotoId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || !canAccessSection(session.user.role, "obra")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { id, fotoId } = await params;

  const foto = await prisma.obraListaMaterialFoto.findUnique({
    where: { id: fotoId },
    include: { lista: { select: { id: true, obraId: true, status: true } } },
  });
  if (!foto || foto.lista.obraId !== id) {
    return NextResponse.json({ error: "Foto não encontrada" }, { status: 404 });
  }
  if (!podeSepararLista(session.user.role, foto.lista.status)) {
    return NextResponse.json(
      { error: "Retirada fechada ou lista não liberada — não dá para remover." },
      { status: 403 }
    );
  }

  await prisma.obraListaMaterialFoto.delete({ where: { id: fotoId } });
  await deleteUploadedFile(foto.relativePath);
  if (foto.uploadId) {
    await prisma.upload
      .delete({ where: { id: foto.uploadId } })
      .catch(() => undefined);
  }

  return NextResponse.json({ ok: true });
}

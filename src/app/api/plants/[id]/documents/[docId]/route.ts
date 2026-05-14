import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { deleteUploadedFile } from "@/lib/file-storage";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id: plantId, docId } = await params;

  const doc = await prisma.plantDocument.findUnique({ where: { id: docId } });
  if (!doc || doc.plantId !== plantId) {
    return NextResponse.json({ error: "Documento não encontrado" }, { status: 404 });
  }

  await deleteUploadedFile(doc.url);
  await prisma.plantDocument.delete({ where: { id: docId } });
  return NextResponse.json({ ok: true });
}

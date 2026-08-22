import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { canAccessSection } from "@/lib/roles";
import { podeSepararLista } from "@/lib/obra-lista-materiais-permissoes";
import { saveUploadedFile } from "@/lib/file-storage";

export const runtime = "nodejs";

const MIMES_OK = new Set(["image/jpeg", "image/png", "image/webp"]);
const TAMANHO_MAX = 12 * 1024 * 1024; // 12 MB — foto de celular cabe folgado
const MAX_FOTOS = 20;

/** Sobe as fotos dos materiais separados (aceita várias no mesmo envio). */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || !canAccessSection(session.user.role, "obra")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { id } = await params;

  const lista = await prisma.obraListaMaterial.findUnique({
    where: { obraId: id },
    include: { _count: { select: { fotos: true } } },
  });
  if (!lista) {
    return NextResponse.json({ error: "Lista não encontrada" }, { status: 404 });
  }
  if (!podeSepararLista(session.user.role, lista.status)) {
    return NextResponse.json(
      {
        error:
          lista.status === "RASCUNHO"
            ? "Lista ainda não liberada."
            : "Retirada já fechada — reabra a lista para anexar fotos.",
      },
      { status: 403 }
    );
  }

  const form = await req.formData();
  const arquivos = form
    .getAll("fotos")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (arquivos.length === 0) {
    return NextResponse.json({ error: "Nenhuma foto enviada" }, { status: 400 });
  }
  if (lista._count.fotos + arquivos.length > MAX_FOTOS) {
    return NextResponse.json(
      { error: `Limite de ${MAX_FOTOS} fotos por lista` },
      { status: 400 }
    );
  }

  const criadas = [];
  for (const file of arquivos) {
    if (!MIMES_OK.has(file.type)) {
      return NextResponse.json(
        { error: `Formato não aceito: ${file.name} (${file.type || "?"})` },
        { status: 400 }
      );
    }
    if (file.size > TAMANHO_MAX) {
      return NextResponse.json(
        { error: `Foto muito grande: ${file.name} (máx. 12 MB)` },
        { status: 400 }
      );
    }

    const salvo = await saveUploadedFile(file, "lista-materiais-fotos");
    const upload = await prisma.upload.create({
      data: {
        fileName: salvo.fileName,
        fileSize: salvo.size,
        filePath: salvo.relativePath,
        mimeType: file.type,
        uploadedById: session.user.id,
      },
    });
    criadas.push(
      await prisma.obraListaMaterialFoto.create({
        data: {
          listaId: lista.id,
          relativePath: salvo.relativePath,
          fileName: salvo.fileName,
          mimeType: file.type,
          fileSize: salvo.size,
          uploadId: upload.id,
        },
      })
    );
  }

  return NextResponse.json({ ok: true, fotos: criadas });
}

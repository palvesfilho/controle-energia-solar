import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { renderToBuffer } from "@react-pdf/renderer";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { canAccessSection } from "@/lib/roles";
import { saveBufferToStorage, deleteUploadedFile } from "@/lib/file-storage";
import {
  MateriaisObraPDF,
  type MaterialItem,
} from "@/components/obra/materiais-obra-pdf";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || !canAccessSection(session.user.role, "obra")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;

  const lista = await prisma.obraListaMaterial.findUnique({
    where: { obraId: id },
    include: {
      obra: true,
      itens: { orderBy: { ordem: "asc" } },
    },
  });
  if (!lista || !lista.obra) {
    return NextResponse.json(
      { error: "Lista ou obra não encontrada — salve a lista antes de gerar o PDF" },
      { status: 404 }
    );
  }

  const materiais: MaterialItem[] = lista.itens.map((it) => ({
    categoria: it.categoria,
    descricao: it.descricao,
    especificacao: it.especificacao,
    quantidade: it.quantidade,
  }));

  const emitidoEm = new Date();
  const pdf = await renderToBuffer(
    MateriaisObraPDF({
      data: {
        obra: {
          nome: lista.obra.nome,
          cliente: lista.obra.cliente,
          local: lista.obra.local,
        },
        responsavel: lista.responsavel,
        numeroSerieInversor: lista.numeroSerieInversor,
        materiais,
        observacoes: lista.observacoes,
        emitidoEm,
      },
    })
  );

  // Remove PDF anterior antes de salvar o novo
  if (lista.pdfRelativePath) {
    await deleteUploadedFile(lista.pdfRelativePath);
  }

  const stamp = emitidoEm.toISOString().replace(/[:.]/g, "-");
  const fileName = `lista-materiais-${lista.obra.id.slice(-6)}-${stamp}.pdf`;
  const { relativePath, absolutePath } = await saveBufferToStorage(
    Buffer.from(pdf),
    "lista-materiais",
    fileName
  );

  const upload = await prisma.upload.create({
    data: {
      fileName,
      fileSize: pdf.length,
      filePath: relativePath,
      mimeType: "application/pdf",
      uploadedById: session.user.id,
    },
  });

  // Substitui Upload anterior (se existir) para manter apenas o mais recente vinculado
  if (lista.pdfUploadId && lista.pdfUploadId !== upload.id) {
    await prisma.upload
      .delete({ where: { id: lista.pdfUploadId } })
      .catch(() => undefined);
  }

  await prisma.obraListaMaterial.update({
    where: { id: lista.id },
    data: {
      pdfRelativePath: relativePath,
      pdfUploadId: upload.id,
      pdfGeradoEm: emitidoEm,
    },
  });

  return NextResponse.json({
    ok: true,
    uploadId: upload.id,
    fileName,
    relativePath,
    absolutePath,
    emitidoEm: emitidoEm.toISOString(),
  });
}

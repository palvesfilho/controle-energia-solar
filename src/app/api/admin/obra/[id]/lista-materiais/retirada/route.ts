import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { renderToBuffer } from "@react-pdf/renderer";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { canAccessSection } from "@/lib/roles";
import {
  podeReabrirLista,
  podeSepararLista,
} from "@/lib/obra-lista-materiais-permissoes";
import {
  saveBufferToStorage,
  deleteUploadedFile,
  readFromStorage,
} from "@/lib/file-storage";
import {
  ComprovanteRetiradaPDF,
  type ComprovanteItem,
} from "@/components/obra/comprovante-retirada-pdf";

export const runtime = "nodejs";

// Quantas fotos entram no PDF. O resto continua na tela — o comprovante avisa
// quantas ficaram de fora em vez de truncar calado.
const FOTOS_NO_PDF = 8;

/**
 * Fecha a retirada: valida assinaturas e responsáveis, emite o comprovante
 * assinado e trava a lista (status RETIRADA).
 */
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
      fotos: { orderBy: { createdAt: "asc" } },
      equipeRetirada: { select: { nome: true } },
    },
  });
  if (!lista || !lista.obra) {
    return NextResponse.json({ error: "Lista não encontrada" }, { status: 404 });
  }

  if (!podeSepararLista(session.user.role, lista.status)) {
    return NextResponse.json(
      {
        error:
          lista.status === "RASCUNHO"
            ? "Lista ainda não liberada."
            : "Retirada já fechada.",
      },
      { status: 403 }
    );
  }

  // O comprovante só vale se disser quem levou e quem entregou — sem isso o
  // documento assinado não prova nada.
  const faltando: string[] = [];
  if (!lista.equipeRetiradaId) faltando.push("empresa/equipe que retirou");
  if (!lista.retiradoPor?.trim()) faltando.push("nome de quem retirou");
  if (!lista.assinaturaEntregouData) faltando.push("assinatura de quem entregou");
  if (!lista.assinaturaRetirouData) faltando.push("assinatura de quem retirou");
  if (faltando.length) {
    return NextResponse.json(
      { error: `Faltam dados para fechar a retirada: ${faltando.join(", ")}.` },
      { status: 400 }
    );
  }

  const itens: ComprovanteItem[] = lista.itens.map((it) => ({
    descricao: it.descricao,
    especificacao: it.especificacao,
    quantidade: it.quantidade,
    quantidadeSeparada: it.quantidadeSeparada,
    separado: it.separado,
  }));

  // Fotos viram data URL — o @react-pdf não busca arquivo do storage sozinho.
  const fotosDataUrls: string[] = [];
  for (const foto of lista.fotos.slice(0, FOTOS_NO_PDF)) {
    const arquivo = await readFromStorage(foto.relativePath);
    if (!arquivo) continue;
    const mime = foto.mimeType ?? "image/jpeg";
    fotosDataUrls.push(`data:${mime};base64,${arquivo.data.toString("base64")}`);
  }
  const fotosNaoEmbutidas = lista.fotos.length - fotosDataUrls.length;

  const retiradaEm = new Date();
  const pdf = await renderToBuffer(
    ComprovanteRetiradaPDF({
      data: {
        obra: {
          nome: lista.obra.nome,
          cliente: lista.obra.cliente,
          local: lista.obra.local,
        },
        responsavel: lista.responsavel,
        numeroSerieInversor: lista.numeroSerieInversor,
        itens,
        observacoes: lista.observacoes,
        observacoesSeparacao: lista.observacoesSeparacao,
        equipeNome: lista.equipeRetirada?.nome ?? null,
        retiradoPor: lista.retiradoPor,
        assinaturaEntregouNome: lista.assinaturaEntregouNome,
        assinaturaEntregouData: lista.assinaturaEntregouData,
        assinaturaRetirouNome: lista.assinaturaRetirouNome,
        assinaturaRetirouData: lista.assinaturaRetirouData,
        fotos: fotosDataUrls,
        fotosNaoEmbutidas: fotosNaoEmbutidas > 0 ? fotosNaoEmbutidas : 0,
        liberadaEm: lista.liberadaEm,
        retiradaEm,
      },
    })
  );

  if (lista.comprovanteRelativePath) {
    await deleteUploadedFile(lista.comprovanteRelativePath);
  }

  const stamp = retiradaEm.toISOString().replace(/[:.]/g, "-");
  const fileName = `comprovante-retirada-${lista.obra.id.slice(-6)}-${stamp}.pdf`;
  const { relativePath } = await saveBufferToStorage(
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
  if (lista.comprovanteUploadId && lista.comprovanteUploadId !== upload.id) {
    await prisma.upload
      .delete({ where: { id: lista.comprovanteUploadId } })
      .catch(() => undefined);
  }

  await prisma.obraListaMaterial.update({
    where: { id: lista.id },
    data: {
      status: "RETIRADA",
      retiradaEm,
      comprovanteRelativePath: relativePath,
      comprovanteUploadId: upload.id,
      comprovanteGeradoEm: retiradaEm,
    },
  });

  return NextResponse.json({
    ok: true,
    relativePath,
    retiradaEm: retiradaEm.toISOString(),
    status: "RETIRADA",
  });
}

/**
 * Reabre uma retirada já fechada (volta para LIBERADA). Só o trio
 * administrativo — o comprovante anterior é apagado para não circular um
 * documento que já não bate com o que está no sistema.
 */
export async function DELETE(
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
  });
  if (!lista) {
    return NextResponse.json({ error: "Lista não encontrada" }, { status: 404 });
  }
  if (!podeReabrirLista(session.user.role, lista.status)) {
    return NextResponse.json(
      { error: "Só ADMIN, GESTOR ou FINANCEIRO reabrem uma retirada fechada." },
      { status: 403 }
    );
  }

  if (lista.comprovanteRelativePath) {
    await deleteUploadedFile(lista.comprovanteRelativePath);
  }
  if (lista.comprovanteUploadId) {
    await prisma.upload
      .delete({ where: { id: lista.comprovanteUploadId } })
      .catch(() => undefined);
  }

  await prisma.obraListaMaterial.update({
    where: { id: lista.id },
    data: {
      status: "LIBERADA",
      retiradaEm: null,
      comprovanteRelativePath: null,
      comprovanteUploadId: null,
      comprovanteGeradoEm: null,
    },
  });

  return NextResponse.json({ ok: true, status: "LIBERADA" });
}

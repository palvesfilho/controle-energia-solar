import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { saveUploadedFile } from "@/lib/file-storage";
import {
  ehTipoArquivoInvestidor,
  formatoAceito,
  TAMANHO_MAXIMO_ARQUIVO_INVESTIDOR,
} from "@/lib/investidor-arquivos";

/** GET /api/investors/[id]/arquivos — arquivos anexados ao investidor, mais novo primeiro. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { id } = await params;
  const arquivos = await prisma.investorDocument.findMany({
    where: { investorId: id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(arquivos);
}

/**
 * POST /api/investors/[id]/arquivos — anexa um arquivo.
 * multipart: arquivo, tipo (CONTRATO | IDENTIDADE | ...), descricao (opcional)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { id } = await params;

  const investidor = await prisma.investor.findUnique({ where: { id }, select: { id: true } });
  if (!investidor) {
    return NextResponse.json({ error: "Investidor não encontrado." }, { status: 404 });
  }

  const form = await req.formData().catch(() => null);
  const arquivo = form?.get("arquivo");
  const tipo = form?.get("tipo");
  const descricaoBruta = form?.get("descricao");
  const descricao =
    typeof descricaoBruta === "string" && descricaoBruta.trim()
      ? descricaoBruta.trim().slice(0, 200)
      : null;

  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return NextResponse.json({ error: "Envie o arquivo." }, { status: 400 });
  }
  if (!ehTipoArquivoInvestidor(tipo)) {
    return NextResponse.json({ error: "Tipo de documento desconhecido." }, { status: 400 });
  }
  if (arquivo.size > TAMANHO_MAXIMO_ARQUIVO_INVESTIDOR) {
    return NextResponse.json({ error: "Arquivo maior que 20 MB." }, { status: 400 });
  }
  const cabecalho = new Uint8Array(await arquivo.slice(0, 8).arrayBuffer());
  if (!formatoAceito(cabecalho)) {
    return NextResponse.json(
      { error: "Formato não aceito. Envie PDF, JPG, PNG ou Word (DOC/DOCX)." },
      { status: 400 },
    );
  }

  const salvo = await saveUploadedFile(arquivo, `investidor-documentos/${id}`);
  const criado = await prisma.investorDocument.create({
    data: {
      investorId: id,
      tipo,
      descricao,
      url: salvo.relativePath,
      fileName: arquivo.name,
      size: salvo.size,
      uploadedById: session.user.id,
    },
  });
  return NextResponse.json(criado, { status: 201 });
}

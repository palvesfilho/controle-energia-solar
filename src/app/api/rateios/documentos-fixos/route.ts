import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { deleteUploadedFile, saveUploadedFile } from "@/lib/file-storage";
import {
  DOCS_FIXOS,
  lerDocFixo,
  settingDoDocFixo,
  tipoDoArquivo,
  type ChaveDocFixo,
  type DocFixoGravado,
} from "@/lib/rateio-pacote-rge";

const TAMANHO_MAXIMO = 20 * 1024 * 1024;

/**
 * POST /api/rateios/documentos-fixos — envia (ou troca) um dos três documentos
 * da associação que acompanham todo rateio: CNH do Paulo, cartão CNPJ e
 * constituição da associação. Ficam em `AppSetting`, um por chave; não há GET
 * porque a conferência do pacote já devolve o estado dos três.
 *
 * multipart: chave (cnh | cartao_cnpj | constituicao) + arquivo (PDF, JPG ou PNG)
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  const chave = form?.get("chave");
  const arquivo = form?.get("arquivo");

  const doc = DOCS_FIXOS.find((d) => d.chave === chave);
  if (!doc) {
    return NextResponse.json({ error: "Documento desconhecido." }, { status: 400 });
  }
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return NextResponse.json({ error: "Envie o arquivo." }, { status: 400 });
  }
  if (arquivo.size > TAMANHO_MAXIMO) {
    return NextResponse.json({ error: "Arquivo maior que 20 MB." }, { status: 400 });
  }
  // Pelo conteúdo, não pela extensão: o pacote só sabe juntar estes três formatos,
  // e um arquivo aceito aqui e recusado na montagem seria falha tardia e calada.
  const inicio = Buffer.from(await arquivo.slice(0, 8).arrayBuffer());
  if (!tipoDoArquivo(inicio)) {
    return NextResponse.json(
      { error: "Formato não aceito. Envie PDF, JPG ou PNG." },
      { status: 400 },
    );
  }

  const key = settingDoDocFixo(doc.chave as ChaveDocFixo);
  const anterior = lerDocFixo(
    (await prisma.appSetting.findUnique({ where: { key } }))?.value,
  );

  const salvo = await saveUploadedFile(arquivo, "rateio-documentos-fixos");
  const gravado: DocFixoGravado = {
    path: salvo.relativePath,
    nome: arquivo.name,
    enviadoEm: new Date().toISOString(),
  };
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value: JSON.stringify(gravado) },
    update: { value: JSON.stringify(gravado) },
  });
  // Só depois de gravar o novo: se algo falhar antes, o antigo continua valendo.
  if (anterior && anterior.path !== gravado.path) await deleteUploadedFile(anterior.path);

  return NextResponse.json({ ok: true, chave: doc.chave, nome: gravado.nome });
}

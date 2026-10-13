import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { saveUploadedFile } from "@/lib/file-storage";
import { tipoDoArquivo } from "@/lib/rateio-pacote-rge";
import { colunasDoDocumento } from "@/lib/documentos-adesao";

const TAMANHO_MAXIMO = 20 * 1024 * 1024;

/**
 * POST /api/consumer-units/[id]/documentos/[tipo] — troca (ou anexa) um dos
 * documentos da adesão guardados na UC.
 *
 * Existe porque o único caminho de entrada desses arquivos era a cópia da
 * adesão do CRM, feita uma vez no cadastro. O cliente que altera o contrato
 * social depois de assinar ficava com o documento velho aqui para sempre.
 *
 * O cartão CNPJ NÃO passa por aqui: ele tem rota própria (`../cartao-cnpj`),
 * que confere o CNPJ e a data de emissão do arquivo.
 *
 * UM ARQUIVO, N UCs: as UCs da mesma adesão apontam para o mesmo caminho
 * ([[crm-copia-documentos]]). A troca vale para todas as que apontavam para o
 * arquivo antigo — senão a LABIMED ficaria com 1 UC atualizada e 10 com o
 * contrato social velho. O arquivo antigo NÃO é apagado: outro cadastro (o
 * investidor da mesma adesão) pode apontar para ele, e é o que permite desfazer
 * uma troca feita na ficha errada.
 *
 * multipart: arquivo (PDF, JPG ou PNG)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; tipo: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id, tipo } = await params;
  const colunas = tipo === "cartao_cnpj" ? null : colunasDoDocumento(tipo);
  if (!colunas) {
    return NextResponse.json({ error: "Tipo de documento desconhecido." }, { status: 400 });
  }

  const uc = (await prisma.consumerUnit.findUnique({
    where: { id },
    select: { id: true, [colunas.path]: true } as Record<string, boolean>,
  })) as Record<string, unknown> | null;
  if (!uc) {
    return NextResponse.json({ error: "Unidade consumidora não encontrada." }, { status: 404 });
  }

  const form = await req.formData().catch(() => null);
  const arquivo = form?.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return NextResponse.json({ error: "Envie o arquivo." }, { status: 400 });
  }
  if (arquivo.size > TAMANHO_MAXIMO) {
    return NextResponse.json({ error: "Arquivo maior que 20 MB." }, { status: 400 });
  }
  const conteudo = Buffer.from(await arquivo.arrayBuffer());
  if (!tipoDoArquivo(conteudo)) {
    return NextResponse.json(
      { error: "Formato não aceito. Envie PDF, JPG ou PNG." },
      { status: 400 },
    );
  }

  const antigo = typeof uc[colunas.path] === "string" ? (uc[colunas.path] as string) : null;
  const salvo = await saveUploadedFile(arquivo, `uc-documentos/${id}`);
  const dados = { [colunas.path]: salvo.relativePath, [colunas.nome]: arquivo.name };

  const atualizadas = antigo
    ? // origem-ok: troca de documento pelo CAMINHO do arquivo, vale para toda UC que aponta para ele.
      await prisma.consumerUnit.updateMany({
        where: { OR: [{ id }, { [colunas.path]: antigo }] },
        data: dados,
      })
    : await prisma.consumerUnit.updateMany({ where: { id }, data: dados });

  // Não há auditoria de campo na UC; o caminho antigo fica ao menos no log,
  // que é de onde se recupera o arquivo anterior se a troca foi engano.
  console.info(
    `[uc-documentos] ${colunas.rotulo} da UC ${id} trocado por ${session.user.email ?? "?"}: ` +
      `${antigo ?? "(vazio)"} -> ${salvo.relativePath} (${atualizadas.count} UC(s))`,
  );

  return NextResponse.json({
    ok: true,
    substituiu: antigo != null,
    ucsAtualizadas: atualizadas.count,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { saveUploadedFile } from "@/lib/file-storage";
import { lerCartaoCnpjDoArquivo, tipoDoArquivo } from "@/lib/rateio-pacote-rge";
import { validadeCartaoCnpj } from "@/lib/cartao-cnpj";

const TAMANHO_MAXIMO = 20 * 1024 * 1024;

/**
 * POST /api/consumer-units/[id]/cartao-cnpj — troca o cartão CNPJ guardado na
 * UC por um recém-emitido na Receita.
 *
 * Existe porque a RGE recusa cartão com mais de 6 meses e o único caminho de
 * entrada do documento era a cópia da adesão do CRM, feita uma vez. O operador
 * emite o comprovante no site da Receita (há captcha, não dá para automatizar)
 * e sobe aqui.
 *
 * UM ARQUIVO, N UCs: o titular com várias UCs tem um cartão só, e todas apontam
 * para o mesmo caminho ([[crm-copia-documentos]]). A troca vale para todas as
 * que apontavam para o arquivo antigo — senão a LABIMED ficaria com 1 UC em dia
 * e 10 vencidas. O arquivo antigo NÃO é apagado: outro cadastro (o investidor
 * da mesma adesão) pode apontar para ele.
 *
 * multipart: arquivo (PDF, JPG ou PNG)
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
  const uc = await prisma.consumerUnit.findUnique({
    where: { id },
    select: { id: true, cpfCnpj: true, docCartaoCnpj: true },
  });
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

  const lido = await lerCartaoCnpjDoArquivo(conteudo);

  // Cartão de OUTRA empresa é o erro fácil de cometer com vários CNPJs abertos
  // no navegador. Compara pela raiz (8 dígitos): matriz e filial são a mesma
  // empresa. Só recusa quando os dois lados são conhecidos — sem dado, não acusa.
  const cnpjDaUc = (uc.cpfCnpj ?? "").replace(/\D/g, "");
  if (lido.cnpj && cnpjDaUc.length === 14 && lido.cnpj.slice(0, 8) !== cnpjDaUc.slice(0, 8)) {
    return NextResponse.json(
      {
        error: `Este cartão é do CNPJ ${lido.cnpj}, e a UC é do CNPJ ${cnpjDaUc}. Confira o arquivo.`,
      },
      { status: 409 },
    );
  }

  const salvo = await saveUploadedFile(arquivo, `uc-documentos/${uc.id}`);
  const dados = { docCartaoCnpj: salvo.relativePath, docCartaoCnpjNome: arquivo.name };

  const atualizadas = uc.docCartaoCnpj
    ? // origem-ok: troca de documento pelo CAMINHO do arquivo, vale para toda UC que aponta para ele.
      await prisma.consumerUnit.updateMany({
        where: { OR: [{ id: uc.id }, { docCartaoCnpj: uc.docCartaoCnpj }] },
        data: dados,
      })
    : await prisma.consumerUnit.updateMany({ where: { id: uc.id }, data: dados });

  return NextResponse.json({
    ok: true,
    ucsAtualizadas: atualizadas.count,
    validade: validadeCartaoCnpj(lido.emitidoEm),
  });
}

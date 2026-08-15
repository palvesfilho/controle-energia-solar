import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { canAccessSection } from "@/lib/roles";
import { corrigirMojibake, listarDocumentosDaAdesao } from "@/lib/crm-supabase";

/**
 * Marca uma UC assinada como cadastrada nesta ponta, ou como ignorada.
 *
 * A decisão é por UC e não pela venda: numa adesão com quatro UCs, três podem
 * já estar cadastradas e a quarta não. Era isso que a fila por proposta não
 * conseguia representar.
 *
 * `processadaEm` trava a linha: o sync continua atualizando os dados vindos do
 * CRM, mas não volta a UC para PENDENTE.
 */
const SITUACOES_MANUAIS = new Set(["CONCLUIDA", "IGNORADA", "PENDENTE"]);

/** Uma UC assinada, para o formulário de cadastro chegar pré-preenchido. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !canAccessSection(session.user.role, "crmIntegracao")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const linha = await prisma.crmUcImportada.findUnique({ where: { id } });
  if (!linha) {
    return NextResponse.json({ error: "UC do CRM não encontrada." }, { status: 404 });
  }

  // Anexos junto, para o painel do formulário. Se o CRM estiver fora, o
  // cadastro ainda acontece — só sem as fichas de documento.
  let documentos: unknown[] = [];
  let avisoDocumentos: string | null = null;
  try {
    const docs = await listarDocumentosDaAdesao(linha.adesaoIdCrm);
    documentos = docs.map((d) => ({
      id: d.id,
      categoria: d.categoria,
      nomeArquivo: corrigirMojibake(d.nome_arquivo),
      tamanho: d.tamanho,
    }));
  } catch (err) {
    avisoDocumentos = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/crm/ucs/[id]] documentos:", err);
  }

  // Consumidor já existente com o mesmo CPF/CNPJ: evita criar duplicata.
  const digitos = (linha.clienteDocumento ?? "").replace(/\D/g, "");
  const consumidor = digitos
    ? await prisma.consumer.findFirst({
        where: { OR: [{ cpfCnpj: { contains: digitos } }, { document: { contains: digitos } }] },
        select: { id: true, name: true },
      })
    : null;

  return NextResponse.json({ ...linha, documentos, avisoDocumentos, consumidor });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !canAccessSection(session.user.role, "crmIntegracao")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const situacao = String(body.situacao ?? "").toUpperCase();
  if (!SITUACOES_MANUAIS.has(situacao)) {
    return NextResponse.json(
      { error: "Situação inválida. Use CONCLUIDA, IGNORADA ou PENDENTE." },
      { status: 400 },
    );
  }

  try {
    const linha = await prisma.crmUcImportada.update({
      where: { id },
      data: {
        situacao,
        // O vínculo com a UC cadastrada aqui, quando informado.
        consumerUnitId:
          typeof body.consumerUnitId === "string" ? body.consumerUnitId : undefined,
        processadaEm: situacao === "PENDENTE" ? null : new Date(),
      },
    });
    return NextResponse.json(linha);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[PATCH /api/crm/ucs/[id]] erro:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

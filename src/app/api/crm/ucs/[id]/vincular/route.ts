import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { canAccessSection } from "@/lib/roles";
import { copiarDocumentosDaAdesao } from "@/lib/crm-copia-documentos";

/**
 * Liga uma UC assinada no CRM à ConsumerUnit cadastrada aqui, copia os
 * documentos da adesão para dentro dela e tira a linha da fila.
 *
 * Serve os dois caminhos da tela:
 *   "Cadastrar UC"  — o formulário cria a ConsumerUnit e chama isto com o id novo;
 *   "Já cadastrei"  — a UC já existia, chama isto com o id encontrado pelo código.
 *
 * A cópia é o passo que faz o documento sobreviver a uma faxina no CRM. Se ela
 * falhar, o vínculo NÃO é desfeito — a UC segue cadastrada e a resposta diz o
 * que não veio, para dar para reexecutar. Vínculo perdido é pior que anexo
 * faltando, e anexo faltando em silêncio é pior que os dois.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !canAccessSection(session.user.role, "crmIntegracao")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const consumerUnitId = typeof body.consumerUnitId === "string" ? body.consumerUnitId : null;
  if (!consumerUnitId) {
    return NextResponse.json({ error: "consumerUnitId é obrigatório." }, { status: 400 });
  }

  const linha = await prisma.crmUcImportada.findUnique({ where: { id } });
  if (!linha) {
    return NextResponse.json({ error: "UC do CRM não encontrada." }, { status: 404 });
  }

  const uc = await prisma.consumerUnit.findUnique({
    where: { id: consumerUnitId },
    select: { id: true, codigoUc: true },
  });
  if (!uc) {
    return NextResponse.json({ error: "Unidade consumidora não encontrada." }, { status: 404 });
  }

  // O vínculo primeiro: é o que não pode se perder.
  await prisma.crmUcImportada.update({
    where: { id },
    data: { situacao: "CONCLUIDA", consumerUnitId, processadaEm: new Date() },
  });

  let copia;
  try {
    copia = await copiarDocumentosDaAdesao(linha.adesaoIdCrm);
    await prisma.consumerUnit.update({
      where: { id: consumerUnitId },
      data: copia.campos,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/crm/ucs/[id]/vincular] cópia:", err);
    return NextResponse.json({
      ok: true,
      vinculada: true,
      documentos: { copiados: [], reaproveitados: [], falhas: [msg] },
      aviso: "UC vinculada, mas nenhum documento foi copiado.",
    });
  }

  return NextResponse.json({
    ok: true,
    vinculada: true,
    consumerUnitId,
    documentos: {
      copiados: copia.copiados,
      reaproveitados: copia.reaproveitados,
      falhas: copia.falhas,
    },
  });
}

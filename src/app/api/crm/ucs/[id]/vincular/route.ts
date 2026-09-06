import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { canAccessSection } from "@/lib/roles";
import { copiarDocumentosDaAdesao } from "@/lib/crm-copia-documentos";
import {
  contatoUtilizavelDaAdesao,
  preencherContatoDoConsumer,
  preencherContatoDoInvestidor,
} from "@/lib/crm-contato-cadastro";

/**
 * Liga uma UC assinada no CRM à ConsumerUnit cadastrada aqui, copia os
 * documentos da adesão para dentro dela, traz o CONTATO do cliente e tira a
 * linha da fila.
 *
 * Serve os dois caminhos da tela:
 *   "Cadastrar UC"  — o formulário cria a ConsumerUnit e chama isto com o id novo;
 *   "Já cadastrei"  — a UC já existia, chama isto com o id encontrado pelo código.
 *
 * A cópia é o passo que faz o documento sobreviver a uma faxina no CRM. Se ela
 * falhar, o vínculo NÃO é desfeito — a UC segue cadastrada e a resposta diz o
 * que não veio, para dar para reexecutar. Vínculo perdido é pior que anexo
 * faltando, e anexo faltando em silêncio é pior que os dois.
 *
 * 🔑 **O contato entra aqui desde 06/09/2026.** Email e telefone chegavam na
 * linha do CRM, apareciam na fila e paravam ali: o formulário de UC só ESCOLHE
 * um cliente já cadastrado e nunca escrevia nele. Resultado — 16 clientes sem
 * contato nenhum, todos com email e telefone parados na adesão, e cobrança
 * bloqueada pela trava. `lib/crm-contato.ts` só preenche campo VAZIO; contato
 * que alguém já curou não é sobrescrito. Ver [[project_notificacao_cobranca_email_whatsapp]].
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
  // Proprietário de usina não gera UC: os documentos vão para o investidor.
  const investorId = typeof body.investorId === "string" ? body.investorId : null;

  if (!consumerUnitId && !investorId) {
    return NextResponse.json(
      { error: "Informe consumerUnitId ou investorId." },
      { status: 400 },
    );
  }

  const linha = await prisma.crmUcImportada.findUnique({ where: { id } });
  if (!linha) {
    return NextResponse.json({ error: "UC do CRM não encontrada." }, { status: 404 });
  }

  if (consumerUnitId) {
    const uc = await prisma.consumerUnit.findUnique({
      where: { id: consumerUnitId },
      select: { id: true },
    });
    if (!uc) {
      return NextResponse.json({ error: "Unidade consumidora não encontrada." }, { status: 404 });
    }
  }
  if (investorId) {
    const inv = await prisma.investor.findUnique({
      where: { id: investorId },
      select: { id: true },
    });
    if (!inv) {
      return NextResponse.json({ error: "Investidor não encontrado." }, { status: 404 });
    }
  }

  // O vínculo primeiro: é o que não pode se perder.
  await prisma.crmUcImportada.update({
    where: { id },
    data: { situacao: "CONCLUIDA", consumerUnitId, processadaEm: new Date() },
  });

  // O contato antes dos documentos: é uma escrita curta, não depende do R2 e
  // não pode ser vítima de uma falha de download lá adiante.
  const contato = contatoUtilizavelDaAdesao(linha.clienteEmail, linha.clienteTelefone);
  let contatoGravado = { emailGravado: null as string | null, telefoneGravado: null as string | null };
  try {
    if (consumerUnitId) {
      const uc = await prisma.consumerUnit.findUnique({
        where: { id: consumerUnitId },
        select: { consumerId: true },
      });
      if (uc?.consumerId) {
        contatoGravado = await preencherContatoDoConsumer(uc.consumerId, contato);
      }
    }
    if (investorId) {
      contatoGravado = await preencherContatoDoInvestidor(investorId, contato);
    }
  } catch (err) {
    // Contato é complemento: não desfaz o vínculo nem impede os documentos.
    console.error("[POST /api/crm/ucs/[id]/vincular] contato:", err);
  }

  let copia;
  try {
    copia = await copiarDocumentosDaAdesao(linha.adesaoIdCrm);
    if (consumerUnitId) {
      await prisma.consumerUnit.update({ where: { id: consumerUnitId }, data: copia.campos });
    }
    if (investorId) {
      await prisma.investor.update({ where: { id: investorId }, data: copia.campos });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/crm/ucs/[id]/vincular] cópia:", err);
    return NextResponse.json({
      ok: true,
      vinculada: true,
      contato: contatoGravado,
      documentos: { copiados: [], reaproveitados: [], falhas: [msg] },
      aviso: "UC vinculada, mas nenhum documento foi copiado.",
    });
  }

  return NextResponse.json({
    ok: true,
    vinculada: true,
    consumerUnitId,
    investorId,
    contato: contatoGravado,
    documentos: {
      copiados: copia.copiados,
      reaproveitados: copia.reaproveitados,
      falhas: copia.falhas,
    },
  });
}

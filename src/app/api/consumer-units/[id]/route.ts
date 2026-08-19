import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";
import { normalizeCodigoUc } from "@/lib/uc-codigo";
import {
  avisosDaPropagacao,
  propagarCodigosDaConsumerUnit,
} from "@/lib/codigo-uc-propagacao";
import { avaliarExclusaoUc } from "@/lib/consumer-unit-exclusao";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const unit = await prisma.consumerUnit.findUnique({
    where: { id },
    include: {
      consumer: { select: { id: true, name: true } },
      plant: { select: { id: true, name: true } },
      // Auditoria do liga/desliga — mesma leitura da tela da usina.
      statusChanges: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });

  if (!unit) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(unit);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  const existing = await prisma.consumerUnit.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const codigoUc = normalizeCodigoUc(body.codigoUc);
  const codigoUcAntigo = normalizeCodigoUc(body.codigoUcAntigo);

  // Verifica código duplicado
  if (codigoUc && codigoUc !== existing.codigoUc) {
    const dup = await prisma.consumerUnit.findUnique({
      where: { codigoUc },
    });
    if (dup) {
      return NextResponse.json(
        { error: "Já existe uma UC com esse código" },
        { status: 400 }
      );
    }
  }

  await prisma.consumerUnit.update({
    where: { id },
    data: {
      ...(body.nome !== undefined && { nome: body.nome }),
      ...(codigoUc ? { codigoUc } : {}),
      ...(body.codigoUcAntigo !== undefined && { codigoUcAntigo: codigoUcAntigo || null }),
      ...(body.consumerId !== undefined && { consumerId: body.consumerId || null }),
      ...(body.plantId !== undefined && { plantId: body.plantId || null }),
      ...(body.cpfCnpj !== undefined && { cpfCnpj: body.cpfCnpj || null }),
      ...(body.distribuidora !== undefined && { distribuidora: body.distribuidora || null }),
      ...(body.grupo !== undefined && { grupo: body.grupo || null }),
      ...(body.subGrupo !== undefined && { subGrupo: body.subGrupo || null }),
      ...(body.modalidade !== undefined && { modalidade: body.modalidade || null }),
      ...(body.consumoMedio !== undefined && {
        consumoMedio: body.consumoMedio ? Number(body.consumoMedio) : null,
      }),
      ...(body.cep !== undefined && { cep: body.cep || null }),
      ...(body.logradouro !== undefined && { logradouro: body.logradouro || null }),
      ...(body.complemento !== undefined && { complemento: body.complemento || null }),
      ...(body.numero !== undefined && { numero: body.numero || null }),
      ...(body.cidade !== undefined && { cidade: body.cidade || null }),
      ...(body.consultor !== undefined && { consultor: body.consultor || null }),
      ...(body.comissao !== undefined && { comissao: body.comissao || null }),
      ...(body.metodoPagamento !== undefined && { metodoPagamento: body.metodoPagamento || null }),
      ...(body.regraRemuneracao !== undefined && { regraRemuneracao: body.regraRemuneracao || null }),
      ...(body.percentCompensado !== undefined && {
        percentCompensado: body.percentCompensado ? Number(body.percentCompensado) : null,
      }),
      ...(body.percentBandeira !== undefined && {
        percentBandeira: body.percentBandeira ? Number(body.percentBandeira) : null,
      }),
      ...(body.regraVencimento !== undefined && { regraVencimento: body.regraVencimento || null }),
      ...(body.valorVencimento !== undefined && {
        valorVencimento: body.valorVencimento ? Number(body.valorVencimento) : null,
      }),
      ...(body.statusContrato !== undefined && { statusContrato: body.statusContrato || null }),
      ...(body.vigenciaCompensacao !== undefined && { vigenciaCompensacao: body.vigenciaCompensacao || null }),
      ...(body.dataInicioContrato !== undefined && { dataInicioContrato: body.dataInicioContrato ? new Date(body.dataInicioContrato) : null }),
      ...(body.loginDistribuidora !== undefined && { loginDistribuidora: body.loginDistribuidora || null }),
      ...(body.senhaDistribuidora !== undefined && { senhaDistribuidora: body.senhaDistribuidora || null }),
      ...(body.temGeracaoPropria !== undefined && { temGeracaoPropria: !!body.temGeracaoPropria }),
      // `active` NÃO entra aqui de propósito: ativar/desativar exige motivo e
      // grava auditoria, e isso mora em POST /api/consumer-units/[id]/status.
      // Mesma regra da usina — aceitar o campo neste PUT genérico abriria um
      // caminho sem rastro.
    },
  });

  // Sentido inverso da propagação: corrigir o código aqui também acerta a ficha
  // do proprietário Brasil Solar. Sem os dois sentidos a correção falha calada
  // de um dos lados — [[feedback_correcao_pela_metade_falha_calada]].
  let avisos: string[] = [];
  try {
    avisos = avisosDaPropagacao(await propagarCodigosDaConsumerUnit(id));
  } catch (e) {
    console.error("[PUT /consumer-units] propagação de código falhou:", e);
    avisos = [
      "A UC foi salva, mas o código não pôde ser replicado no cadastro Brasil Solar. Confira lá.",
    ];
  }

  return NextResponse.json({ success: true, avisos });
}

// Exclusão permanente da UC. Recusa (409) enquanto existir histórico
// financeiro/energético apontando pra ela — nesses casos o caminho é desativar
// (POST /api/consumer-units/[id]/status), não apagar.
//
// ⚠️ Sem esta guarda o delete PASSAVA: as faturas, os faturamentos e os itens de
// rateio da UC são `onDelete: Cascade`, então o banco os apagava em silêncio,
// sem erro nenhum. Mesma proteção que a usina já tinha.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const impacto = await avaliarExclusaoUc(id);
  if (!impacto) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (impacto.bloqueios.length > 0) {
    return NextResponse.json(
      {
        error: "UC possui histórico e não pode ser excluída",
        details: impacto.bloqueios,
      },
      { status: 409 },
    );
  }

  try {
    await prisma.consumerUnit.delete({ where: { id } });
  } catch {
    // Rede de segurança: alguma relação nova sem cascade que o preview ainda
    // não conhece. Melhor 409 legível do que 500.
    return NextResponse.json(
      {
        error: "UC possui vínculos e não pode ser excluída",
        details: ["Registros vinculados impedem a exclusão"],
      },
      { status: 409 },
    );
  }

  return NextResponse.json({ message: "UC removida com sucesso" });
}

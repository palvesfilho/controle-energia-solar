import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { normalizarNomeEmpresa } from "@/lib/marca-inversor";

/**
 * Renomear uma empresa executora — e, quando o novo nome colide com outra que já
 * existe, JUNTAR as duas.
 *
 * 🔑 Por que renomear sozinho não basta: a deduplicação no cadastro só pega nome
 * idêntico (ignorando caixa e acento). "Solar Sul Engenharia" e "Solar Sul Eng."
 * passam como empresas diferentes, cada uma com seus clientes. Renomear a segunda
 * para o nome da primeira esbarraria no índice único — ou, sem o índice, deixaria
 * duas entradas idênticas com os clientes ainda divididos. Nos dois casos o
 * problema que motivou o rename continua de pé.
 *
 * Por isso a colisão não é erro: é o próprio pedido de junção. A API só não faz
 * isso calada — devolve 409 com quantos clientes seriam movidos, e a tela
 * confirma antes de reenviar com `merge: true`.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const nome = String(body?.nome ?? "").trim();
  const merge = body?.merge === true;

  if (nome.length < 2) {
    return NextResponse.json(
      { error: "Informe o nome da empresa (mínimo 2 caracteres)" },
      { status: 400 },
    );
  }

  const atual = await prisma.empresaTerceira.findUnique({
    where: { id },
    select: { id: true, nome: true },
  });
  if (!atual) {
    return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });
  }

  const nomeNormalizado = normalizarNomeEmpresa(nome);

  const colisao = await prisma.empresaTerceira.findUnique({
    where: { nomeNormalizado },
    select: { id: true, nome: true, _count: { select: { proprietarios: true } } },
  });

  // Mesma empresa: é só troca de grafia/acento ("solar sul" → "Solar Sul").
  if (!colisao || colisao.id === atual.id) {
    const empresa = await prisma.empresaTerceira.update({
      where: { id },
      data: { nome, nomeNormalizado },
      select: { id: true, nome: true },
    });
    return NextResponse.json({ empresa, juntou: false });
  }

  const meus = await prisma.brasilSolarProprietario.count({
    where: { empresaTerceiraId: atual.id },
  });

  if (!merge) {
    return NextResponse.json(
      {
        error: "NOME_JA_EXISTE",
        alvo: { id: colisao.id, nome: colisao.nome, clientes: colisao._count.proprietarios },
        origem: { id: atual.id, nome: atual.nome, clientes: meus },
      },
      { status: 409 },
    );
  }

  // Junção: os clientes desta empresa passam para a que já existe, e a duplicata
  // é apagada. Em transação — mover sem apagar deixaria uma empresa órfã na
  // lista, e apagar sem mover derrubaria o vínculo dos clientes para null.
  await prisma.$transaction([
    prisma.brasilSolarProprietario.updateMany({
      where: { empresaTerceiraId: atual.id },
      data: { empresaTerceiraId: colisao.id },
    }),
    prisma.empresaTerceira.delete({ where: { id: atual.id } }),
  ]);

  return NextResponse.json({
    empresa: { id: colisao.id, nome: colisao.nome },
    juntou: true,
    clientesMovidos: meus,
  });
}

/**
 * Arquiva a empresa (não apaga). Os clientes já vinculados continuam apontando
 * para ela — o histórico não pode sumir porque alguém tirou a empresa da lista.
 * Ela só deixa de aparecer para novas escolhas.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const empresa = await prisma.empresaTerceira.update({
    where: { id },
    data: { active: false },
    select: { id: true, nome: true },
  });

  return NextResponse.json({ empresa, arquivada: true });
}

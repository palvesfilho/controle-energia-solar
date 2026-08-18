import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * GET /api/admin/mensagens/campanhas/[id]
 *
 * Relatório do disparo: quem recebeu, quem abriu, quem tocou no botão. A lista
 * de interessados é a razão de a tela existir — é dela que sai a ligação do
 * pós-venda no dia seguinte.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "mensagens")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const campanha = await prisma.campanha.findUnique({
    where: { id },
    include: {
      envios: {
        orderBy: [{ interesseEm: "desc" }, { lidoEm: "desc" }],
        include: {
          proprietario: {
            select: { id: true, nome: true, telefone: true, email: true, cidade: true, uf: true },
          },
        },
      },
    },
  });

  if (!campanha) {
    return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 });
  }

  return NextResponse.json({
    id: campanha.id,
    nome: campanha.nome,
    titulo: campanha.titulo,
    mensagem: campanha.mensagem,
    ctaLabel: campanha.ctaLabel,
    canal: campanha.canal,
    status: campanha.status,
    publicoFiltro: campanha.publicoFiltro,
    publicoResumo: campanha.publicoResumo,
    totalPublico: campanha.totalPublico,
    totalComApp: campanha.totalComApp,
    totalAparelhos: campanha.totalAparelhos,
    criadoPorNome: campanha.criadoPorNome,
    enviadaEm: campanha.enviadaEm,
    createdAt: campanha.createdAt,
    envios: campanha.envios.map((e) => ({
      id: e.id,
      proprietarioId: e.proprietario.id,
      nome: e.proprietario.nome,
      telefone: e.proprietario.telefone,
      email: e.proprietario.email,
      cidade: e.proprietario.cidade,
      uf: e.proprietario.uf,
      aparelhos: e.aparelhos,
      pushStatus: e.pushStatus,
      erro: e.erro,
      lidoEm: e.lidoEm,
      interesseEm: e.interesseEm,
      dispensadoEm: e.dispensadoEm,
      atendidoEm: e.atendidoEm,
      atendidoPorNome: e.atendidoPorNome,
    })),
  });
}

/**
 * DELETE — só apaga RASCUNHO. Campanha enviada é histórico do que o cliente
 * recebeu: apagar deixaria o interessado sem contexto na hora da ligação.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "mensagens")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const campanha = await prisma.campanha.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!campanha) {
    return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 });
  }
  if (campanha.status !== "RASCUNHO") {
    return NextResponse.json(
      { error: "Só é possível excluir campanha em rascunho." },
      { status: 400 },
    );
  }

  await prisma.campanha.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

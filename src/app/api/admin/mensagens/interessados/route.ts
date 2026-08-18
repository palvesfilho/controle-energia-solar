import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * GET /api/admin/mensagens/interessados
 *
 * A fila de trabalho do módulo: todo cliente que tocou no botão de interesse,
 * de qualquer campanha, com telefone à mão. Campanha que gera lead e não vira
 * ligação não gerou venda nenhuma.
 *
 * Vem ordenado com quem AINDA NÃO foi atendido em cima — dentro de cada grupo,
 * do mais recente para o mais antigo. Misturar atendido com pendente faria a
 * fila crescer para sempre e o time pararia de olhar.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "mensagens")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const envios = await prisma.campanhaEnvio.findMany({
    where: { interesseEm: { not: null } },
    orderBy: [{ atendidoEm: "asc" }, { interesseEm: "desc" }],
    take: 200,
    include: {
      // Lead pode ter nascido dos dois lados do módulo: de uma campanha escrita
      // à mão (divisão 1) ou de uma ativação automática (divisão 2). Para quem
      // vai ligar tanto faz — o que importa é o nome, a oferta e o telefone.
      campanha: { select: { id: true, nome: true, titulo: true, ctaLabel: true } },
      ativacao: { select: { id: true, nome: true, titulo: true, ctaLabel: true } },
      proprietario: {
        select: { id: true, nome: true, telefone: true, email: true, cidade: true, uf: true },
      },
    },
  });

  return NextResponse.json({
    interessados: envios.flatMap((e) => {
      const origem = e.campanha ?? e.ativacao;
      if (!origem) return [];
      return [{
      id: e.id,
      interesseEm: e.interesseEm,
      atendidoEm: e.atendidoEm,
      atendidoPorNome: e.atendidoPorNome,
      origem: e.campanha ? ("CAMPANHA" as const) : ("ATIVACAO" as const),
      campanhaId: e.campanha?.id ?? null,
      campanhaNome: origem.nome,
      oferta: origem.ctaLabel ?? origem.titulo,
      proprietarioId: e.proprietario.id,
      nome: e.proprietario.nome,
      telefone: e.proprietario.telefone,
      email: e.proprietario.email,
      cidade: e.proprietario.cidade,
      uf: e.proprietario.uf,
      }];
    }),
  });
}

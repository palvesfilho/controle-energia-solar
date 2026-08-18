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
      campanha: { select: { id: true, nome: true, titulo: true, ctaLabel: true } },
      proprietario: {
        select: { id: true, nome: true, telefone: true, email: true, cidade: true, uf: true },
      },
    },
  });

  return NextResponse.json({
    interessados: envios.map((e) => ({
      id: e.id,
      interesseEm: e.interesseEm,
      atendidoEm: e.atendidoEm,
      atendidoPorNome: e.atendidoPorNome,
      campanhaId: e.campanha.id,
      campanhaNome: e.campanha.nome,
      oferta: e.campanha.ctaLabel ?? e.campanha.titulo,
      proprietarioId: e.proprietario.id,
      nome: e.proprietario.nome,
      telefone: e.proprietario.telefone,
      email: e.proprietario.email,
      cidade: e.proprietario.cidade,
      uf: e.proprietario.uf,
    })),
  });
}

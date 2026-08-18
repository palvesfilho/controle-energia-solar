import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * GET /api/admin/mensagens/leads-novos
 *
 * Alimenta o sino do AURA: clientes que tocaram no botão de uma campanha e
 * ainda não foram atendidos por ninguém.
 *
 * É consultada de minuto em minuto por todo mundo do pós-venda logado, então
 * devolve o mínimo: a contagem e os 6 mais recentes para o menu. A lista
 * completa mora na aba Interessados.
 *
 * 401 e não 403 para quem não tem a seção: o sino só é renderizado para quem
 * pode ver, e um erro silencioso ali não pode virar tela de erro no header.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "mensagens")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const where = { interesseEm: { not: null }, atendidoEm: null } as const;

  const [total, recentes] = await Promise.all([
    prisma.campanhaEnvio.count({ where }),
    prisma.campanhaEnvio.findMany({
      where,
      orderBy: { interesseEm: "desc" },
      take: 6,
      select: {
        id: true,
        interesseEm: true,
        campanha: { select: { nome: true, ctaLabel: true, titulo: true } },
        proprietario: { select: { id: true, nome: true, telefone: true } },
      },
    }),
  ]);

  return NextResponse.json({
    total,
    leads: recentes.map((e) => ({
      id: e.id,
      interesseEm: e.interesseEm,
      oferta: e.campanha.ctaLabel ?? e.campanha.titulo,
      campanhaNome: e.campanha.nome,
      proprietarioId: e.proprietario.id,
      nome: e.proprietario.nome,
      telefone: e.proprietario.telefone,
    })),
  });
}

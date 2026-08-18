import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { descreverGatilho } from "@/lib/mensagens-gatilhos";

export const runtime = "nodejs";

const schema = z.object({
  nome: z.string().trim().min(1).max(120),
  gatilho: z.enum(["ALERTA_USINA", "AGENDA_MENSAL", "ANIVERSARIO_SISTEMA"]),
  params: z.record(z.string(), z.unknown()).default({}),
  titulo: z.string().trim().min(1).max(80),
  mensagem: z.string().trim().min(1).max(300),
  ctaLabel: z.string().trim().max(40).optional().nullable(),
  canal: z.enum(["PUSH_E_PORTAL", "SO_PORTAL"]).default("PUSH_E_PORTAL"),
  cooldownDias: z.number().int().min(1).max(365).default(30),
});

/** GET — as regras da divisão 2, ligadas e desligadas. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "mensagens")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const regras = await prisma.ativacao.findMany({
    orderBy: [{ ativa: "desc" }, { createdAt: "desc" }],
    include: { _count: { select: { envios: true } } },
  });

  return NextResponse.json({
    ativacoes: regras.map((a) => ({
      id: a.id,
      nome: a.nome,
      gatilho: a.gatilho,
      gatilhoResumo: descreverGatilho(a.gatilho, a.params),
      titulo: a.titulo,
      mensagem: a.mensagem,
      ctaLabel: a.ctaLabel,
      canal: a.canal,
      ativa: a.ativa,
      cooldownDias: a.cooldownDias,
      ativadaEm: a.ativadaEm,
      ultimaAvaliacaoEm: a.ultimaAvaliacaoEm,
      totalDisparos: a.totalDisparos,
      envios: a._count.envios,
      criadoPorNome: a.criadoPorNome,
    })),
  });
}

/**
 * POST — cria a regra. Nasce SEMPRE desligada: o schema nem aceita `ativa`, e
 * ligar é um PATCH separado. Criar e ligar no mesmo clique transformaria um
 * cadastro em disparo automático sem ninguém perceber.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "mensagens")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const corpo = schema.safeParse(await req.json().catch(() => null));
  if (!corpo.success) {
    return NextResponse.json(
      { error: corpo.error.issues[0]?.message ?? "Dados inválidos" },
      { status: 400 },
    );
  }

  const { params, ...dados } = corpo.data;
  const criada = await prisma.ativacao.create({
    data: {
      ...dados,
      ctaLabel: dados.ctaLabel || null,
      params: params as object,
      criadoPorNome: session.user.name,
    },
  });

  return NextResponse.json({ id: criada.id });
}

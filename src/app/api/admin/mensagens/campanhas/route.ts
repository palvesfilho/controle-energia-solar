import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { descreverFiltro, type FiltroPublico } from "@/lib/mensagens-publico";
import { getChavePublicaVapid } from "@/lib/push-notificacoes";

export const runtime = "nodejs";

/**
 * Limites que NÃO são decoração: o Android corta o título por volta de 50
 * caracteres e mostra ~2 linhas do corpo com a notificação fechada. Aceitar
 * texto maior produz campanha que "some" no aparelho sem ninguém entender.
 */
const schemaCampanha = z.object({
  nome: z.string().trim().min(1).max(120),
  titulo: z.string().trim().min(1).max(80),
  mensagem: z.string().trim().min(1).max(300),
  urlDestino: z.string().trim().max(200).optional().nullable(),
  ctaLabel: z.string().trim().max(40).optional().nullable(),
  canal: z.enum(["PUSH_E_PORTAL", "SO_PORTAL"]).default("PUSH_E_PORTAL"),
  filtro: z.record(z.string(), z.unknown()).default({}),
});

/** GET /api/admin/mensagens/campanhas — lista com o resultado de cada disparo. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "mensagens")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const campanhas = await prisma.campanha.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      _count: { select: { envios: true } },
      envios: { where: { interesseEm: { not: null } }, select: { id: true } },
    },
  });

  return NextResponse.json({
    // Sem chave VAPID ninguém recebe push. A tela precisa dizer isso antes de o
    // operador escrever uma campanha inteira e descobrir no disparo.
    pushConfigurado: getChavePublicaVapid() !== null,
    campanhas: campanhas.map((c) => ({
      id: c.id,
      nome: c.nome,
      titulo: c.titulo,
      mensagem: c.mensagem,
      canal: c.canal,
      status: c.status,
      publicoResumo: c.publicoResumo,
      totalPublico: c.totalPublico,
      totalComApp: c.totalComApp,
      totalAparelhos: c.totalAparelhos,
      destinatarios: c._count.envios,
      interessados: c.envios.length,
      criadoPorNome: c.criadoPorNome,
      enviadaEm: c.enviadaEm,
      createdAt: c.createdAt,
    })),
  });
}

/** POST /api/admin/mensagens/campanhas — cria o RASCUNHO. Não envia nada. */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "mensagens")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const corpo = schemaCampanha.safeParse(await req.json().catch(() => null));
  if (!corpo.success) {
    return NextResponse.json(
      { error: corpo.error.issues[0]?.message ?? "Dados inválidos" },
      { status: 400 },
    );
  }

  const { filtro, ...dados } = corpo.data;

  const campanha = await prisma.campanha.create({
    data: {
      ...dados,
      urlDestino: dados.urlDestino || null,
      ctaLabel: dados.ctaLabel || null,
      publicoFiltro: filtro as object,
      // Resumo já no rascunho para a lista fazer sentido antes do disparo. É
      // reescrito no envio, com o filtro que valeu de verdade.
      publicoResumo: descreverFiltro(filtro as FiltroPublico),
      criadoPorId: session.user.id,
      criadoPorNome: session.user.name,
    },
  });

  return NextResponse.json({ id: campanha.id });
}

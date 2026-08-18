import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolvePortalProprietario } from "@/lib/portal-cliente-auth";

export const runtime = "nodejs";

/**
 * GET /api/portal-cliente/avisos
 *
 * Caixa de avisos do cliente logado. É o que dá sobrevida à campanha: o push
 * some da tela do celular em segundos e não volta, enquanto o aviso aqui espera
 * o cliente abrir o portal.
 *
 * Não exige acesso pago de propósito. Quem está no plano gratuito é justamente
 * quem precisa receber a oferta — cobrar para ver a oferta é o contrário do que
 * a campanha quer.
 */
export async function GET() {
  const prop = await resolvePortalProprietario();
  if (!prop) {
    return NextResponse.json({ error: "Conta não vinculada" }, { status: 404 });
  }

  const envios = await prisma.campanhaEnvio.findMany({
    where: {
      proprietarioId: prop.id,
      dispensadoEm: null,
      // Só campanha que terminou de sair: ENVIANDO ainda está criando linhas, e
      // o cliente veria um aviso aparecer no meio do disparo.
      campanha: { status: "ENVIADA" },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      campanha: {
        select: { titulo: true, mensagem: true, ctaLabel: true, enviadaEm: true },
      },
    },
  });

  return NextResponse.json({
    avisos: envios.map((e) => ({
      id: e.id,
      titulo: e.campanha.titulo,
      mensagem: e.campanha.mensagem,
      ctaLabel: e.campanha.ctaLabel,
      enviadaEm: e.campanha.enviadaEm ?? e.createdAt,
      lido: e.lidoEm !== null,
      interesse: e.interesseEm !== null,
    })),
  });
}

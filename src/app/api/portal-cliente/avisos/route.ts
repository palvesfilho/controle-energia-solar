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
      OR: [
        // Campanha (divisão 1) só aparece depois de terminar de sair: ENVIANDO
        // ainda está criando linhas, e o cliente veria um aviso brotar no meio
        // do disparo.
        { campanha: { status: "ENVIADA" } },
        // Ativação (divisão 2) já nasce entregue — a linha só existe porque a
        // regra disparou para este cliente.
        { ativacaoId: { not: null } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      campanha: {
        select: { titulo: true, mensagem: true, ctaLabel: true, enviadaEm: true },
      },
      ativacao: { select: { titulo: true, mensagem: true, ctaLabel: true } },
    },
  });

  return NextResponse.json({
    // Para o cliente não existe "campanha" nem "ativação": é uma mensagem da
    // empresa. A origem só interessa do lado de dentro.
    avisos: envios.flatMap((e) => {
      const conteudo = e.campanha ?? e.ativacao;
      if (!conteudo) return [];
      return [
        {
          id: e.id,
          titulo: conteudo.titulo,
          mensagem: conteudo.mensagem,
          ctaLabel: conteudo.ctaLabel,
          enviadaEm: e.campanha?.enviadaEm ?? e.createdAt,
          lido: e.lidoEm !== null,
          interesse: e.interesseEm !== null,
        },
      ];
    }),
  });
}

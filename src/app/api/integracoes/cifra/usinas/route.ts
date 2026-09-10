/**
 * Integração Gestor → Cifra (sistema financeiro do Paulo): catálogo de usinas.
 *
 *   GET /api/integracoes/cifra/usinas        -> usinas ativas, com a UC como chave
 *   GET /api/integracoes/cifra/usinas?todas=1 -> inclui as desativadas
 *
 * O Cifra cadastra a mesma usina como projeto (`customer_projects.kind = usina`)
 * e amarra pela **unidade consumidora**, não pelo id: os dois bancos são
 * separados e a UC é o único número que o operador reconhece nos dois sistemas.
 * Esta rota existe pra ele escolher a usina numa lista em vez de digitar a UC.
 *
 * ## Autenticação
 * Header `X-API-Key: $CIFRA_API_KEY` (ou `Authorization: Bearer`). Chave PRÓPRIA,
 * separada do `CRON_SECRET` e da `RGE_PROTOCOLOS_API_KEY`: quem consome é outro
 * sistema, e revogar o acesso do Cifra não pode derrubar os crons. Sem a
 * variável configurada a rota responde 503 — não existe modo aberto.
 *
 * ⚠️ Nunca devolver credencial de portal (`senhaDistribuidora`,
 * `monitoramentoSenha`) daqui. O Cifra não precisa e a chave não é segredo dele.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { autorizarCifra } from "@/lib/integracao-cifra";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = autorizarCifra(req);
  if (!auth.ok) return auth.resposta;

  const todas = new URL(req.url).searchParams.get("todas") === "1";

  const plants = await prisma.plant.findMany({
    where: todas ? {} : { active: true },
    select: {
      id: true,
      name: true,
      unidadeConsumidora: true,
      unidadeConsumidoraAntiga: true,
      potenciaInstalada: true,
      distribuidora: true,
      usinaDeInvestidor: true,
      active: true,
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    usinas: plants.map((p) => ({
      id: p.id,
      nome: p.name,
      uc: p.unidadeConsumidora,
      ucAntiga: p.unidadeConsumidoraAntiga,
      potenciaKw: p.potenciaInstalada,
      distribuidora: p.distribuidora,
      usinaDeInvestidor: p.usinaDeInvestidor,
      ativa: p.active,
    })),
  });
}

import { prisma } from "@/lib/prisma";
import { whereCodigoUc } from "@/lib/uc-codigo";

export type UcDoProprietario = {
  consumerUnitId: string;
  codigoUc: string;
  nome: string;
  tipo: "TITULAR" | "BENEFICIARIA";
  percentual: number | null;
};

/**
 * As UCs de um proprietário Brasil Solar: a TITULAR primeiro, depois as
 * beneficiárias ativas que já têm ConsumerUnit vinculada.
 *
 * PONTO ÚNICO de propósito. Mais de um endpoint responde "quais são as UCs
 * deste proprietário" (o status de faturas e a lista de faturas), e duas
 * resoluções que discordam somem com dados sem dar erro — foi o que aconteceu
 * quando uma casava o código exato e a outra não.
 *
 * ⚠️ A titular casa por `whereCodigoUc`, não por igualdade: a RGE trocou os
 * códigos em jul/2026 e o proprietário pode ter ficado com o antigo enquanto a
 * UC tem o novo. Com `findUnique` no código exato o card sumia inteiro — junto
 * com o botão "Sincronizar faturas antigas" — sem nenhuma mensagem.
 */
export async function resolverUcsDoProprietario(
  proprietarioId: string,
  codigoUcDoProprietario: string | null,
): Promise<UcDoProprietario[]> {
  const ucs: UcDoProprietario[] = [];

  if (codigoUcDoProprietario) {
    const titular = await prisma.consumerUnit.findFirst({
      where: whereCodigoUc(codigoUcDoProprietario),
      select: { id: true, codigoUc: true, nome: true },
    });
    if (titular) {
      ucs.push({
        consumerUnitId: titular.id,
        codigoUc: titular.codigoUc,
        nome: titular.nome,
        tipo: "TITULAR",
        percentual: null,
      });
    }
  }

  const beneficiarias = await prisma.brasilSolarBeneficiaria.findMany({
    where: { proprietarioId, active: true },
    orderBy: { createdAt: "asc" },
    select: {
      consumerUnitId: true,
      codigoUc: true,
      nome: true,
      percentual: true,
    },
  });

  for (const b of beneficiarias) {
    if (!b.consumerUnitId) continue;
    // A titular também pode estar cadastrada como beneficiária: não duplicar.
    if (ucs.some((u) => u.consumerUnitId === b.consumerUnitId)) continue;
    const cu = await prisma.consumerUnit.findUnique({
      where: { id: b.consumerUnitId },
      select: { id: true, codigoUc: true, nome: true },
    });
    if (!cu) continue;
    ucs.push({
      consumerUnitId: cu.id,
      codigoUc: cu.codigoUc,
      nome: b.nome ?? cu.nome,
      tipo: "BENEFICIARIA",
      percentual: b.percentual,
    });
  }

  return ucs;
}

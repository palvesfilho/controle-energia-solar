/**
 * Descobre a unidade consumidora de uma usina monitorada (BrasilSolarClient).
 *
 * Existe porque o vínculo usina → UC praticamente não está preenchido: de 1.819
 * usinas ativas, 2 têm `codigoUc` e 2 têm `plantId`. O código costuma estar no
 * PROPRIETÁRIO, não na usina. Sem essa cascata, qualquer tela que precise das
 * faturas da usina viria vazia e o operador teria que caçar a UC na mão.
 *
 * A ordem vai do vínculo mais específico (a própria usina) pro mais frouxo
 * (beneficiária do proprietário). Quem chama recebe de onde veio o palpite e
 * pode deixar o operador trocar — detecção aqui é sugestão, não decisão.
 * Ver feedback_escolha_explicita_vs_deteccao.
 */
import { prisma } from "@/lib/prisma";

export type OrigemVinculoUc = "USINA" | "PLANT" | "PROPRIETARIO" | "BENEFICIARIA" | "NENHUM";

export interface UcResumo {
  id: string;
  nome: string;
  codigoUc: string | null;
}

export interface VinculoUcUsina {
  uc: UcResumo | null;
  origem: OrigemVinculoUc;
  /** Rótulo curto de onde veio o vínculo, pra mostrar na tela. */
  descricao: string | null;
}

const digitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/** UC cujo código (atual ou antigo) bate com algum dos códigos informados. */
async function ucPorCodigos(codigos: string[]): Promise<UcResumo | null> {
  const limpos = codigos.map(digitos).filter(Boolean);
  if (limpos.length === 0) return null;
  return prisma.consumerUnit.findFirst({
    where: {
      OR: [{ codigoUc: { in: limpos } }, { codigoUcAntigo: { in: limpos } }],
    },
    select: { id: true, nome: true, codigoUc: true },
  });
}

export async function resolverUcDaUsinaBs(clientId: string): Promise<VinculoUcUsina> {
  const usina = await prisma.brasilSolarClient.findUnique({
    where: { id: clientId },
    select: {
      codigoUc: true,
      codigoUcAntigo: true,
      plantId: true,
      proprietarioId: true,
    },
  });
  if (!usina) return { uc: null, origem: "NENHUM", descricao: null };

  // 1. Código na própria usina.
  const pelaUsina = await ucPorCodigos([usina.codigoUc ?? "", usina.codigoUcAntigo ?? ""]);
  if (pelaUsina) {
    return { uc: pelaUsina, origem: "USINA", descricao: "código cadastrado na usina" };
  }

  // 2. Usina ligada a uma Plant do Gestor de Créditos.
  if (usina.plantId) {
    const plant = await prisma.plant.findUnique({
      where: { id: usina.plantId },
      select: { unidadeConsumidora: true, unidadeConsumidoraAntiga: true },
    });
    const pelaPlant = await ucPorCodigos([
      plant?.unidadeConsumidora ?? "",
      plant?.unidadeConsumidoraAntiga ?? "",
    ]);
    if (pelaPlant) {
      return { uc: pelaPlant, origem: "PLANT", descricao: "UC da usina no Gestor de Créditos" };
    }
  }

  if (usina.proprietarioId) {
    // 3. Código no proprietário — é onde ele costuma estar de verdade.
    const prop = await prisma.brasilSolarProprietario.findUnique({
      where: { id: usina.proprietarioId },
      select: { codigoUc: true },
    });
    const peloProprietario = await ucPorCodigos([prop?.codigoUc ?? ""]);
    if (peloProprietario) {
      return {
        uc: peloProprietario,
        origem: "PROPRIETARIO",
        descricao: "código cadastrado no proprietário",
      };
    }

    // 4. Beneficiária do proprietário (rateio).
    const beneficiarias = await prisma.brasilSolarBeneficiaria.findMany({
      where: { proprietarioId: usina.proprietarioId },
      select: { codigoUc: true },
    });
    const pelaBeneficiaria = await ucPorCodigos(beneficiarias.map((b) => b.codigoUc ?? ""));
    if (pelaBeneficiaria) {
      return {
        uc: pelaBeneficiaria,
        origem: "BENEFICIARIA",
        descricao: "beneficiária do proprietário",
      };
    }
  }

  return { uc: null, origem: "NENHUM", descricao: null };
}

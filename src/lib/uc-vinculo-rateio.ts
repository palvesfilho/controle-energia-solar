import { prisma } from "@/lib/prisma";

/**
 * De qual usina a UC recebe crédito — derivado dos RATEIOS, não do campo
 * `ConsumerUnit.plantId` do cadastro.
 *
 * A usina da UC é CONSEQUÊNCIA do rateio (regra do Paulo, 17/08/2026): o campo
 * do cadastro é digitado à mão e o aceite do rateio não escreve nele. Em
 * 23/09/2026 a lista de UCs lia só o campo e mostrava "sem usina" para 4 UCs
 * do rateio vigente da ODAIR VENDRAME, e a usina ERRADA para 3 da LABIMED.
 *
 * Três estados, porque o pedido na concessionária e o efeito na fatura são
 * coisas diferentes (ver feedback "status do portal ≠ mudança aplicada"):
 *
 * - `vigentes`: rateio aceito — é daqui que a UC compensa HOJE.
 * - `pendentes`: rateio registrado na concessionária (`PENDENTE_ACEITE`) e
 *   ainda não aceito. Mesmo recorte de `/api/rateios/protocolos` e do robô da
 *   RGE — não inventar um segundo critério de "em aberto". Só ENTRA quando é
 *   de OUTRA usina: novo rateio da mesma usina não muda o vínculo.
 * - `rejeitado`: o último rateio rejeitado, só quando não sobrou vigente nem
 *   pendente — explica por que a UC ficou sem usina.
 *
 * ⛔ Isto é para EXIBIÇÃO. Cobrança, repasse ao investidor e o KPI "UCs sem
 * rateio" continuam olhando só o vigente: um pendente pode ser rejeitado.
 */

export interface VinculoRateioUsina {
  plantId: string;
  plantName: string;
  percentual: number;
}

export interface VinculoPendente extends VinculoRateioUsina {
  versionId: string;
  protocolo: string | null;
  criadoEm: string;
  /** Leitura normalizada do robô (VALIDADO, EM_ANDAMENTO, ERRO…). */
  protocoloSituacao: string | null;
}

export interface VinculoUc {
  vigentes: (VinculoRateioUsina & { desde: string | null })[];
  pendentes: VinculoPendente[];
  rejeitado: { plantId: string; plantName: string; em: string | null; protocolo: string | null } | null;
}

export async function vinculosPorRateio(ucIds: string[]): Promise<Map<string, VinculoUc>> {
  const out = new Map<string, VinculoUc>();
  if (!ucIds.length) return out;

  const itens = await prisma.rateioItem.findMany({
    where: {
      consumerUnitId: { in: ucIds },
      version: {
        OR: [
          { status: "VIGENTE" },
          // Usina desativada não gera trabalho: o pedido dela não vai ser
          // aceito (mesmo filtro de /api/rateios/protocolos).
          { status: "PENDENTE_ACEITE", plant: { active: true } },
          { status: "REJEITADO" },
        ],
      },
    },
    select: {
      consumerUnitId: true,
      percentual: true,
      version: {
        select: {
          id: true,
          status: true,
          plantId: true,
          protocolo: true,
          protocoloSituacao: true,
          criadoEm: true,
          aceitoEm: true,
          vigenteAPartirDe: true,
          rejeitadoEm: true,
          plant: { select: { name: true } },
        },
      },
    },
  });

  const porUc = new Map<string, typeof itens>();
  for (const i of itens) {
    const a = porUc.get(i.consumerUnitId) ?? [];
    a.push(i);
    porUc.set(i.consumerUnitId, a);
  }

  for (const [ucId, lista] of porUc) {
    const vigentes = lista
      .filter((i) => i.version.status === "VIGENTE")
      .map((i) => ({
        plantId: i.version.plantId,
        plantName: i.version.plant.name,
        percentual: i.percentual,
        desde: (i.version.aceitoEm ?? i.version.vigenteAPartirDe)?.toISOString() ?? null,
      }));
    const usinasVigentes = new Set(vigentes.map((v) => v.plantId));

    const pendentes = lista
      .filter((i) => i.version.status === "PENDENTE_ACEITE" && !usinasVigentes.has(i.version.plantId))
      .map((i) => ({
        versionId: i.version.id,
        plantId: i.version.plantId,
        plantName: i.version.plant.name,
        percentual: i.percentual,
        protocolo: i.version.protocolo,
        criadoEm: i.version.criadoEm.toISOString(),
        protocoloSituacao: i.version.protocoloSituacao,
      }))
      .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));

    let rejeitado: VinculoUc["rejeitado"] = null;
    if (!vigentes.length && !pendentes.length) {
      const r = lista
        .filter((i) => i.version.status === "REJEITADO")
        .sort(
          (a, b) =>
            (b.version.rejeitadoEm ?? b.version.criadoEm).getTime() -
            (a.version.rejeitadoEm ?? a.version.criadoEm).getTime(),
        )[0];
      if (r) {
        rejeitado = {
          plantId: r.version.plantId,
          plantName: r.version.plant.name,
          em: r.version.rejeitadoEm?.toISOString() ?? null,
          protocolo: r.version.protocolo,
        };
      }
    }

    out.set(ucId, { vigentes, pendentes, rejeitado });
  }
  return out;
}

export const VINCULO_VAZIO: VinculoUc = { vigentes: [], pendentes: [], rejeitado: null };

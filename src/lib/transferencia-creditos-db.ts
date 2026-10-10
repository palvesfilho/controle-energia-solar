/**
 * Transferência de créditos — a leitura do banco. Fica separada da regra
 * (`transferencia-creditos.ts`) porque a tela importa as constantes de lá, e o
 * Prisma não pode ir parar no bundle do navegador.
 */
import { prisma } from "@/lib/prisma";
import { acompanharUc, vazio, type Acompanhamento } from "@/lib/transferencia-creditos";

export interface DestinoTransferencia {
  itemId: string;
  kwh: number;
  uc: {
    id: string;
    nome: string;
    codigoUc: string;
    codigoUcAntigo: string | null;
    temGeracaoPropria: boolean;
  };
  acompanhamento: Acompanhamento;
}

export interface TransferenciaComAcompanhamento {
  id: string;
  plant: { id: string; name: string } | null;
  ucOrigemCodigo: string;
  kwhTotal: number;
  status: string;
  enviadoEm: Date | null;
  aceitoEm: Date | null;
  observacao: string | null;
  documentoUrl: string | null;
  documentoNome: string | null;
  createdAt: Date;
  destinos: DestinoTransferencia[];
  usadoKwh: number;
  restanteKwh: number;
}

/** Todas as transferências (ou uma), já com o acompanhamento das faturas. */
export async function carregarTransferencias(
  filtro: { id?: string } = {},
): Promise<TransferenciaComAcompanhamento[]> {
  const transfers = await prisma.creditTransfer.findMany({
    where: filtro.id ? { id: filtro.id } : undefined,
    orderBy: [{ aceitoEm: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
    include: {
      plant: { select: { id: true, name: true } },
      items: {
        include: {
          consumerUnit: {
            select: { id: true, nome: true, codigoUc: true, codigoUcAntigo: true, temGeracaoPropria: true },
          },
        },
      },
    },
  });
  if (transfers.length === 0) return [];

  const ucIds = [...new Set(transfers.flatMap((t) => t.items.map((i) => i.consumerUnitId)))];

  // Todas as transferências dessas UCs, inclusive as que o filtro deixou de
  // fora: a ordem de consumo numa UC depende de TODAS as que ela recebeu.
  const [todosItens, faturas] = await Promise.all([
    prisma.creditTransferItem.findMany({
      where: { consumerUnitId: { in: ucIds } },
      select: { id: true, consumerUnitId: true, kwh: true, transfer: { select: { status: true, aceitoEm: true } } },
    }),
    prisma.consumerBill.findMany({
      where: { consumerUnitId: { in: ucIds } },
      select: {
        consumerUnitId: true,
        anoReferencia: true,
        mesReferencia: true,
        consumoKwh: true,
        energiaCompensada: true,
        saldoInstalacaoKwh: true,
        saldoCreditos: true,
        injetadaDetalhes: true,
      },
    }),
  ]);

  const acomp = new Map<string, Acompanhamento>();
  for (const ucId of ucIds) {
    const r = acompanharUc(
      faturas
        .filter((f) => f.consumerUnitId === ucId)
        .map((f) => ({
          ano: f.anoReferencia,
          mes: f.mesReferencia,
          consumoKwh: f.consumoKwh,
          energiaCompensada: f.energiaCompensada,
          saldoKwh: f.saldoInstalacaoKwh ?? f.saldoCreditos,
          injetadaDetalhes: f.injetadaDetalhes,
        })),
      todosItens
        .filter((i) => i.consumerUnitId === ucId)
        .map((i) => ({ itemId: i.id, status: i.transfer.status, aceitoEm: i.transfer.aceitoEm, kwh: i.kwh })),
    );
    for (const [k, v] of r) acomp.set(k, v);
  }

  return transfers.map((t) => {
    const destinos: DestinoTransferencia[] = t.items
      .map((i) => ({
        itemId: i.id,
        kwh: i.kwh,
        uc: i.consumerUnit,
        acompanhamento: acomp.get(i.id) ?? vazio("AGUARDANDO_ACEITE", i.kwh),
      }))
      .sort((a, b) => b.kwh - a.kwh);
    const usado = destinos.reduce((s, d) => s + d.acompanhamento.usadoKwh, 0);
    return {
      id: t.id,
      plant: t.plant,
      ucOrigemCodigo: t.ucOrigemCodigo,
      kwhTotal: t.kwhTotal,
      status: t.status,
      enviadoEm: t.enviadoEm,
      aceitoEm: t.aceitoEm,
      observacao: t.observacao,
      documentoUrl: t.documentoUrl,
      documentoNome: t.documentoNome,
      createdAt: t.createdAt,
      destinos,
      usadoKwh: usado,
      restanteKwh: destinos.reduce((s, d) => s + d.acompanhamento.restanteKwh, 0),
    };
  });
}

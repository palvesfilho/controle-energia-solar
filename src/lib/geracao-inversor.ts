/**
 * Coleta de geração do inversor pra uma ConsumerBill.
 *
 * Usado no fluxo de cobrança de UC geradora em USINA_CONSUMO_DESCONTADO —
 * precisa saber quanto a usina gerou no período pra derivar o consumo
 * instantâneo (= geração - energia injetada no medidor).
 *
 * Fontes (ordem de precedência):
 *  1. MANUAL (geracaoInversorOrigem = "MANUAL") — preservado, não sobrescreve.
 *  2. AUTO via API do inversor — Fronius / Huawei / SolarEdge / Sungrow.
 *     Busca todas as BrasilSolarClient associadas à Plant e soma.
 *  3. Null — deixa pro operador preencher manualmente.
 *
 * Período da coleta: dataLeituraAnterior → dataLeituraAtual da bill.
 * Fallback (sem essas datas): 1º dia do mês de referência → último dia.
 */

import { prisma } from "@/lib/prisma";
import { getRangeTotal as froniusRangeTotal } from "@/lib/fronius";
import { getRangeTotal as huaweiRangeTotal } from "@/lib/huawei";
import { getRangeTotal as sungrowRangeTotal } from "@/lib/sungrow";
import { getRangeTotal as solaredgeRangeTotal } from "@/lib/solaredge";

export interface SyncGeracaoResult {
  billId: string;
  geracaoInversorKwh: number | null;
  origem: "AUTO" | "MANUAL" | null;
  erros: string[];
  skipped: string | null;
}

interface MonitoringClient {
  id: string;
  plataformaMonitoramento: string | null;
  monitoramentoPlantId: string | null;
}

async function sumGenerationForPeriod(
  clients: MonitoringClient[],
  inicio: Date,
  fim: Date,
): Promise<{ totalKwh: number | null; erros: string[] }> {
  const erros: string[] = [];
  let total = 0;
  let qualquerSucesso = false;
  for (const c of clients) {
    const platform = c.plataformaMonitoramento?.toUpperCase() ?? null;
    if (!platform || !c.monitoramentoPlantId) continue;
    try {
      let r: { totalKwh: number };
      if (platform === "FRONIUS") {
        r = await froniusRangeTotal(c.monitoramentoPlantId, inicio, fim);
      } else if (platform === "HUAWEI") {
        r = await huaweiRangeTotal(c.monitoramentoPlantId, inicio, fim);
      } else if (platform === "SUNGROW") {
        r = await sungrowRangeTotal(c.monitoramentoPlantId, inicio, fim);
      } else if (platform === "SOLAREDGE") {
        const siteId = parseInt(c.monitoramentoPlantId, 10);
        if (Number.isNaN(siteId)) {
          erros.push(`${c.id}: SolarEdge siteId inválido`);
          continue;
        }
        r = await solaredgeRangeTotal(siteId, inicio, fim);
      } else {
        erros.push(`${c.id}: plataforma '${platform}' não suportada`);
        continue;
      }
      total += r.totalKwh;
      qualquerSucesso = true;
    } catch (e) {
      erros.push(`${c.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { totalKwh: qualquerSucesso ? total : null, erros };
}

/**
 * Tenta preencher `geracaoInversorKwh` de uma ConsumerBill a partir das
 * BrasilSolarClient associadas à Plant. Retorna o resultado + atualiza a bill.
 *
 * Não sobrescreve valores marcados como MANUAL.
 */
export async function syncGeracaoInversorForBill(
  billId: string,
): Promise<SyncGeracaoResult> {
  const bill = await prisma.consumerBill.findUnique({
    where: { id: billId },
    select: {
      id: true,
      plantId: true,
      anoReferencia: true,
      mesReferencia: true,
      dataLeituraAnterior: true,
      dataLeituraAtual: true,
      geracaoInversorKwh: true,
      geracaoInversorOrigem: true,
    },
  });
  if (!bill) {
    return {
      billId,
      geracaoInversorKwh: null,
      origem: null,
      erros: [],
      skipped: "bill não encontrada",
    };
  }

  if (bill.geracaoInversorOrigem === "MANUAL") {
    return {
      billId,
      geracaoInversorKwh: bill.geracaoInversorKwh,
      origem: "MANUAL",
      erros: [],
      skipped: "valor manual já preenchido (não sobrescreve)",
    };
  }

  if (!bill.plantId) {
    return {
      billId,
      geracaoInversorKwh: null,
      origem: null,
      erros: [],
      skipped: "bill sem plantId — não dá pra buscar monitoring",
    };
  }

  // Monitoring clients vinculados à Plant.
  const clients = await prisma.brasilSolarClient.findMany({
    where: { plantId: bill.plantId, active: true },
    select: {
      id: true,
      plataformaMonitoramento: true,
      monitoramentoPlantId: true,
    },
  });
  if (clients.length === 0) {
    return {
      billId,
      geracaoInversorKwh: null,
      origem: null,
      erros: [],
      skipped: "nenhum BrasilSolarClient ativo vinculado a esta usina",
    };
  }

  const inicio =
    bill.dataLeituraAnterior ??
    new Date(bill.anoReferencia, bill.mesReferencia - 1, 1);
  const fim =
    bill.dataLeituraAtual ??
    new Date(bill.anoReferencia, bill.mesReferencia, 0, 23, 59, 59);

  const { totalKwh, erros } = await sumGenerationForPeriod(
    clients,
    inicio,
    fim,
  );

  if (totalKwh == null) {
    // Não sobrescreve valor já salvo como AUTO se falhou agora (preserva histórico).
    return {
      billId,
      geracaoInversorKwh: bill.geracaoInversorKwh,
      origem: bill.geracaoInversorOrigem as "AUTO" | "MANUAL" | null,
      erros,
      skipped: "todas as plataformas falharam — sem dados pra atualizar",
    };
  }

  await prisma.consumerBill.update({
    where: { id: billId },
    data: {
      geracaoInversorKwh: totalKwh,
      geracaoInversorOrigem: "AUTO",
    },
  });

  return {
    billId,
    geracaoInversorKwh: totalKwh,
    origem: "AUTO",
    erros,
    skipped: null,
  };
}

/**
 * Registra manualmente a geração do inversor pra uma bill.
 * Marca origem=MANUAL pra que syncs automáticos futuros não sobrescrevam.
 */
export async function setGeracaoInversorManual(
  billId: string,
  geracaoKwh: number | null,
): Promise<void> {
  if (geracaoKwh != null && (!Number.isFinite(geracaoKwh) || geracaoKwh < 0)) {
    throw new Error("geracaoInversorKwh deve ser número >= 0 ou null");
  }
  await prisma.consumerBill.update({
    where: { id: billId },
    data: {
      geracaoInversorKwh: geracaoKwh,
      geracaoInversorOrigem: geracaoKwh != null ? "MANUAL" : null,
    },
  });
}

/**
 * Calcula consumoInstantaneoKwh a partir de geracaoInversorKwh e
 * energiaInjetadaMedidorKwh. Retorna null se algum dos dois está ausente.
 * Negativo é clampado a 0 (anomalia de coleta).
 */
export function deriveConsumoInstantaneo(
  geracaoKwh: number | null | undefined,
  injetadaMedidorKwh: number | null | undefined,
): number | null {
  if (geracaoKwh == null || injetadaMedidorKwh == null) return null;
  return Math.max(0, geracaoKwh - injetadaMedidorKwh);
}

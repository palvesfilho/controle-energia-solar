/**
 * Geração de dados do relatório de payback Brasil Solar (12 meses).
 *
 * Cruza geração dos inversores (Fronius/Huawei/Sungrow/SolarEdge) com a janela
 * de leitura de cada ConsumerBill da UC. Calcula economia mensal/acumulada e
 * payback restante contra o investimento total das usinas associadas.
 */

import { prisma } from "@/lib/prisma";
import { getRangeTotal as froniusRangeTotal } from "@/lib/fronius";
import { getRangeTotal as huaweiRangeTotal } from "@/lib/huawei";
import { getRangeTotal as sungrowRangeTotal } from "@/lib/sungrow";
import { getRangeTotal as solaredgeRangeTotal } from "@/lib/solaredge";
import { getRelatorioParametros } from "@/lib/app-settings";

/**
 * Carga tributária efetiva estimada para gross-up da tarifa de consumo
 * instantâneo (ICMS + PIS + COFINS "por dentro"). Padrão pra B1 RGE/RS.
 * Hoje hardcoded; futuramente pode vir de configuração da concessionária ou
 * da própria ConsumerBill quando os campos icms/pis/cofins estiverem em alíquota.
 */
const TRIBUTOS_EFETIVOS_PADRAO = 0.25;

export interface RelatorioMonthRow {
  ano: number;
  mes: number;
  janela: {
    inicio: string | null;
    fim: string | null;
    fonte: "CICLO_LEITURA" | "MES_CALENDARIO";
  };
  geracaoInversorKwh: number | null;
  injetadaMedidorKwh: number | null;
  /** consumo da rede (o que veio na fatura RGE) — `ConsumerBill.consumoKwh` */
  consumoRedeKwh: number | null;
  /** Saldo acumulado de créditos GD do mês (do que sobrou da injeção, em kWh) */
  saldoCreditosKwh: number | null;
  /** consumo_instantaneo = geracao_inversor − injetada_medidor (null quando faltam dados; <0 marca anomalia) */
  consumoInstantaneoKwh: number | null;
  /** consumo TOTAL real do cliente = rede + instantâneo (o que o cliente efetivamente usou) */
  consumoTotalKwh: number | null;
  energiaCompensadaKwh: number | null;
  /** tarifa_TE + tarifa_TUSD (sem tributos) — usada na compensada */
  tarifaTotal: number | null;
  /** tarifa_base / (1 − aliquota_efetiva) — usada no consumo instantâneo */
  tarifaCompletaComTributos: number | null;
  /** energia_compensada × tarifa_TE_TUSD */
  economiaCompensadaRs: number | null;
  /** consumo_instantaneo × tarifa_completa_com_tributos (null quando anomalia) */
  economiaInstantaneaRs: number | null;
  /** soma das parcelas (compensada + instantânea, ignorando NaN) */
  economiaMensalRs: number | null;
  economiaAcumuladaRs: number;
  saldoPaybackRs: number;
  /** Faturado RGE (valor líquido pago à concessionária) */
  faturadoRs: number | null;
  /** Desempenho % = geracaoInversor / geracaoEsperadaMensal × 100 */
  desempenhoPct: number | null;
  /** Retorno % no mês = economiaMensalRs / investimentoTotal × 100 */
  retornoPct: number | null;
  /** Sinaliza inconsistências (ex.: injeção > geração — possível perda de monitoramento) */
  anomalia: string | null;
  inversoresErros: string[];
}

export interface RelatorioData {
  proprietario: {
    id: string;
    nome: string;
    cidade: string | null;
    uf: string | null;
  };
  uc: {
    id: string;
    codigoUc: string;
    nome: string;
    distribuidora: string | null;
  };
  usinasMonitoradas: {
    id: string;
    nome: string;
    potenciaInstalada: number | null;
    investimento: number | null;
    plataforma: string | null;
  }[];
  investimentoTotal: number;
  potenciaTotalKwp: number;
  /** Soma do prognóstico mensal das usinas (BSC.geracaoMediaEsperada) */
  geracaoEsperadaMensalKwh: number;
  /** Soma do prognóstico anual das usinas (BSC.geracaoAnualEsperada) */
  geracaoEsperadaAnualKwh: number;
  economiaMediaMensalRs: number;
  /** Retorno total acumulado = economiaAcumulada / investimento × 100 */
  retornoTotalPct: number;
  /** Meses estimados até quitar (modelo com reajuste tarifa + depreciação módulos). */
  paybackRestanteMeses: number;
  /** Mês/ano em que a usina deve se pagar. `null` se não quitar em 50 anos. */
  paybackQuitacaoPrevista: { ano: number; mes: number } | null;
  paybackQuitado: boolean;
  meses: RelatorioMonthRow[];
}

/**
 * Modelo de payback projetado:
 * - Reajuste anual de tarifa de energia (default 7%, histórico CPFL/RGE)
 *   aumenta a economia mensal.
 * - Depreciação anual dos módulos fotovoltaicos (default 0,5%) reduz a
 *   geração ao longo do tempo.
 * Efeito líquido anual ≈ +6,46%/ano na economia. Editáveis em
 * `/admin/personalizacoes/relatorio-parametros` (model `AppSetting`).
 */
const LIMITE_PROJECAO_MESES = 50 * 12;

/**
 * Itera mês a mês a partir do último mês do relatório, aplicando o fator
 * mensal composto na economia base, até o saldo zerar. Retorna o mês/ano
 * em que a usina se paga + quantidade de meses projetados a partir do último.
 *
 * Retorna `null` se a economia base é 0 ou se não quita em 50 anos.
 */
function projetarPayback(
  saldoInicial: number,
  economiaMensalBase: number,
  ultimoMes: { ano: number; mes: number },
  reajusteTarifaAnual: number,
  depreciacaoModuloAnual: number,
): { ano: number; mes: number; mesesProjetados: number } | null {
  if (economiaMensalBase <= 0) return null;
  if (saldoInicial <= 0) {
    return { ano: ultimoMes.ano, mes: ultimoMes.mes, mesesProjetados: 0 };
  }

  const fatorAnual = (1 + reajusteTarifaAnual) * (1 - depreciacaoModuloAnual);
  const fatorMensal = Math.pow(fatorAnual, 1 / 12);

  let saldo = saldoInicial;
  let economiaMensal = economiaMensalBase;
  let mesesAvancados = 0;

  while (saldo > 0 && mesesAvancados < LIMITE_PROJECAO_MESES) {
    mesesAvancados++;
    saldo -= economiaMensal;
    economiaMensal *= fatorMensal;
  }
  if (saldo > 0) return null;

  let ano = ultimoMes.ano;
  let mes = ultimoMes.mes + mesesAvancados;
  while (mes > 12) {
    mes -= 12;
    ano += 1;
  }
  return { ano, mes, mesesProjetados: mesesAvancados };
}

async function sumGenerationForPeriod(
  monitoringClients: {
    id: string;
    plataformaMonitoramento: string | null;
    monitoramentoPlantId: string | null;
  }[],
  inicio: Date,
  fim: Date,
): Promise<{ totalKwh: number | null; erros: string[] }> {
  const erros: string[] = [];
  let total = 0;
  let qualquerSucesso = false;

  // Lê primeiro do banco (MonitoringLog) — sem bater na API. Cron diário
  // já mantém isso atualizado. Só bate na API se não houver log algum
  // pra esse cliente no período (cliente novo / sem cron rodado ainda).
  const clientIds = monitoringClients.map((c) => c.id);
  const cachedLogs = await prisma.monitoringLog.findMany({
    where: {
      clientId: { in: clientIds },
      data: { gte: inicio, lt: fim },
    },
    select: { clientId: true, geracaoDiaria: true },
  });
  const cachedByClient = new Map<string, number>();
  for (const log of cachedLogs) {
    cachedByClient.set(log.clientId, (cachedByClient.get(log.clientId) ?? 0) + log.geracaoDiaria);
  }

  for (const c of monitoringClients) {
    const platform = c.plataformaMonitoramento?.toUpperCase() ?? null;
    if (!platform || !c.monitoramentoPlantId) continue;

    // Cache hit: usa o que está no banco
    const cachedKwh = cachedByClient.get(c.id);
    if (cachedKwh != null && cachedKwh > 0) {
      total += cachedKwh;
      qualquerSucesso = true;
      continue;
    }

    // Cache miss: bate na API e (idealmente) o sync grava no banco depois
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

export async function getProprietarioRelatorio(
  proprietarioId: string,
  ucId: string,
): Promise<RelatorioData | { error: string; status: number }> {
  const [proprietario, uc] = await Promise.all([
    prisma.brasilSolarProprietario.findUnique({
      where: { id: proprietarioId },
      select: { id: true, nome: true, cidade: true, uf: true, codigoUc: true },
    }),
    prisma.consumerUnit.findUnique({
      where: { id: ucId },
      select: {
        id: true,
        codigoUc: true,
        nome: true,
        distribuidora: true,
      },
    }),
  ]);

  if (!proprietario) return { error: "Proprietário não encontrado", status: 404 };
  if (!uc) return { error: "UC não encontrada", status: 404 };

  // Validação: a UC consultada precisa bater com o codigoUc do proprietário
  // Brasil Solar (a "ponte" entre cliente Brasil Solar e o cadastro interno).
  if (proprietario.codigoUc && proprietario.codigoUc !== uc.codigoUc) {
    return {
      error: `UC ${uc.codigoUc} não pertence ao proprietário (esperado ${proprietario.codigoUc})`,
      status: 403,
    };
  }

  // Pega TODAS as usinas monitoradas (BSC) ativas do proprietário.
  // Modelo atual: 1 proprietário Brasil Solar = 1 UC = N usinas físicas (BSCs)
  // injetando nessa UC. A ponte é o codigoUc do proprietário, não BSC.plantId.
  const monitoringClients = await prisma.brasilSolarClient.findMany({
    where: {
      proprietarioId,
      active: true,
    },
    select: {
      id: true,
      nome: true,
      plataformaMonitoramento: true,
      monitoramentoPlantId: true,
      potenciaInstalada: true,
      investimento: true,
      geracaoMediaEsperada: true,
      geracaoAnualEsperada: true,
    },
  });

  const investimentoTotal = monitoringClients.reduce(
    (sum, c) => sum + (c.investimento ?? 0),
    0,
  );
  const potenciaTotalKwp = monitoringClients.reduce(
    (sum, c) => sum + (c.potenciaInstalada ?? 0),
    0,
  );
  const geracaoEsperadaMensalKwh = monitoringClients.reduce(
    (sum, c) => sum + (c.geracaoMediaEsperada ?? 0),
    0,
  );
  const geracaoEsperadaAnualKwh = monitoringClients.reduce(
    (sum, c) => sum + (c.geracaoAnualEsperada ?? 0),
    0,
  );

  const bills = await prisma.consumerBill.findMany({
    where: { consumerUnitId: ucId },
    orderBy: [{ anoReferencia: "desc" }, { mesReferencia: "desc" }],
    take: 12,
    select: {
      anoReferencia: true,
      mesReferencia: true,
      dataLeituraAnterior: true,
      dataLeituraAtual: true,
      consumoKwh: true,
      energiaInjetadaMedidorKwh: true,
      energiaCompensada: true,
      saldoCreditos: true,
      tarifaTE: true,
      tarifaTUSD: true,
      valorTotal: true,
    },
  });
  bills.reverse();

  let economiaAcumulada = 0;
  const meses: RelatorioMonthRow[] = [];

  for (const bill of bills) {
    let inicio: Date | null = bill.dataLeituraAnterior ?? null;
    let fim: Date | null = bill.dataLeituraAtual ?? null;
    let fonte: RelatorioMonthRow["janela"]["fonte"] = "CICLO_LEITURA";
    if (!inicio || !fim) {
      fonte = "MES_CALENDARIO";
      inicio = new Date(Date.UTC(bill.anoReferencia, bill.mesReferencia - 1, 1));
      fim = new Date(Date.UTC(bill.anoReferencia, bill.mesReferencia, 1));
    }

    const { totalKwh: geracaoInversorKwh, erros: inversoresErros } =
      await sumGenerationForPeriod(monitoringClients, inicio, fim);

    // === Tarifas ===
    const tarifaTotal =
      bill.tarifaTE != null && bill.tarifaTUSD != null
        ? bill.tarifaTE + bill.tarifaTUSD
        : null;
    const tarifaCompletaComTributos =
      tarifaTotal != null
        ? tarifaTotal / (1 - TRIBUTOS_EFETIVOS_PADRAO)
        : null;

    // === Consumo Instantâneo + anomalia ===
    // = geração inversor − injeção medidor (o que foi consumido na hora pela UC).
    // Se negativo → anomalia (típica: perda de WiFi do inversor faz a geração
    // reportada ficar abaixo da injeção real do medidor).
    let consumoInstantaneoKwh: number | null = null;
    let anomalia: string | null = null;
    if (geracaoInversorKwh != null && bill.energiaInjetadaMedidorKwh != null) {
      const diff = geracaoInversorKwh - bill.energiaInjetadaMedidorKwh;
      if (diff < 0) {
        anomalia =
          "Geração reportada incompleta no período — possível perda de conexão do monitoramento. Verifique o status do inversor.";
        // Não computa parcela instantânea (irrealista).
        consumoInstantaneoKwh = null;
      } else {
        consumoInstantaneoKwh = diff;
      }
    }

    // === Consumo TOTAL real do cliente = rede + autoconsumo instantâneo ===
    const consumoRedeKwh = bill.consumoKwh ?? null;
    const consumoTotalKwh =
      consumoRedeKwh != null
        ? consumoRedeKwh + (consumoInstantaneoKwh ?? 0)
        : null;

    // === Economia ===
    // Compensada paga ICMS (legislação atual em RS) → tarifa só TE+TUSD.
    // Instantânea nunca passou pela rede → cliente economiza tributos completos.
    const energiaCompensadaKwh = bill.energiaCompensada ?? null;
    const economiaCompensadaRs =
      energiaCompensadaKwh != null && tarifaTotal != null
        ? energiaCompensadaKwh * tarifaTotal
        : null;
    const economiaInstantaneaRs =
      consumoInstantaneoKwh != null && tarifaCompletaComTributos != null
        ? consumoInstantaneoKwh * tarifaCompletaComTributos
        : null;

    const economiaMensalRs =
      economiaCompensadaRs == null && economiaInstantaneaRs == null
        ? null
        : (economiaCompensadaRs ?? 0) + (economiaInstantaneaRs ?? 0);

    economiaAcumulada += economiaMensalRs ?? 0;
    const saldoPaybackRs = investimentoTotal - economiaAcumulada;

    const desempenhoPct =
      geracaoInversorKwh != null && geracaoEsperadaMensalKwh > 0
        ? (geracaoInversorKwh / geracaoEsperadaMensalKwh) * 100
        : null;
    const retornoPct =
      economiaMensalRs != null && investimentoTotal > 0
        ? (economiaMensalRs / investimentoTotal) * 100
        : null;

    meses.push({
      ano: bill.anoReferencia,
      mes: bill.mesReferencia,
      janela: {
        inicio: inicio.toISOString(),
        fim: fim.toISOString(),
        fonte,
      },
      geracaoInversorKwh,
      injetadaMedidorKwh: bill.energiaInjetadaMedidorKwh,
      consumoRedeKwh,
      consumoInstantaneoKwh,
      consumoTotalKwh,
      saldoCreditosKwh: bill.saldoCreditos,
      energiaCompensadaKwh,
      tarifaTotal,
      tarifaCompletaComTributos,
      economiaCompensadaRs,
      economiaInstantaneaRs,
      economiaMensalRs,
      economiaAcumuladaRs: economiaAcumulada,
      saldoPaybackRs,
      faturadoRs: bill.valorTotal,
      desempenhoPct,
      retornoPct,
      anomalia,
      inversoresErros,
    });
  }

  const economiasValidas = meses
    .map((m) => m.economiaMensalRs)
    .filter((v): v is number => v != null && v > 0);
  const economiaMediaMensalRs =
    economiasValidas.length > 0
      ? economiasValidas.reduce((a, b) => a + b, 0) / economiasValidas.length
      : 0;
  const saldoFinal =
    meses.length > 0
      ? meses[meses.length - 1].saldoPaybackRs
      : investimentoTotal;
  const paybackQuitado = saldoFinal <= 0;

  const ultimoMes = meses.length > 0
    ? { ano: meses[meses.length - 1].ano, mes: meses[meses.length - 1].mes }
    : { ano: new Date().getFullYear(), mes: new Date().getMonth() + 1 };
  const params = await getRelatorioParametros();
  const projecao = projetarPayback(
    saldoFinal,
    economiaMediaMensalRs,
    ultimoMes,
    params.reajusteTarifaAnual,
    params.depreciacaoModuloAnual,
  );
  const paybackRestanteMeses = projecao?.mesesProjetados ?? 0;
  const paybackQuitacaoPrevista = projecao
    ? { ano: projecao.ano, mes: projecao.mes }
    : null;

  const retornoTotalPct =
    investimentoTotal > 0 ? (economiaAcumulada / investimentoTotal) * 100 : 0;

  return {
    proprietario,
    uc: {
      id: uc.id,
      codigoUc: uc.codigoUc,
      nome: uc.nome,
      distribuidora: uc.distribuidora,
    },
    usinasMonitoradas: monitoringClients.map((c) => ({
      id: c.id,
      nome: c.nome,
      potenciaInstalada: c.potenciaInstalada,
      investimento: c.investimento,
      plataforma: c.plataformaMonitoramento,
    })),
    investimentoTotal,
    potenciaTotalKwp,
    geracaoEsperadaMensalKwh,
    geracaoEsperadaAnualKwh,
    economiaMediaMensalRs,
    retornoTotalPct,
    paybackRestanteMeses,
    paybackQuitacaoPrevista,
    paybackQuitado,
    meses,
  };
}

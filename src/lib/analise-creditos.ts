import { prisma } from "@/lib/prisma";
import {
  carregarContextoSugestoes,
  gerarSugestoesParaAcao,
  type Sugestao,
} from "@/lib/sugestoes-acoes";

// Severidade visual: info (informativo, não bloqueia), atencao (precisa
// olhar essa semana), critico (perda de receita iminente).
export type Severidade = "info" | "atencao" | "critico";

export type AcaoTipo =
  | "CREDITOS_VENCENDO_30D"
  | "USINA_SUBPERFORMANDO"
  | "UC_SEM_FATURA_MES"
  | "USINA_SEM_RATEIO_VIGENTE"
  | "USINA_OFFLINE_30D"
  | "CONSUMO_ANOMALO"
  | "OPORTUNIDADE_CAPTACAO";

export interface AcaoRecomendada {
  tipo: AcaoTipo;
  severidade: Severidade;
  titulo: string;
  descricao: string;
  prazoDias: 30 | 60 | 90;
  plantId?: string;
  plantName?: string;
  consumerUnitId?: string;
  consumerUnitCodigo?: string;
  metricaValor?: number;
  metricaLabel?: string;
  // Sugestões in-memory por ação — geradas a cada compute (não persistidas).
  sugestoes?: Sugestao[];
}

export interface TopPlantSlice {
  plantId: string;
  plantName: string;
  kwh: number;
  reais: number;
  pctDoTotal: number; // 0..1
}

export interface TrendValue {
  atual: number;
  anterior: number | null;
  deltaPct: number | null; // null quando anterior é 0/null
  direcao: "up" | "down" | "flat" | "na";
}

export interface CardSaldo {
  kwh: number;
  reais: number;
  ucs: number;
  usinas: number;
  trend: TrendValue;
  sparkline: number[]; // últimos 6 meses, ordem crescente (mês mais antigo primeiro)
}

export interface CardVencendo {
  kwh: number;
  reais: number;
  ucs: number;
  trend: TrendValue;
  sparkline: number[];
  topPlants: TopPlantSlice[];
  pctDoSaldo: number | null; // vencendo / saldo total (0..1) — null quando saldo=0
}

export interface CardEficiencia {
  pct: number | null;
  usinasMonitoradas: number;
  periodoDias: number;
  janelaTermina: string; // ISO
  piorUsina: { plantId: string; plantName: string; pct: number } | null;
  trend: TrendValue;
}

export interface CardSemCobertura {
  count: number;
  plantsSemRateio: number;
}

export interface AnaliseCreditosCards {
  creditosDisponiveis: CardSaldo;
  vencendo30d: CardVencendo;
  vencendoIndisponivel6090: true;
  eficienciaMedia: CardEficiencia;
  ucsSemCobertura: CardSemCobertura;
}

export interface UcFaltante {
  consumerUnitId: string;
  codigoUc: string;
  nome: string;
  plantId: string | null;
  plantName: string | null;
}

export interface CompletudeFaturas {
  mes: number;
  ano: number;
  ucsEsperadas: number;
  ucsComFatura: number;
  ucsFaltantes: UcFaltante[];
  percentual: number; // 0..1
  completo: boolean;
}

// Linha por usina pra tabela "Saúde por usina".
export interface PlantHealthRow {
  plantId: string;
  plantName: string;
  ucsCount: number;
  ucsFaltantesMes: number;
  saldoKwh: number;
  saldoReais: number;
  vencendoKwh: number;
  vencendoReais: number;
  prPct: number | null;
  temRateioVigente: boolean;
  acoesAbertas: number;
  status: "ok" | "atencao" | "critico";
}

export interface AnaliseCreditosResult {
  cards: AnaliseCreditosCards;
  saudePorUsina: PlantHealthRow[];
  acoes: AcaoRecomendada[];
  completude: CompletudeFaturas;
  totaisPorPrazo: { d30: number; d60: number; d90: number };
  totaisPorSeveridade: { info: number; atencao: number; critico: number };
  precoMedioKwhReais: number; // R$/kWh usado pra converter kWh → R$
  geradoEm: string;
  filtros: { plantId?: string; investorId?: string; mes: number; ano: number };
}

export interface AnaliseFiltros {
  plantId?: string;
  investorId?: string;
  mes?: number;
  ano?: number;
}

const THRESHOLDS = {
  eficienciaCritica: 0.7,
  eficienciaAtencao: 0.8,
  vencendoCritico: 500,
  vencendoAtencao: 100,
  semMonitoramentoDias: 30,
  janelaEficienciaDias: 90,
  consumoAnomaloPct: 0.5, // 50% acima ou abaixo da média histórica
  consumoAnomaloMesesBase: 6,
  consumoMinimoKwh: 50, // ignora UCs com consumo desprezível pra evitar ruído
  precoKwhFallback: 0.75, // R$/kWh quando não dá pra inferir das faturas
  // Captação: usina com vencendoKwh > este threshold em ao menos N dos
  // últimos M meses vira ação OPORTUNIDADE_CAPTACAO.
  captacaoVencendoKwhMin: 200,
  captacaoMinMesesEmRisco: 2, // dos últimos 3 (inclui o atual)
  captacaoJanelaMeses: 3,
  consumoMedioUcKwh: 250, // usado pra sugerir nº de UCs no lead
} as const;

// Helpers de data:
function mesAnteriorDe(mes: number, ano: number): { mes: number; ano: number } {
  return mes === 1 ? { mes: 12, ano: ano - 1 } : { mes: mes - 1, ano };
}

function fimDoMes(mes: number, ano: number): Date {
  return new Date(ano, mes, 0, 23, 59, 59, 999);
}

function janelaMesesAtras(
  mes: number,
  ano: number,
  meses: number,
): { mes: number; ano: number }[] {
  const out: { mes: number; ano: number }[] = [];
  let m = mes;
  let a = ano;
  for (let i = 0; i < meses; i++) {
    out.unshift({ mes: m, ano: a });
    const prev = mesAnteriorDe(m, a);
    m = prev.mes;
    a = prev.ano;
  }
  return out;
}

function calcDelta(atual: number, anterior: number | null): TrendValue {
  if (anterior == null) {
    return { atual, anterior: null, deltaPct: null, direcao: "na" };
  }
  if (anterior === 0) {
    return {
      atual,
      anterior: 0,
      deltaPct: null,
      direcao: atual > 0 ? "up" : "flat",
    };
  }
  const deltaPct = (atual - anterior) / Math.abs(anterior);
  let direcao: TrendValue["direcao"] = "flat";
  if (Math.abs(deltaPct) > 0.02) direcao = deltaPct > 0 ? "up" : "down";
  return { atual, anterior, deltaPct, direcao };
}

export async function computeAnaliseCreditos(
  filtros: AnaliseFiltros = {},
): Promise<AnaliseCreditosResult> {
  const hoje = new Date();
  const mes = filtros.mes ?? hoje.getMonth() + 1;
  const ano = filtros.ano ?? hoje.getFullYear();
  const anterior = mesAnteriorDe(mes, ano);
  const janela6m = janelaMesesAtras(mes, ano, 6);

  // Janela de eficiência: termina no fim do mês escolhido (consistente
  // com o resto). Pra mês corrente isso vira "até agora"; pra mês passado
  // é uma janela retrospectiva.
  const fimJanelaEf = fimDoMes(mes, ano);
  if (fimJanelaEf > hoje) fimJanelaEf.setTime(hoje.getTime());
  const inicioJanelaEf = new Date(fimJanelaEf);
  inicioJanelaEf.setDate(inicioJanelaEf.getDate() - THRESHOLDS.janelaEficienciaDias);

  // Mesma janela mas pro mês anterior — usado pra tendência de eficiência
  const fimJanelaEfAnt = fimDoMes(anterior.mes, anterior.ano);
  const inicioJanelaEfAnt = new Date(fimJanelaEfAnt);
  inicioJanelaEfAnt.setDate(
    inicioJanelaEfAnt.getDate() - THRESHOLDS.janelaEficienciaDias,
  );

  const inicioSemMonit = new Date(hoje);
  inicioSemMonit.setDate(inicioSemMonit.getDate() - THRESHOLDS.semMonitoramentoDias);

  // 1) Escopo de plants
  const plantWhere: { id?: string; investors?: { some: { investorId: string } } } = {};
  if (filtros.plantId) plantWhere.id = filtros.plantId;
  if (filtros.investorId)
    plantWhere.investors = { some: { investorId: filtros.investorId } };

  const plants = await prisma.plant.findMany({
    where: { active: true, ...plantWhere },
    select: {
      id: true,
      name: true,
      usinaDeInvestidor: true,
      location: true,
    },
  });
  const plantIds = plants.map((p) => p.id);
  const plantById = new Map(plants.map((p) => [p.id, p]));

  // 2) UCs ativas no escopo
  const ucs = await prisma.consumerUnit.findMany({
    where: { active: true, plantId: { in: plantIds } },
    select: { id: true, codigoUc: true, nome: true, plantId: true },
  });
  const ucIds = ucs.map((u) => u.id);
  const ucById = new Map(ucs.map((u) => [u.id, u]));

  // 3) Bills dos últimos 6 meses em UMA query — alimenta cards, sparklines,
  //    tendência, consumo anômalo e completude do mês atual.
  const oldest = janela6m[0];
  const bills = ucIds.length
    ? await prisma.consumerBill.findMany({
        where: {
          consumerUnitId: { in: ucIds },
          OR: janela6m.map((m) => ({
            mesReferencia: m.mes,
            anoReferencia: m.ano,
          })),
        },
        select: {
          consumerUnitId: true,
          plantId: true,
          mesReferencia: true,
          anoReferencia: true,
          saldoCreditos: true,
          saldoExpirarProxMesKwh: true,
          consumoKwh: true,
          valorTotalCalculado: true,
          valorTotal: true,
        },
      })
    : [];
  void oldest;

  // Index por (uc, mes, ano) e por (mes, ano) — pra rápido lookup
  type BillSlim = {
    consumerUnitId: string;
    plantId: string | null;
    mes: number;
    ano: number;
    saldoCreditos: number | null;
    saldoExpirarProxMesKwh: number | null;
    consumoKwh: number | null;
    valorEfetivo: number | null;
  };
  const billsSlim: BillSlim[] = bills
    .filter((b) => b.consumerUnitId)
    .map((b) => ({
      consumerUnitId: b.consumerUnitId as string,
      plantId: b.plantId,
      mes: b.mesReferencia,
      ano: b.anoReferencia,
      saldoCreditos: b.saldoCreditos,
      saldoExpirarProxMesKwh: b.saldoExpirarProxMesKwh,
      consumoKwh: b.consumoKwh,
      valorEfetivo: b.valorTotalCalculado ?? b.valorTotal ?? null,
    }));

  // Preço médio R$/kWh derivado das faturas do mês de referência (no escopo).
  // Sem fatura suficiente, usa fallback. Marca no payload pra ficar claro.
  let valorSum = 0;
  let consumoSum = 0;
  for (const b of billsSlim) {
    if (b.mes !== mes || b.ano !== ano) continue;
    if (b.valorEfetivo != null && b.consumoKwh && b.consumoKwh > 0) {
      valorSum += b.valorEfetivo;
      consumoSum += b.consumoKwh;
    }
  }
  const precoMedioKwh =
    consumoSum > 0 ? valorSum / consumoSum : THRESHOLDS.precoKwhFallback;

  // Agregados por mês (saldo e vencendo no escopo todo) pra sparkline + tendência
  const aggPorMes = new Map<
    string,
    { saldoKwh: number; vencendoKwh: number; ucsComBill: number }
  >();
  for (const b of billsSlim) {
    const key = `${b.ano}-${b.mes}`;
    const cur = aggPorMes.get(key) ?? {
      saldoKwh: 0,
      vencendoKwh: 0,
      ucsComBill: 0,
    };
    cur.saldoKwh += b.saldoCreditos && b.saldoCreditos > 0 ? b.saldoCreditos : 0;
    cur.vencendoKwh +=
      b.saldoExpirarProxMesKwh && b.saldoExpirarProxMesKwh > 0
        ? b.saldoExpirarProxMesKwh
        : 0;
    cur.ucsComBill++;
    aggPorMes.set(key, cur);
  }

  const sparklineSaldo = janela6m.map(
    (m) => aggPorMes.get(`${m.ano}-${m.mes}`)?.saldoKwh ?? 0,
  );
  const sparklineVencendo = janela6m.map(
    (m) => aggPorMes.get(`${m.ano}-${m.mes}`)?.vencendoKwh ?? 0,
  );

  const aggAtual = aggPorMes.get(`${ano}-${mes}`) ?? {
    saldoKwh: 0,
    vencendoKwh: 0,
    ucsComBill: 0,
  };
  const aggAnterior = aggPorMes.get(`${anterior.ano}-${anterior.mes}`) ?? null;

  // 4) Por UC do mês — pra completude + agregação por plant + consumo anômalo
  const billPorUcDoMes = new Map<string, BillSlim>();
  for (const b of billsSlim) {
    if (b.mes === mes && b.ano === ano) billPorUcDoMes.set(b.consumerUnitId, b);
  }

  // Completude
  const ucsFaltantes: UcFaltante[] = [];
  for (const uc of ucs) {
    if (billPorUcDoMes.has(uc.id)) continue;
    const plant = uc.plantId ? plantById.get(uc.plantId) : null;
    ucsFaltantes.push({
      consumerUnitId: uc.id,
      codigoUc: uc.codigoUc,
      nome: uc.nome,
      plantId: uc.plantId,
      plantName: plant?.name ?? null,
    });
  }
  ucsFaltantes.sort(
    (a, b) =>
      (a.plantName ?? "").localeCompare(b.plantName ?? "") ||
      a.nome.localeCompare(b.nome),
  );
  const ucsComFatura = ucs.length - ucsFaltantes.length;
  const percentual = ucs.length === 0 ? 1 : ucsComFatura / ucs.length;
  const completude: CompletudeFaturas = {
    mes,
    ano,
    ucsEsperadas: ucs.length,
    ucsComFatura,
    ucsFaltantes,
    percentual,
    completo: ucs.length === 0 || ucsFaltantes.length === 0,
  };

  // 5) Cards saldo + vencendo agregados por plant (pra top contribuidores)
  const saldoPorPlant = new Map<string, { kwh: number; ucs: number }>();
  const vencendoPorPlant = new Map<string, { kwh: number; ucs: number }>();
  let saldoTotal = 0;
  let ucsComSaldo = 0;
  let vencendoTotal = 0;
  let ucsVencendo = 0;
  for (const uc of ucs) {
    const b = billPorUcDoMes.get(uc.id);
    if (!b) continue;
    if (b.saldoCreditos && b.saldoCreditos > 0) {
      saldoTotal += b.saldoCreditos;
      ucsComSaldo++;
      if (uc.plantId) {
        const cur = saldoPorPlant.get(uc.plantId) ?? { kwh: 0, ucs: 0 };
        cur.kwh += b.saldoCreditos;
        cur.ucs++;
        saldoPorPlant.set(uc.plantId, cur);
      }
    }
    if (b.saldoExpirarProxMesKwh && b.saldoExpirarProxMesKwh > 0) {
      vencendoTotal += b.saldoExpirarProxMesKwh;
      ucsVencendo++;
      if (uc.plantId) {
        const cur = vencendoPorPlant.get(uc.plantId) ?? { kwh: 0, ucs: 0 };
        cur.kwh += b.saldoExpirarProxMesKwh;
        cur.ucs++;
        vencendoPorPlant.set(uc.plantId, cur);
      }
    }
  }

  // Top 3 contribuidores de vencimento
  const topPlantsVencendo: TopPlantSlice[] = [];
  for (const [pid, v] of vencendoPorPlant) {
    const plant = plantById.get(pid);
    if (!plant) continue;
    topPlantsVencendo.push({
      plantId: pid,
      plantName: plant.name,
      kwh: v.kwh,
      reais: v.kwh * precoMedioKwh,
      pctDoTotal: vencendoTotal > 0 ? v.kwh / vencendoTotal : 0,
    });
  }
  topPlantsVencendo.sort((a, b) => b.kwh - a.kwh);
  const topPlantsVencendoSliced = topPlantsVencendo.slice(0, 3);

  // 6) Eficiência: janela 90d terminando no fim do mês escolhido + mês anterior
  const clientes = await prisma.brasilSolarClient.findMany({
    where: { plantId: { in: plantIds } },
    select: { id: true, plantId: true },
  });
  const clientIds = clientes.map((c) => c.id);
  const plantIdByClient = new Map(
    clientes.map((c) => [c.id, c.plantId] as const),
  );

  // Pegamos UMA janela larga (cobre atual + anterior) e fatiamos em memória
  const inicioMaisAntigo = inicioJanelaEfAnt < inicioJanelaEf ? inicioJanelaEfAnt : inicioJanelaEf;
  const fimMaisRecente = fimJanelaEf > fimJanelaEfAnt ? fimJanelaEf : fimJanelaEfAnt;
  const logs = clientIds.length
    ? await prisma.monitoringLog.findMany({
        where: {
          clientId: { in: clientIds },
          data: { gte: inicioMaisAntigo, lte: fimMaisRecente },
        },
        select: {
          clientId: true,
          data: true,
          geracaoDiaria: true,
          geracaoEsperada: true,
        },
      })
    : [];

  const efPorPlantAtual = new Map<string, { real: number; esperado: number }>();
  const efPorPlantAnt = new Map<string, { real: number; esperado: number }>();
  for (const log of logs) {
    const plantId = plantIdByClient.get(log.clientId);
    if (!plantId) continue;
    if (log.data >= inicioJanelaEf && log.data <= fimJanelaEf) {
      const cur = efPorPlantAtual.get(plantId) ?? { real: 0, esperado: 0 };
      cur.real += log.geracaoDiaria;
      cur.esperado += log.geracaoEsperada ?? 0;
      efPorPlantAtual.set(plantId, cur);
    }
    if (log.data >= inicioJanelaEfAnt && log.data <= fimJanelaEfAnt) {
      const cur = efPorPlantAnt.get(plantId) ?? { real: 0, esperado: 0 };
      cur.real += log.geracaoDiaria;
      cur.esperado += log.geracaoEsperada ?? 0;
      efPorPlantAnt.set(plantId, cur);
    }
  }

  let efRealAtual = 0;
  let efEspAtual = 0;
  let usinasComMonit = 0;
  let piorUsina: { plantId: string; plantName: string; pct: number } | null = null;
  const prPorPlant = new Map<string, number>();
  for (const [pid, v] of efPorPlantAtual) {
    if (v.esperado > 0) {
      efRealAtual += v.real;
      efEspAtual += v.esperado;
      usinasComMonit++;
      const pr = v.real / v.esperado;
      prPorPlant.set(pid, pr);
      const plant = plantById.get(pid);
      if (plant && (!piorUsina || pr < piorUsina.pct)) {
        piorUsina = { plantId: pid, plantName: plant.name, pct: pr };
      }
    }
  }
  const eficienciaPctAtual = efEspAtual > 0 ? efRealAtual / efEspAtual : null;

  let efRealAnt = 0;
  let efEspAnt = 0;
  for (const v of efPorPlantAnt.values()) {
    if (v.esperado > 0) {
      efRealAnt += v.real;
      efEspAnt += v.esperado;
    }
  }
  const eficienciaPctAnt = efEspAnt > 0 ? efRealAnt / efEspAnt : null;

  // 7) UCs sem rateio
  const rateios = await prisma.rateioVersion.findMany({
    where: { plantId: { in: plantIds }, status: "VIGENTE" },
    select: { plantId: true },
  });
  const plantsComRateio = new Set(rateios.map((r) => r.plantId));
  const ucsSemRateio = ucs.filter(
    (u) => u.plantId && !plantsComRateio.has(u.plantId),
  ).length;
  const plantsSemRateio = plants.filter(
    (p) => !plantsComRateio.has(p.id),
  ).length;

  // 8) Ações
  const acoes: AcaoRecomendada[] = [];

  for (const [plantId, v] of vencendoPorPlant) {
    if (v.kwh < THRESHOLDS.vencendoAtencao) continue;
    const plant = plantById.get(plantId);
    const severidade: Severidade =
      v.kwh >= THRESHOLDS.vencendoCritico ? "critico" : "atencao";
    acoes.push({
      tipo: "CREDITOS_VENCENDO_30D",
      severidade,
      titulo: `${plant?.name ?? plantId}: ${v.kwh.toFixed(0)} kWh vencendo em até 30 dias`,
      descricao: `≈ R$ ${(v.kwh * precoMedioKwh).toFixed(0)} em risco. Aumente cobertura (rateio) ou intensifique consumo das UCs vinculadas.`,
      prazoDias: 30,
      plantId,
      plantName: plant?.name,
      metricaValor: v.kwh,
      metricaLabel: "kWh em risco",
    });
  }

  for (const [plantId, pr] of prPorPlant) {
    if (pr >= THRESHOLDS.eficienciaAtencao) continue;
    const plant = plantById.get(plantId);
    const severidade: Severidade =
      pr < THRESHOLDS.eficienciaCritica ? "critico" : "atencao";
    acoes.push({
      tipo: "USINA_SUBPERFORMANDO",
      severidade,
      titulo: `${plant?.name ?? plantId}: PR ${(pr * 100).toFixed(0)}% (90 dias)`,
      descricao:
        "Geração abaixo do esperado. Investigar sujeira, sombreamento, falha de inversor ou recalibrar geração esperada.",
      prazoDias: 30,
      plantId,
      plantName: plant?.name,
      metricaValor: pr * 100,
      metricaLabel: "% PR",
    });
  }

  for (const f of ucsFaltantes) {
    acoes.push({
      tipo: "UC_SEM_FATURA_MES",
      severidade: "atencao",
      titulo: `UC ${f.codigoUc} (${f.nome}) sem fatura de ${String(mes).padStart(2, "0")}/${ano}`,
      descricao:
        "Subir a fatura (upload manual) ou rodar sync com a distribuidora pra fechar o mês.",
      prazoDias: 30,
      consumerUnitId: f.consumerUnitId,
      consumerUnitCodigo: f.codigoUc,
      plantId: f.plantId ?? undefined,
      plantName: f.plantName ?? undefined,
    });
  }

  for (const plant of plants) {
    if (!plant.usinaDeInvestidor) continue;
    if (plantsComRateio.has(plant.id)) continue;
    acoes.push({
      tipo: "USINA_SEM_RATEIO_VIGENTE",
      severidade: "critico",
      titulo: `${plant.name}: sem rateio vigente`,
      descricao:
        "Créditos gerados não têm destino formal. Criar/aprovar nova RateioVersion.",
      prazoDias: 30,
      plantId: plant.id,
      plantName: plant.name,
    });
  }

  const ultimaLeituraPorClient = new Map<string, Date>();
  for (const log of logs) {
    const cur = ultimaLeituraPorClient.get(log.clientId);
    if (!cur || log.data > cur)
      ultimaLeituraPorClient.set(log.clientId, log.data);
  }
  for (const cliente of clientes) {
    const ultima = ultimaLeituraPorClient.get(cliente.id);
    if (ultima && ultima >= inicioSemMonit) continue;
    if (!cliente.plantId) continue;
    const plant = plantById.get(cliente.plantId);
    acoes.push({
      tipo: "USINA_OFFLINE_30D",
      severidade: "atencao",
      titulo: `${plant?.name ?? cliente.plantId}: monitoramento sem leitura há +30 dias`,
      descricao:
        "Sem dado novo do inversor — sistema pode estar offline. Verificar conexão e credenciais da plataforma.",
      prazoDias: 30,
      plantId: cliente.plantId,
      plantName: plant?.name,
    });
  }

  // Consumo anômalo: UC com consumo do mês ≥50% acima/abaixo da REFERÊNCIA.
  // Referência preferencial: mesmo mês do ano anterior (captura sazonalidade
  // — UC residencial cai naturalmente em janeiro, UC comercial em dezembro).
  // Fallback: média móvel dos últimos 5 meses fechados.
  // Suprime UCs com ConsumoBaseline ativo cobrindo mes/ano de referência.
  const baselinesAtivas = ucs.length
    ? await prisma.consumoBaseline.findMany({
        where: {
          consumerUnitId: { in: ucs.map((u) => u.id) },
          OR: [
            { validoAteAno: { gt: ano } },
            { validoAteAno: ano, validoAteMes: { gte: mes } },
          ],
        },
        select: { consumerUnitId: true },
      })
    : [];
  const ucsComBaselineAtiva = new Set(
    baselinesAtivas.map((b) => b.consumerUnitId),
  );

  // Baseline sazonal: bills do mesmo mês ano anterior (uma query rápida)
  const billsSazonais = ucs.length
    ? await prisma.consumerBill.findMany({
        where: {
          consumerUnitId: { in: ucs.map((u) => u.id) },
          mesReferencia: mes,
          anoReferencia: ano - 1,
        },
        select: { consumerUnitId: true, consumoKwh: true },
      })
    : [];
  const consumoSazonalPorUc = new Map<string, number>();
  for (const b of billsSazonais) {
    if (b.consumerUnitId && b.consumoKwh && b.consumoKwh > 0) {
      consumoSazonalPorUc.set(b.consumerUnitId, b.consumoKwh);
    }
  }

  for (const uc of ucs) {
    if (ucsComBaselineAtiva.has(uc.id)) continue;
    const billAtual = billPorUcDoMes.get(uc.id);
    if (!billAtual || !billAtual.consumoKwh) continue;
    if (billAtual.consumoKwh < THRESHOLDS.consumoMinimoKwh) continue;

    // Tenta baseline sazonal (mes-12). Se UC tem bill desse mês ano passado,
    // é o critério mais "honesto" pra detectar anomalia real.
    const consumoSazonal = consumoSazonalPorUc.get(uc.id);
    let referencia: number;
    let baselineLabel: string;
    let baselineAmostra: number;

    if (consumoSazonal && consumoSazonal >= THRESHOLDS.consumoMinimoKwh) {
      referencia = consumoSazonal;
      baselineLabel = `mesmo mês de ${ano - 1}`;
      baselineAmostra = 1;
    } else {
      // Fallback: média móvel dos últimos 5 meses fechados
      const historicos = billsSlim
        .filter(
          (b) =>
            b.consumerUnitId === uc.id &&
            !(b.mes === mes && b.ano === ano) &&
            b.consumoKwh != null &&
            b.consumoKwh > 0,
        )
        .slice(0, THRESHOLDS.consumoAnomaloMesesBase - 1);
      if (historicos.length < 2) continue;
      const media =
        historicos.reduce((s, b) => s + (b.consumoKwh ?? 0), 0) /
        historicos.length;
      if (media < THRESHOLDS.consumoMinimoKwh) continue;
      referencia = media;
      baselineLabel = `média ${historicos.length}m`;
      baselineAmostra = historicos.length;
    }

    const delta = (billAtual.consumoKwh - referencia) / referencia;
    if (Math.abs(delta) < THRESHOLDS.consumoAnomaloPct) continue;

    const plant = uc.plantId ? plantById.get(uc.plantId) : null;
    const subiu = delta > 0;
    acoes.push({
      tipo: "CONSUMO_ANOMALO",
      severidade: Math.abs(delta) > 1 ? "critico" : "atencao",
      titulo: `UC ${uc.codigoUc} (${uc.nome}): consumo ${subiu ? "subiu" : "caiu"} ${(Math.abs(delta) * 100).toFixed(0)}%`,
      descricao: `Mês: ${billAtual.consumoKwh.toFixed(0)} kWh · Referência (${baselineLabel}): ${referencia.toFixed(0)} kWh${
        baselineAmostra === 1 ? " — comparação sazonal" : ""
      }. ${
        subiu
          ? "Investigar novo consumo, troca de inquilino, fuga ou erro de leitura."
          : "Pode ser UC desocupada, troca de medidor ou erro de leitura — afeta a compensação."
      }`,
      prazoDias: 30,
      consumerUnitId: uc.id,
      consumerUnitCodigo: uc.codigoUc,
      plantId: uc.plantId ?? undefined,
      plantName: plant?.name,
      metricaValor: delta * 100,
      metricaLabel: subiu ? "% acima" : "% abaixo",
    });
  }

  // 8.6 OPORTUNIDADE_CAPTACAO — usinas com saldo crônicamente vencendo
  //     há N dos últimos M meses. Sinaliza lead pro comercial: quanto
  //     poderia ser captado em UCs novas pra absorver o excesso.
  {
    // vencendoKwh por (plant, mes, ano) — derivado dos bills já carregados
    const vencendoPorPlantMes = new Map<string, Map<string, number>>();
    for (const b of billsSlim) {
      if (!b.plantId) continue;
      const key = `${b.ano}-${b.mes}`;
      const inner = vencendoPorPlantMes.get(b.plantId) ?? new Map<string, number>();
      const venc = b.saldoExpirarProxMesKwh && b.saldoExpirarProxMesKwh > 0
        ? b.saldoExpirarProxMesKwh
        : 0;
      inner.set(key, (inner.get(key) ?? 0) + venc);
      vencendoPorPlantMes.set(b.plantId, inner);
    }
    const janelaCapt = janela6m.slice(-THRESHOLDS.captacaoJanelaMeses);
    for (const plant of plants) {
      const inner = vencendoPorPlantMes.get(plant.id);
      if (!inner) continue;
      let mesesEmRisco = 0;
      let maiorVencendo = 0;
      let totalVencendoJanela = 0;
      for (const m of janelaCapt) {
        const v = inner.get(`${m.ano}-${m.mes}`) ?? 0;
        if (v > THRESHOLDS.captacaoVencendoKwhMin) {
          mesesEmRisco++;
          totalVencendoJanela += v;
          if (v > maiorVencendo) maiorVencendo = v;
        }
      }
      if (mesesEmRisco < THRESHOLDS.captacaoMinMesesEmRisco) continue;
      const mediaMensal = totalVencendoJanela / mesesEmRisco;
      const ucsSugeridas = Math.max(
        1,
        Math.round(mediaMensal / THRESHOLDS.consumoMedioUcKwh),
      );
      const cidade = plant.location?.trim() || "região da usina";
      const reaisAnoPerdido = mediaMensal * 12 * precoMedioKwh;
      acoes.push({
        tipo: "OPORTUNIDADE_CAPTACAO",
        severidade: mesesEmRisco >= 3 ? "critico" : "atencao",
        titulo: `${plant.name}: captar ~${ucsSugeridas} UC(s) pra absorver ${mediaMensal.toFixed(0)} kWh/mês`,
        descricao: `Saldo vencendo por ${mesesEmRisco} dos últimos ${THRESHOLDS.captacaoJanelaMeses} meses (média ${mediaMensal.toFixed(0)} kWh/mês). Em 12 meses isso equivale a ≈ R$ ${reaisAnoPerdido.toFixed(0)} em receita não capturada. Buscar clientes em ${cidade}.`,
        prazoDias: 90, // captação é processo comercial — janela longa
        plantId: plant.id,
        plantName: plant.name,
        metricaValor: mediaMensal,
        metricaLabel: "kWh/mês ociosos",
      });
    }
  }

  // 9) Saúde por usina — agrega tudo numa linha por plant
  const acoesPorPlant = new Map<string, number>();
  for (const a of acoes) {
    if (!a.plantId) continue;
    acoesPorPlant.set(a.plantId, (acoesPorPlant.get(a.plantId) ?? 0) + 1);
  }
  const ucsPorPlantCount = new Map<string, number>();
  const ucsFaltantesPorPlant = new Map<string, number>();
  for (const uc of ucs) {
    if (!uc.plantId) continue;
    ucsPorPlantCount.set(
      uc.plantId,
      (ucsPorPlantCount.get(uc.plantId) ?? 0) + 1,
    );
  }
  for (const f of ucsFaltantes) {
    if (!f.plantId) continue;
    ucsFaltantesPorPlant.set(
      f.plantId,
      (ucsFaltantesPorPlant.get(f.plantId) ?? 0) + 1,
    );
  }

  const saudePorUsina: PlantHealthRow[] = plants.map((p) => {
    const saldo = saldoPorPlant.get(p.id);
    const venc = vencendoPorPlant.get(p.id);
    const pr = prPorPlant.get(p.id) ?? null;
    const semRateio = !plantsComRateio.has(p.id);
    const acoesQtd = acoesPorPlant.get(p.id) ?? 0;
    // Status: critico se tem ação critica ou pr <70% ou semRateio (usinaDeInvestidor);
    // atencao se tem qualquer ação; ok caso contrário.
    let status: PlantHealthRow["status"] = "ok";
    if (
      (pr != null && pr < THRESHOLDS.eficienciaCritica) ||
      (p.usinaDeInvestidor && semRateio) ||
      (venc?.kwh ?? 0) >= THRESHOLDS.vencendoCritico
    ) {
      status = "critico";
    } else if (acoesQtd > 0) {
      status = "atencao";
    }
    return {
      plantId: p.id,
      plantName: p.name,
      ucsCount: ucsPorPlantCount.get(p.id) ?? 0,
      ucsFaltantesMes: ucsFaltantesPorPlant.get(p.id) ?? 0,
      saldoKwh: saldo?.kwh ?? 0,
      saldoReais: (saldo?.kwh ?? 0) * precoMedioKwh,
      vencendoKwh: venc?.kwh ?? 0,
      vencendoReais: (venc?.kwh ?? 0) * precoMedioKwh,
      prPct: pr,
      temRateioVigente: !semRateio,
      acoesAbertas: acoesQtd,
      status,
    };
  });
  // Ordena: críticos primeiro, depois atenção, depois ok; dentro de cada
  // grupo, maior saldo primeiro (mais "patrimônio" = mais prioritário).
  const statusRank: Record<PlantHealthRow["status"], number> = {
    critico: 0,
    atencao: 1,
    ok: 2,
  };
  saudePorUsina.sort((a, b) => {
    const s = statusRank[a.status] - statusRank[b.status];
    if (s !== 0) return s;
    return b.saldoKwh - a.saldoKwh;
  });

  // 10) Agregados de ações + ordenação
  const totaisPorPrazo = { d30: 0, d60: 0, d90: 0 };
  const totaisPorSeveridade = { info: 0, atencao: 0, critico: 0 };
  for (const a of acoes) {
    if (a.prazoDias === 30) totaisPorPrazo.d30++;
    else if (a.prazoDias === 60) totaisPorPrazo.d60++;
    else totaisPorPrazo.d90++;
    totaisPorSeveridade[a.severidade]++;
  }
  const severidadeRank: Record<Severidade, number> = {
    critico: 0,
    atencao: 1,
    info: 2,
  };
  acoes.sort((a, b) => {
    const sev = severidadeRank[a.severidade] - severidadeRank[b.severidade];
    if (sev !== 0) return sev;
    if (a.prazoDias !== b.prazoDias) return a.prazoDias - b.prazoDias;
    return (b.metricaValor ?? 0) - (a.metricaValor ?? 0);
  });

  // 11) Sugestões — depois do sort pra cada ação ter contexto enriquecido.
  // vencendoPorPlant é Map<plantId, {kwh, ucs}> — passamos só kwh pra
  // contexto. consumoPorUcDoMes alimenta o simulador de rebalanceamento.
  const vencendoKwhPorPlant = new Map<string, number>();
  for (const [pid, v] of vencendoPorPlant) {
    vencendoKwhPorPlant.set(pid, v.kwh);
  }
  const consumoPorUcDoMes = new Map<string, number>();
  for (const [ucId, bill] of billPorUcDoMes) {
    if (bill.consumoKwh && bill.consumoKwh > 0) {
      consumoPorUcDoMes.set(ucId, bill.consumoKwh);
    }
  }
  const ctxSugestoes = await carregarContextoSugestoes(
    plantIds,
    vencendoKwhPorPlant,
    consumoPorUcDoMes,
  );
  for (const a of acoes) {
    a.sugestoes = gerarSugestoesParaAcao(a, ctxSugestoes);
  }

  return {
    cards: {
      creditosDisponiveis: {
        kwh: saldoTotal,
        reais: saldoTotal * precoMedioKwh,
        ucs: ucsComSaldo,
        usinas: saldoPorPlant.size,
        trend: calcDelta(aggAtual.saldoKwh, aggAnterior?.saldoKwh ?? null),
        sparkline: sparklineSaldo,
      },
      vencendo30d: {
        kwh: vencendoTotal,
        reais: vencendoTotal * precoMedioKwh,
        ucs: ucsVencendo,
        trend: calcDelta(aggAtual.vencendoKwh, aggAnterior?.vencendoKwh ?? null),
        sparkline: sparklineVencendo,
        topPlants: topPlantsVencendoSliced,
        pctDoSaldo: saldoTotal > 0 ? vencendoTotal / saldoTotal : null,
      },
      vencendoIndisponivel6090: true,
      eficienciaMedia: {
        pct: eficienciaPctAtual,
        usinasMonitoradas: usinasComMonit,
        periodoDias: THRESHOLDS.janelaEficienciaDias,
        janelaTermina: fimJanelaEf.toISOString(),
        piorUsina,
        trend: calcDelta(
          eficienciaPctAtual ?? 0,
          eficienciaPctAnt ?? null,
        ),
      },
      ucsSemCobertura: {
        count: ucsSemRateio,
        plantsSemRateio,
      },
    },
    saudePorUsina,
    acoes,
    completude,
    totaisPorPrazo,
    totaisPorSeveridade,
    precoMedioKwhReais: precoMedioKwh,
    geradoEm: new Date().toISOString(),
    filtros: { ...filtros, mes, ano },
  };
}

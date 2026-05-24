import { prisma } from "@/lib/prisma";

// ============================================================
// Cálculo do Fechamento Financeiro (DRE) — regime de CAIXA.
// Toda agregação considera a data efetiva do pagamento/recebimento
// (pagoEm, comprovantePagamentoAt, pagoInvestidorEm), não a competência.
// ============================================================

export interface DrePeriodo {
  ano: number;
  mes: number;
}

export interface ReceitaItem {
  label: string;
  valor: number;
}

export interface CustoItem {
  label: string;
  valor: number;
  // Para custos fixos (rubricas), info adicional sobre a confirmação.
  rubricaId?: string;
  categoria?: string | null;
  confirmado?: boolean;
  valorPadrao?: number;
}

export interface InadimplenciaFaixa {
  label: string;
  qtd: number;
  valor: number;
}

export interface InadimplenciaFatura {
  id: string;
  consumerUnitId: string;
  ucCodigo: string | null;
  consumidorNome: string | null;
  ano: number;
  mes: number;
  valorCobranca: number;
  dataVencimento: string | null;
  diasAtraso: number;
}

export interface InadimplenciaResumo {
  total: number;
  qtdTotal: number;
  faixas: InadimplenciaFaixa[];
  faturas: InadimplenciaFatura[]; // top 20 por valor
  pctSobreReceita: number; // valor inadimplente / receita do mês
}

export interface DreResultado {
  ano: number;
  mes: number;

  // Receita (regime caixa)
  receitaAsaas: number; // boletos pagos no mês
  receitaGestao: number; // gestaoFixaAplicada dos settlements pagos no mês
  receitaBruta: number; // soma das duas
  receitaItems: ReceitaItem[];

  // Custos diretos (regime caixa)
  custoUsinas: number; // PlantBilling com comprovantePagamentoAt no mês
  custoInvestidorBruto: number; // totalLiquido + outrosAjustes dos settlements pagos no mês
  custoDireto: number; // soma
  custoUsinasItems: CustoItem[];
  custoInvestidorItems: CustoItem[];

  // Margem bruta
  margemBruta: number;
  margemBrutaPct: number;

  // Custos fixos (rubricas recorrentes)
  custosFixosTotal: number;
  rubricas: CustoItem[]; // todas as ativas; com flag confirmado

  // Imposto
  taxRatePercentual: number | null; // vigente no mês
  taxRateVigenciaInicio: Date | null;
  imposto: number;

  // Resultado
  lucroLiquido: number;
  margemLiquidaPct: number;

  // Indicadores físicos (extras)
  kwhInjetado: number;
  kwhCompensado: number;

  // Pontos de atenção
  alertas: string[];

  // Inadimplência (snapshot atual — não é do mês)
  inadimplencia: InadimplenciaResumo;
}

// ============================================================
// Helpers
// ============================================================

function monthRangeUtc(ano: number, mes: number): { start: Date; end: Date } {
  // [start, end) — primeiro dia 00:00:00 UTC do mês corrente até primeiro dia
  // do mês seguinte. Usamos UTC pra evitar drift de timezone.
  const start = new Date(Date.UTC(ano, mes - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(ano, mes, 1, 0, 0, 0));
  return { start, end };
}

function firstOfMonthUtc(ano: number, mes: number): Date {
  return new Date(Date.UTC(ano, mes - 1, 1, 12, 0, 0));
}

function pct(parte: number, total: number): number {
  if (!total) return 0;
  return (parte / total) * 100;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ============================================================
// Cálculos por componente
// ============================================================

async function getReceitaAsaas(ano: number, mes: number): Promise<number> {
  const { start, end } = monthRangeUtc(ano, mes);
  const rows = await prisma.consumerUnitBilling.findMany({
    where: {
      pagoEm: { gte: start, lt: end },
      valorCobranca: { not: null },
    },
    select: { valorCobranca: true },
  });
  return rows.reduce((acc, r) => acc + (r.valorCobranca ?? 0), 0);
}

async function getSettlementsPagos(ano: number, mes: number) {
  const { start, end } = monthRangeUtc(ano, mes);
  return prisma.investorSettlement.findMany({
    where: {
      status: "PUBLISHED",
      pagoEm: { gte: start, lt: end },
    },
    select: {
      id: true,
      totalLiquido: true,
      outrosAjustes: true,
      gestaoFixaAplicada: true,
      totalKwh: true,
      investor: {
        select: { user: { select: { name: true } } },
      },
    },
  });
}

async function getCustoUsinas(ano: number, mes: number): Promise<CustoItem[]> {
  const { start, end } = monthRangeUtc(ano, mes);
  const rows = await prisma.plantBilling.findMany({
    where: { comprovantePagamentoAt: { gte: start, lt: end } },
    select: {
      id: true,
      valorTotal: true,
      ano: true,
      mes: true,
      plant: { select: { name: true } },
    },
    orderBy: { comprovantePagamentoAt: "asc" },
  });
  return rows.map((r) => ({
    label: `${r.plant?.name ?? "Usina"} · ${String(r.mes).padStart(2, "0")}/${r.ano}`,
    valor: r.valorTotal ?? 0,
  }));
}

async function getRubricasDoMes(ano: number, mes: number): Promise<CustoItem[]> {
  const rubricas = await prisma.recurringCost.findMany({
    where: { ativo: true },
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
  });
  const entries = await prisma.recurringCostEntry.findMany({
    where: { ano, mes, recurringCostId: { in: rubricas.map((r) => r.id) } },
  });
  const entryByRubrica = new Map(entries.map((e) => [e.recurringCostId, e]));

  return rubricas.map<CustoItem>((r) => {
    const entry = entryByRubrica.get(r.id);
    return {
      rubricaId: r.id,
      label: r.nome,
      categoria: r.categoria,
      valorPadrao: r.valorPadrao,
      valor: entry ? entry.valor : r.valorPadrao,
      confirmado: !!entry,
    };
  });
}

async function getTaxRateVigente(ano: number, mes: number) {
  const data = firstOfMonthUtc(ano, mes);
  return prisma.taxRate.findFirst({
    where: { vigenciaInicio: { lte: data } },
    orderBy: { vigenciaInicio: "desc" },
  });
}

async function getInadimplencia(
  hoje: Date,
  receitaMes: number,
): Promise<InadimplenciaResumo> {
  // Snapshot atual: faturas com dataVencimento < hoje, ainda sem pagoEm,
  // não canceladas, com valor cobrado.
  const rows = await prisma.consumerUnitBilling.findMany({
    where: {
      pagoEm: null,
      dataVencimento: { lt: hoje, not: null },
      status: { notIn: ["CANCELADO", "PAGO"] },
      valorCobranca: { not: null, gt: 0 },
    },
    select: {
      id: true,
      consumerUnitId: true,
      ano: true,
      mes: true,
      valorCobranca: true,
      dataVencimento: true,
      consumerUnit: {
        select: {
          codigoUc: true,
          nome: true,
        },
      },
    },
    orderBy: { dataVencimento: "asc" },
  });

  const faixas: Record<string, InadimplenciaFaixa> = {
    "1-30 dias": { label: "1-30 dias", qtd: 0, valor: 0 },
    "31-60 dias": { label: "31-60 dias", qtd: 0, valor: 0 },
    "61-90 dias": { label: "61-90 dias", qtd: 0, valor: 0 },
    "90+ dias": { label: "Mais de 90 dias", qtd: 0, valor: 0 },
  };

  const faturas: InadimplenciaFatura[] = [];
  let total = 0;

  for (const r of rows) {
    if (!r.dataVencimento || !r.valorCobranca) continue;
    const diasAtraso = Math.floor(
      (hoje.getTime() - r.dataVencimento.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (diasAtraso < 1) continue;
    const valor = r.valorCobranca;
    total += valor;

    let bucket = "90+ dias";
    if (diasAtraso <= 30) bucket = "1-30 dias";
    else if (diasAtraso <= 60) bucket = "31-60 dias";
    else if (diasAtraso <= 90) bucket = "61-90 dias";
    faixas[bucket].qtd += 1;
    faixas[bucket].valor += valor;

    faturas.push({
      id: r.id,
      consumerUnitId: r.consumerUnitId,
      ucCodigo: r.consumerUnit?.codigoUc ?? null,
      consumidorNome: r.consumerUnit?.nome ?? null,
      ano: r.ano,
      mes: r.mes,
      valorCobranca: valor,
      dataVencimento: r.dataVencimento.toISOString(),
      diasAtraso,
    });
  }

  faturas.sort((a, b) => b.valorCobranca - a.valorCobranca);
  return {
    total: round2(total),
    qtdTotal: faturas.length,
    faixas: Object.values(faixas).map((f) => ({
      ...f,
      valor: round2(f.valor),
    })),
    faturas: faturas.slice(0, 20).map((f) => ({
      ...f,
      valorCobranca: round2(f.valorCobranca),
    })),
    pctSobreReceita: round2(pct(total, receitaMes)),
  };
}

async function getAtencoesExtras(ano: number, mes: number): Promise<string[]> {
  const alertas: string[] = [];
  const { start, end } = monthRangeUtc(ano, mes);

  // 1. InvestorDebit em aberto
  const debitos = await prisma.investorDebit.aggregate({
    where: { status: "ABERTO" },
    _sum: { valorRestante: true },
    _count: { _all: true },
  });
  if (debitos._count._all > 0 && (debitos._sum.valorRestante ?? 0) > 0) {
    alertas.push(
      `${debitos._count._all} débito(s) de investidor em aberto — total ${formatBRLPlain(
        debitos._sum.valorRestante ?? 0,
      )} a amortizar nas próximas remunerações.`,
    );
  }

  // 2. PlantBillings do mês sem comprovante (não pagos)
  const usinasSemPagto = await prisma.plantBilling.count({
    where: {
      ano,
      mes,
      comprovantePagamentoAt: null,
      encerradoEm: null,
    },
  });
  if (usinasSemPagto > 0) {
    alertas.push(
      `${usinasSemPagto} usina(s) ainda sem comprovante de pagamento neste mês.`,
    );
  }

  // 3. Settlements DRAFT no mês (ainda não publicados)
  const settlementsDraft = await prisma.investorSettlement.count({
    where: {
      anoFechamento: ano,
      mesFechamento: mes,
      status: "DRAFT",
    },
  });
  if (settlementsDraft > 0) {
    alertas.push(
      `${settlementsDraft} settlement(s) de investidor em DRAFT — revisar e publicar.`,
    );
  }

  // 4. Settlements publicados mas não pagos (do mês de referência)
  const settlementsNaoPagos = await prisma.investorSettlement.count({
    where: {
      anoFechamento: ano,
      mesFechamento: mes,
      status: "PUBLISHED",
      pagoEm: null,
    },
  });
  if (settlementsNaoPagos > 0) {
    alertas.push(
      `${settlementsNaoPagos} settlement(s) publicado(s) mas ainda não pago(s) — pagamento pendente para entrar no fechamento.`,
    );
  }

  // 5. Faturas Asaas vencidas no mês mas ainda não pagas
  const asaasVencidas = await prisma.consumerUnitBilling.count({
    where: {
      pagoEm: null,
      dataVencimento: { gte: start, lt: end },
      status: { notIn: ["CANCELADO", "PAGO"] },
    },
  });
  if (asaasVencidas > 0) {
    alertas.push(
      `${asaasVencidas} cobrança(s) Asaas com vencimento no mês ainda em aberto.`,
    );
  }

  return alertas;
}

async function getIndicadoresFisicos(ano: number, mes: number) {
  // kWh injetado = soma da injeção das faturas das usinas no mês de referência.
  // kWh compensado = soma do energiaCompensada das faturas das UCs no mês de
  // referência. São indicadores de COMPETÊNCIA (não caixa) — propósito é mostrar
  // o tamanho físico da operação no mês.
  const usinas = await prisma.consumerBill.findMany({
    where: {
      anoReferencia: ano,
      mesReferencia: mes,
      plantId: { not: null },
    },
    select: { energiaInjetada: true },
  }).catch(() => [] as Array<{ energiaInjetada: number | null }>);

  const ucs = await prisma.consumerBill.findMany({
    where: {
      anoReferencia: ano,
      mesReferencia: mes,
      consumerUnitId: { not: null },
    },
    select: { energiaCompensada: true },
  }).catch(() => [] as Array<{ energiaCompensada: number | null }>);

  return {
    kwhInjetado: usinas.reduce((a, r) => a + (r.energiaInjetada ?? 0), 0),
    kwhCompensado: ucs.reduce((a, r) => a + (r.energiaCompensada ?? 0), 0),
  };
}

// ============================================================
// Função principal
// ============================================================

export async function calcularFechamentoFinanceiro(
  ano: number,
  mes: number,
): Promise<DreResultado> {
  const hoje = new Date();

  const [
    receitaAsaas,
    settlements,
    custoUsinasItems,
    rubricas,
    taxRate,
    indicadores,
    atencoesExtras,
  ] = await Promise.all([
    getReceitaAsaas(ano, mes),
    getSettlementsPagos(ano, mes),
    getCustoUsinas(ano, mes),
    getRubricasDoMes(ano, mes),
    getTaxRateVigente(ano, mes),
    getIndicadoresFisicos(ano, mes),
    getAtencoesExtras(ano, mes),
  ]);

  const receitaGestao = settlements.reduce(
    (a, s) => a + (s.gestaoFixaAplicada ?? 0),
    0,
  );
  const receitaBruta = receitaAsaas + receitaGestao;

  const custoUsinas = custoUsinasItems.reduce((a, r) => a + r.valor, 0);
  // Pagamento bruto a investidor = totalLiquido + outrosAjustes (= valorAPagar + gestaoFixaAplicada)
  const custoInvestidorBruto = settlements.reduce(
    (a, s) => a + (s.totalLiquido ?? 0) + (s.outrosAjustes ?? 0),
    0,
  );

  const custoInvestidorItems: CustoItem[] = settlements.map((s) => ({
    label: `${s.investor?.user?.name ?? "Investidor"}`,
    valor: (s.totalLiquido ?? 0) + (s.outrosAjustes ?? 0),
  }));

  const custoDireto = custoUsinas + custoInvestidorBruto;
  const margemBruta = receitaBruta - custoDireto;

  const custosFixosTotal = rubricas.reduce((a, r) => a + r.valor, 0);

  const taxRatePercentual = taxRate?.percentual ?? null;
  const imposto = taxRatePercentual
    ? (receitaBruta * taxRatePercentual) / 100
    : 0;

  const lucroLiquido = margemBruta - custosFixosTotal - imposto;

  // Pontos de atenção
  const alertas: string[] = [];
  if (!taxRate) {
    alertas.push(
      "Nenhuma alíquota de imposto vigente para este mês — imposto não foi aplicado.",
    );
  }
  const rubricasNaoConfirmadas = rubricas.filter((r) => !r.confirmado);
  if (rubricasNaoConfirmadas.length > 0) {
    alertas.push(
      `${rubricasNaoConfirmadas.length} rubrica(s) recorrente(s) ainda usando valor padrão (não confirmada(s) no mês).`,
    );
  }
  if (lucroLiquido < 0) {
    alertas.push(
      `Resultado negativo no mês: prejuízo de ${formatBRLPlain(lucroLiquido)}.`,
    );
  }
  for (const a of atencoesExtras) alertas.push(a);

  const inadimplencia = await getInadimplencia(hoje, receitaBruta);
  if (inadimplencia.total > 0) {
    alertas.push(
      `Inadimplência atual: ${formatBRLPlain(inadimplencia.total)} em ${inadimplencia.qtdTotal} fatura(s) — ${inadimplencia.pctSobreReceita.toFixed(1)}% da receita bruta do mês.`,
    );
  }

  return {
    ano,
    mes,
    receitaAsaas: round2(receitaAsaas),
    receitaGestao: round2(receitaGestao),
    receitaBruta: round2(receitaBruta),
    receitaItems: [
      { label: "Boletos Asaas pagos no mês", valor: round2(receitaAsaas) },
      { label: "Receita de gestão de energia", valor: round2(receitaGestao) },
    ],
    custoUsinas: round2(custoUsinas),
    custoInvestidorBruto: round2(custoInvestidorBruto),
    custoDireto: round2(custoDireto),
    custoUsinasItems: custoUsinasItems.map((i) => ({
      ...i,
      valor: round2(i.valor),
    })),
    custoInvestidorItems: custoInvestidorItems.map((i) => ({
      ...i,
      valor: round2(i.valor),
    })),
    margemBruta: round2(margemBruta),
    margemBrutaPct: round2(pct(margemBruta, receitaBruta)),
    custosFixosTotal: round2(custosFixosTotal),
    rubricas: rubricas.map((r) => ({ ...r, valor: round2(r.valor) })),
    taxRatePercentual,
    taxRateVigenciaInicio: taxRate?.vigenciaInicio ?? null,
    imposto: round2(imposto),
    lucroLiquido: round2(lucroLiquido),
    margemLiquidaPct: round2(pct(lucroLiquido, receitaBruta)),
    kwhInjetado: round2(indicadores.kwhInjetado),
    kwhCompensado: round2(indicadores.kwhCompensado),
    alertas,
    inadimplencia,
  };
}

function formatBRLPlain(v: number): string {
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

// ============================================================
// Agregação por período (trimestral, semestral, anual)
// ============================================================

export type TipoPeriodo = "mensal" | "trimestral" | "semestral" | "anual";

export interface DreAgregado {
  tipo: TipoPeriodo;
  ano: number;
  mes: number; // mês de referência (último do período)
  periodoLabel: string; // ex: "Q2 2026", "1º semestre 2026", "Ano 2026"
  meses: DreResultado[];
  totais: {
    receitaAsaas: number;
    receitaGestao: number;
    receitaBruta: number;
    custoUsinas: number;
    custoInvestidorBruto: number;
    custoDireto: number;
    margemBruta: number;
    margemBrutaPct: number;
    custosFixosTotal: number;
    imposto: number;
    lucroLiquido: number;
    margemLiquidaPct: number;
    kwhInjetado: number;
    kwhCompensado: number;
  };
  inadimplencia: InadimplenciaResumo; // snapshot atual, único pro período
  alertas: string[];
}

const MES_NOMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function mesesDoPeriodo(
  tipo: TipoPeriodo,
  ano: number,
  mes: number,
): Array<{ ano: number; mes: number }> {
  if (tipo === "mensal") return [{ ano, mes }];
  if (tipo === "anual") {
    return Array.from({ length: 12 }, (_, i) => ({ ano, mes: i + 1 }));
  }
  if (tipo === "trimestral") {
    // Trimestre que CONTÉM o mês informado.
    const tri = Math.floor((mes - 1) / 3); // 0..3
    return [1, 2, 3].map((d) => ({ ano, mes: tri * 3 + d }));
  }
  // semestral
  const sem = mes <= 6 ? 0 : 1;
  return Array.from({ length: 6 }, (_, i) => ({ ano, mes: sem * 6 + i + 1 }));
}

function labelPeriodo(tipo: TipoPeriodo, ano: number, mes: number): string {
  if (tipo === "mensal") return `${MES_NOMES[mes - 1]}/${ano}`;
  if (tipo === "anual") return `Ano ${ano}`;
  if (tipo === "trimestral") {
    const tri = Math.floor((mes - 1) / 3) + 1;
    return `${tri}º trimestre ${ano}`;
  }
  return `${mes <= 6 ? "1º" : "2º"} semestre ${ano}`;
}

export async function calcularFechamentoAgregado(
  tipo: TipoPeriodo,
  ano: number,
  mes: number,
): Promise<DreAgregado> {
  const meses = mesesDoPeriodo(tipo, ano, mes);
  const resultados = await Promise.all(
    meses.map(({ ano: a, mes: m }) => calcularFechamentoFinanceiro(a, m)),
  );

  const t = resultados.reduce(
    (acc, r) => {
      acc.receitaAsaas += r.receitaAsaas;
      acc.receitaGestao += r.receitaGestao;
      acc.receitaBruta += r.receitaBruta;
      acc.custoUsinas += r.custoUsinas;
      acc.custoInvestidorBruto += r.custoInvestidorBruto;
      acc.custoDireto += r.custoDireto;
      acc.margemBruta += r.margemBruta;
      acc.custosFixosTotal += r.custosFixosTotal;
      acc.imposto += r.imposto;
      acc.lucroLiquido += r.lucroLiquido;
      acc.kwhInjetado += r.kwhInjetado;
      acc.kwhCompensado += r.kwhCompensado;
      return acc;
    },
    {
      receitaAsaas: 0,
      receitaGestao: 0,
      receitaBruta: 0,
      custoUsinas: 0,
      custoInvestidorBruto: 0,
      custoDireto: 0,
      margemBruta: 0,
      custosFixosTotal: 0,
      imposto: 0,
      lucroLiquido: 0,
      kwhInjetado: 0,
      kwhCompensado: 0,
    },
  );

  const totais = {
    receitaAsaas: round2(t.receitaAsaas),
    receitaGestao: round2(t.receitaGestao),
    receitaBruta: round2(t.receitaBruta),
    custoUsinas: round2(t.custoUsinas),
    custoInvestidorBruto: round2(t.custoInvestidorBruto),
    custoDireto: round2(t.custoDireto),
    margemBruta: round2(t.margemBruta),
    margemBrutaPct: round2(pct(t.margemBruta, t.receitaBruta)),
    custosFixosTotal: round2(t.custosFixosTotal),
    imposto: round2(t.imposto),
    lucroLiquido: round2(t.lucroLiquido),
    margemLiquidaPct: round2(pct(t.lucroLiquido, t.receitaBruta)),
    kwhInjetado: round2(t.kwhInjetado),
    kwhCompensado: round2(t.kwhCompensado),
  };

  // Inadimplência é snapshot atual — pega da última computação, recalculando
  // pct sobre receita do período.
  const ultimo = resultados[resultados.length - 1];
  const inadimplencia: InadimplenciaResumo = {
    ...ultimo.inadimplencia,
    pctSobreReceita: round2(pct(ultimo.inadimplencia.total, totais.receitaBruta)),
  };

  // Alertas: deduplica e prioriza os "novos" (não-mensais).
  const alertasSet = new Set<string>();
  for (const r of resultados) for (const a of r.alertas) alertasSet.add(a);
  if (totais.lucroLiquido < 0 && tipo !== "mensal") {
    alertasSet.add(
      `Resultado negativo no período: prejuízo de ${formatBRLPlain(totais.lucroLiquido)}.`,
    );
  }

  return {
    tipo,
    ano,
    mes,
    periodoLabel: labelPeriodo(tipo, ano, mes),
    meses: resultados,
    totais,
    inadimplencia,
    alertas: Array.from(alertasSet),
  };
}

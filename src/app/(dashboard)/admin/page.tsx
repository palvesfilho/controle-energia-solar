import { prisma } from "@/lib/prisma";
import { DashboardKpis, type KpiGroup } from "@/components/dashboard/dashboard-kpis";
import { formatBRL, formatKWh, formatMonthYear, formatNumber } from "@/lib/formatters";

export default async function AdminPage() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // Mês anterior para dados de geração (dados do mês atual podem não estar completos)
  const lastMonth = currentMonth === 1 ? 12 : currentMonth - 1;
  const lastMonthYear = currentMonth === 1 ? currentYear - 1 : currentYear;

  const [
    investorCount,
    plantCount,
    consumerCount,
    plantMonthlyData,
    consumerBillsLastMonth,
    faturamentoMensal,
    faturamentoAnual,
    billingsAtrasados,
    billingsTotal,
    plants,
  ] = await Promise.all([
    // 1. Número de investidores
    prisma.investor.count(),

    // 2. Número de usinas sob gestão
    prisma.plant.count({ where: { active: true } }),

    // 3. Quantidade de consumidores (unidades consumidoras ativas)
    prisma.consumerUnit.count({ where: { active: true } }),

    // 4. kWh gerados no último mês
    prisma.plantMonthly.findMany({
      where: { ano: lastMonthYear, mes: lastMonth },
    }),

    // 5. kWh energia compensada no último mês
    prisma.consumerBill.findMany({
      where: { anoReferencia: lastMonthYear, mesReferencia: lastMonth },
    }),

    // 6. Faturamento mensal (último mês - valor cobrado das unidades consumidoras)
    prisma.consumerUnitBilling.findMany({
      where: {
        ano: lastMonthYear,
        mes: lastMonth,
        status: { not: "CANCELADO" },
      },
    }),

    // 7. Faturamento anual
    prisma.consumerUnitBilling.findMany({
      where: {
        ano: currentYear,
        status: { not: "CANCELADO" },
      },
    }),

    // 8. Inadimplência - billings atrasados
    prisma.consumerUnitBilling.count({
      where: { status: "ATRASADO" },
    }),

    // 8b. Total de billings não cancelados para calcular %
    prisma.consumerUnitBilling.count({
      where: {
        status: { notIn: ["CANCELADO", "PENDENTE"] },
      },
    }),

    // 9. Taxa de ocupação - usinas com seus consumidores
    prisma.plant.findMany({
      where: { active: true },
      include: {
        consumers: true,
        consumerUnits: { where: { active: true } },
      },
    }),
  ]);

  // Cálculo: kWh gerados no último mês
  const kwhGeradosUltimoMes = plantMonthlyData.reduce(
    (sum, pm) => sum + (pm.geracaoTotal ?? 0),
    0
  );

  // Cálculo: kWh energia compensada no último mês
  const kwhCompensadoUltimoMes = consumerBillsLastMonth.reduce(
    (sum, cb) => sum + (cb.energiaCompensada ?? 0),
    0
  );

  // Cálculo: Faturamento mensal
  const totalFaturamentoMensal = faturamentoMensal.reduce(
    (sum, b) => sum + (b.valorCobranca ?? 0),
    0
  );

  // Cálculo: Faturamento anual
  const totalFaturamentoAnual = faturamentoAnual.reduce(
    (sum, b) => sum + (b.valorCobranca ?? 0),
    0
  );

  // Cálculo: Taxa de inadimplência
  const taxaInadimplencia =
    billingsTotal > 0 ? (billingsAtrasados / billingsTotal) * 100 : 0;

  // Cálculo: Taxa de ocupação das usinas
  // Baseado na soma das cotas (%) dos consumidores vinculados a cada usina
  const taxaOcupacao = (() => {
    if (plants.length === 0) return 0;
    const ocupacoes = plants.map((plant) => {
      const totalCota = plant.consumers.reduce(
        (sum, cp) => sum + (cp.cotaPercent ?? 0),
        0
      );
      return Math.min(totalCota, 100); // Cap em 100%
    });
    return ocupacoes.reduce((sum, o) => sum + o, 0) / plants.length;
  })();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Gestora de Energia</h1>
        <p className="text-muted-foreground">
          Visão geral do sistema de gestão de energia solar
        </p>
      </div>

      {/* Dashboard KPIs agrupados por categoria */}
      <DashboardKpis
        groups={[
          {
            title: "Energéticos",
            cards: [
              { title: `Geração ${formatMonthYear(lastMonth, lastMonthYear)}`, value: formatKWh(kwhGeradosUltimoMes), iconName: "Zap", color: "green" },
              { title: `Energia Compensada ${formatMonthYear(lastMonth, lastMonthYear)}`, value: formatKWh(kwhCompensadoUltimoMes), iconName: "Zap", color: "cyan" },
            ],
          },
          {
            title: "Financeiros",
            cards: [
              { title: `Faturamento ${formatMonthYear(lastMonth, lastMonthYear)}`, value: formatBRL(totalFaturamentoMensal), iconName: "DollarSign", color: "emerald" },
              { title: `Faturamento ${currentYear}`, value: formatBRL(totalFaturamentoAnual), iconName: "CalendarRange", color: "teal" },
              { title: "Inadimplência", value: `${formatNumber(taxaInadimplencia)}%`, subtitle: `${billingsAtrasados} cobranças atrasadas`, iconName: "TrendingDown", color: taxaInadimplencia > 10 ? "red" : taxaInadimplencia > 5 ? "amber" : "green" },
            ],
          },
          {
            title: "Operacionais",
            cards: [
              { title: "Investidores", value: String(investorCount), iconName: "Users", color: "blue" },
              { title: "Usinas sob Gestão", value: String(plantCount), iconName: "Building2", color: "purple" },
              { title: "Unidades Consumidoras", value: String(consumerCount), iconName: "UserCheck", color: "indigo" },
              { title: "Taxa de Ocupação das Usinas", value: `${formatNumber(taxaOcupacao)}%`, subtitle: `Média entre ${plants.length} usinas`, iconName: "Gauge", color: taxaOcupacao >= 80 ? "green" : taxaOcupacao >= 50 ? "amber" : "red" },
            ],
          },
        ] satisfies KpiGroup[]}
      />
    </div>
  );
}

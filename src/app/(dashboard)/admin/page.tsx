import { prisma } from "@/lib/prisma";
import { DashboardKpis, type KpiGroup } from "@/components/dashboard/dashboard-kpis";
import { formatBRL, formatKWh, formatMonthYear, formatNumber } from "@/lib/formatters";
import { geracaoDoMesPorFrota } from "@/lib/geracao-frota";
import {
  consumoDoRateioPorPlant,
  taxaOcupacaoMediaFrota,
} from "@/lib/taxa-ocupacao";
import { SEM_UC_BRASIL_SOLAR } from "@/lib/uc-origem";

/**
 * Dashboard da Gestora de Energia.
 *
 * A rota é DINÂMICA (o layout chama Clerk `currentUser()`), então cada F5
 * recalcula tudo do banco — não existe cache aqui. Quando um card parece
 * "parado", o problema é a FONTE dele, e é por isso que todo card abaixo carrega
 * um subtítulo dizendo sobre quantos registros a conta foi feita: KPI sem
 * denominador visível é o jeito mais fácil de um buraco de dados passar por
 * número de negócio.
 */

/** Um mês é considerado ainda incompleto quando tem menos de 60% do volume do
 *  mês anterior. Serve só pra AVISAR — o valor exibido continua sendo o real. */
const LIMIAR_MES_INCOMPLETO = 0.6;

function avisoMesIncompleto(qtdMes: number, qtdMesAnterior: number): boolean {
  if (qtdMesAnterior <= 0) return false;
  return qtdMes < qtdMesAnterior * LIMIAR_MES_INCOMPLETO;
}

export default async function AdminPage() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // Mês anterior para dados de geração (dados do mês atual podem não estar completos)
  const lastMonth = currentMonth === 1 ? 12 : currentMonth - 1;
  const lastMonthYear = currentMonth === 1 ? currentYear - 1 : currentYear;

  // Penúltimo mês: base de comparação pra saber se o mês de referência ainda
  // está entrando. Sem isso, os primeiros dias do mês mostram meia competência
  // com cara de queda de faturamento.
  const prevMonth = lastMonth === 1 ? 12 : lastMonth - 1;
  const prevMonthYear = lastMonth === 1 ? lastMonthYear - 1 : lastMonthYear;

  // Usinas primeiro: o id delas é insumo da geração e da taxa de ocupação.
  const plants = await prisma.plant.findMany({
    where: { active: true },
    select: { id: true, geracaoMediaMensal: true },
  });
  const plantIds = plants.map((p) => p.id);

  const [
    investorCount,
    consumerCount,
    geracao,
    consumerBillsLastMonth,
    consumerBillsPrevMonthCount,
    faturamentoMensal,
    faturamentoPrevMonthCount,
    faturamentoAnual,
    billingsEmAtraso,
    billingsCobrados,
    billingsNaoEmitidos,
    rateiosVigentes,
  ] = await Promise.all([
    // 1. Número de investidores
    prisma.investor.count(),

    // 2. Quantidade de consumidores (unidades consumidoras ativas)
    // KPI da Gestora de Energia (Associação) — UCs do módulo Brasil Solar
    // não contam aqui.
    prisma.consumerUnit.count({ where: { active: true, ...SEM_UC_BRASIL_SOLAR } }),

    // 3. kWh gerados no último mês. Medição das plataformas manda; lançamento
    //    manual entra só onde não há medição. Ver lib/geracao-frota.ts — este
    //    card lia só PlantMonthly (tabela alimentada 100% à mão, VAZIA em
    //    produção) e por isso marcava 0 kWh com a frota gerando.
    geracaoDoMesPorFrota(plantIds, lastMonthYear, lastMonth),

    // 4. kWh energia compensada no último mês
    prisma.consumerBill.findMany({
      where: { anoReferencia: lastMonthYear, mesReferencia: lastMonth },
      select: { energiaCompensada: true },
    }),
    prisma.consumerBill.count({
      where: { anoReferencia: prevMonthYear, mesReferencia: prevMonth },
    }),

    // 5. Faturamento mensal (último mês - valor cobrado das unidades consumidoras)
    prisma.consumerUnitBilling.findMany({
      where: {
        ano: lastMonthYear,
        mes: lastMonth,
        status: { not: "CANCELADO" },
      },
      select: { valorCobranca: true },
    }),
    prisma.consumerUnitBilling.count({
      where: { ano: prevMonthYear, mes: prevMonth, status: { not: "CANCELADO" } },
    }),

    // 6. Faturamento anual
    prisma.consumerUnitBilling.findMany({
      where: {
        ano: currentYear,
        status: { not: "CANCELADO" },
      },
      select: { valorCobranca: true },
    }),

    // 7. Inadimplência.
    //
    // 🔑 O numerador NÃO pode ser só `status: "ATRASADO"`: esse status só é
    // gravado pelo webhook PAYMENT_OVERDUE do Asaas, e enquanto a emissão pelo
    // Asaas não for o caminho de todas as cobranças o KPI fica preso em 0% —
    // 0% por incapacidade estrutural, indistinguível de 0% por adimplência.
    // Aqui atraso é o FATO: cobrança já comunicada, não paga, vencimento
    // passado. O status do Asaas continua valendo quando existe (cobrança
    // marcada ATRASADO sem data de vencimento cadastrada também conta).
    prisma.consumerUnitBilling.count({
      where: {
        // PAGO/PARCIALMENTE_PAGO fora: 22 cobranças estão marcadas pagas sem
        // `pagoEm` preenchido (baixa manual antiga) e virariam atraso falso.
        status: {
          notIn: ["CANCELADO", "PENDENTE", "PAGO", "PARCIALMENTE_PAGO"],
        },
        pagoEm: null,
        OR: [{ status: "ATRASADO" }, { dataVencimento: { lt: now } }],
      },
    }),
    // Denominador: só o que já foi efetivamente cobrado do cliente. PENDENTE
    // é cobrança que nunca saiu daqui — falha de processo interno, não
    // inadimplência de cliente; entra no subtítulo, não na taxa.
    prisma.consumerUnitBilling.count({
      where: { status: { notIn: ["CANCELADO", "PENDENTE"] } },
    }),
    prisma.consumerUnitBilling.count({ where: { status: "PENDENTE" } }),

    // 8. Taxa de ocupação — vínculo UC↔usina pelo RATEIO VIGENTE.
    //    Este card lia `Plant.consumers` (ConsumerPlant), tabela legada com 2
    //    linhas no banco inteiro, e por isso marcava ~3%.
    prisma.rateioVersion.findMany({
      where: { plantId: { in: plantIds }, status: "VIGENTE" },
      select: {
        plantId: true,
        items: { select: { consumerUnit: { select: { consumoMedio: true } } } },
      },
    }),
  ]);

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

  // Cálculo: Taxa de inadimplência. `null` quando nada foi cobrado ainda —
  // "—" é honesto, "0%" seria uma afirmação que os dados não sustentam.
  const taxaInadimplencia =
    billingsCobrados > 0 ? (billingsEmAtraso / billingsCobrados) * 100 : null;

  // Cálculo: Taxa de ocupação das usinas (fração 0..1). Mesma definição da
  // coluna "Ocupação" da Saúde por usina — ver lib/taxa-ocupacao.ts.
  const ocupacao = taxaOcupacaoMediaFrota(
    plants,
    consumoDoRateioPorPlant(rateiosVigentes)
  );

  // ── Subtítulos: cada card diz sobre quantos registros a conta foi feita ──

  const subtituloGeracao = (() => {
    const partes = [`${geracao.usinasMedidas} de ${geracao.usinasTotal} usinas medidas`];
    if (geracao.usinasMudas > 0) partes.push(`${geracao.usinasMudas} sem leitura`);
    if (geracao.usinasLancadas > 0) partes.push(`${geracao.usinasLancadas} lançadas à mão`);
    if (geracao.usinasSemDado > 0) partes.push(`${geracao.usinasSemDado} sem monitoramento`);
    if (geracao.temLeituraManual) partes.push("inclui estimativa");
    return partes.join(" · ");
  })();

  const compensadaIncompleta = avisoMesIncompleto(
    consumerBillsLastMonth.length,
    consumerBillsPrevMonthCount
  );
  const subtituloCompensada = `${consumerBillsLastMonth.length} fatura(s) de energia lançada(s)${
    compensadaIncompleta
      ? ` · mês ainda incompleto (${consumerBillsPrevMonthCount} em ${formatMonthYear(prevMonth, prevMonthYear)})`
      : ""
  }`;

  const faturamentoIncompleto = avisoMesIncompleto(
    faturamentoMensal.length,
    faturamentoPrevMonthCount
  );
  const subtituloFaturamento = `${faturamentoMensal.length} cobrança(s)${
    faturamentoIncompleto
      ? ` · mês ainda incompleto (${faturamentoPrevMonthCount} em ${formatMonthYear(prevMonth, prevMonthYear)})`
      : ""
  }`;

  const subtituloInadimplencia = (() => {
    const base =
      billingsCobrados > 0
        ? `${billingsEmAtraso} em atraso de ${billingsCobrados} cobradas`
        : "nenhuma cobrança emitida ainda";
    return billingsNaoEmitidos > 0
      ? `${base} · ${billingsNaoEmitidos} nunca emitidas`
      : base;
  })();

  const subtituloOcupacao = (() => {
    const partes = [`Média de ${ocupacao.usinasConsideradas} usinas`];
    if (ocupacao.usinasSemRateio > 0)
      partes.push(`${ocupacao.usinasSemRateio} sem rateio vigente`);
    if (ocupacao.usinasSemGeracao > 0)
      partes.push(`${ocupacao.usinasSemGeracao} sem geração cadastrada`);
    return partes.join(" · ");
  })();

  // Cor da ocupação: mesma régua da Saúde por usina. Ociosa e sobrecarregada
  // (rateio pedindo mais do que a usina gera) são problemas diferentes, os dois
  // em vermelho. ⛔ Não truncar em 100% — a sobrecarga precisa aparecer.
  const corOcupacao =
    ocupacao.media == null
      ? "amber"
      : ocupacao.media > 1.05
        ? "red"
        : ocupacao.media >= 0.85
          ? "green"
          : ocupacao.media >= 0.6
            ? "amber"
            : "red";

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
              {
                title: `Geração ${formatMonthYear(lastMonth, lastMonthYear)}`,
                value: formatKWh(geracao.kwh),
                subtitle: subtituloGeracao,
                iconName: "Zap",
                color:
                  geracao.kwh <= 0
                    ? "red"
                    : geracao.usinasSemDado + geracao.usinasMudas > 0
                      ? "amber"
                      : "green",
              },
              {
                title: `Energia Compensada ${formatMonthYear(lastMonth, lastMonthYear)}`,
                value: formatKWh(kwhCompensadoUltimoMes),
                subtitle: subtituloCompensada,
                iconName: "Zap",
                color: compensadaIncompleta ? "amber" : "cyan",
              },
            ],
          },
          {
            title: "Financeiros",
            cards: [
              {
                title: `Faturamento ${formatMonthYear(lastMonth, lastMonthYear)}`,
                value: formatBRL(totalFaturamentoMensal),
                subtitle: subtituloFaturamento,
                iconName: "DollarSign",
                color: faturamentoIncompleto ? "amber" : "emerald",
              },
              {
                title: `Faturamento ${currentYear}`,
                value: formatBRL(totalFaturamentoAnual),
                subtitle: `${faturamentoAnual.length} cobrança(s) em ${currentYear}`,
                iconName: "CalendarRange",
                color: "teal",
              },
              {
                title: "Inadimplência",
                value:
                  taxaInadimplencia == null
                    ? "—"
                    : `${formatNumber(taxaInadimplencia)}%`,
                subtitle: subtituloInadimplencia,
                iconName: "TrendingDown",
                color:
                  taxaInadimplencia == null
                    ? "amber"
                    : taxaInadimplencia > 10
                      ? "red"
                      : taxaInadimplencia > 5
                        ? "amber"
                        : "green",
              },
            ],
          },
          {
            title: "Operacionais",
            cards: [
              { title: "Investidores", value: String(investorCount), iconName: "Users", color: "blue" },
              { title: "Usinas sob Gestão", value: String(plants.length), iconName: "Building2", color: "purple" },
              { title: "Unidades Consumidoras", value: String(consumerCount), iconName: "UserCheck", color: "indigo" },
              {
                title: "Taxa de Ocupação das Usinas",
                value:
                  ocupacao.media == null
                    ? "—"
                    : `${formatNumber(ocupacao.media * 100)}%`,
                subtitle: subtituloOcupacao,
                iconName: "Gauge",
                color: corOcupacao,
              },
            ],
          },
        ] satisfies KpiGroup[]}
      />
    </div>
  );
}

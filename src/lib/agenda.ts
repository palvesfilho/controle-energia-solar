import { prisma } from "./prisma";
import { formatCodigoUc } from "./uc-codigo";
import {
  addDaysOnly,
  dateOnlyKey,
  dateOnlyUTC,
  dayInBrasil,
  endOfDayInstant,
  endOfWeekSundayOnly,
  formatDateOnlyBR,
  previousBusinessDay,
  startOfDayInstant,
  startOfWeekMondayOnly,
  toDateOnly,
  todayInBrasil,
} from "./date-only";

/**
 * Toda data desta agenda é um **dia-calendário** ancorado em 12:00 UTC
 * (ver date-only.ts). Antes o módulo usava `setHours`/`getDay` no fuso do
 * processo: em produção (Railway, UTC) isso deslocava a grade inteira em um
 * dia no navegador brasileiro, e uma tarefa de segunda aparecia no domingo
 * — última coluna da semana, dando a impressão de estar pós-vencimento.
 */

/**
 * Tarefas PENDING/OVERDUE com `scheduledFor` anterior a esta data não
 * aparecem na agenda — evita poluir o histórico com pendências legadas.
 * DONE passa pelo cutoff (útil pra auditar o backup do Lumi nas semanas
 * antigas). Para mostrar tudo, defina como `null`.
 */
export const AGENDA_MIN_DATE: Date | null = dateOnlyUTC(2026, 4, 1);

export type AgendaTaskType =
  | "PAGAR_FATURA"
  | "EMITIR_RELATORIO_MENSAL"
  | "COBRAR_CLIENTE_DESCONTO"
  | "PAGAR_INVESTIDOR"
  | "INFORMAR_LEITURA_RGE"
  | "CONFERIR_PAGAMENTO_RGE";

/**
 * Dias após o pagamento interno (pagoEm) sem confirmação da concessionária
 * antes da tarefa CONFERIR_PAGAMENTO_RGE aparecer. RGE costuma atualizar em
 * 5-7 dias úteis; 10 dias é folga suficiente pra evitar falso-positivo.
 */
const DIAS_ATE_CONFERIR_RGE = 10;

export type AgendaTaskStatus = "PENDING" | "DONE" | "OVERDUE";

export interface AgendaTask {
  id: string;
  type: AgendaTaskType;
  title: string;
  subtitle: string | null;
  scheduledFor: Date;
  dueDate: Date | null;
  status: AgendaTaskStatus;
  sourceEntityType: string;
  sourceEntityId: string;
  href: string | null;
  // Filtros: mês/ano de referência da tarefa (ciclo de fatura, mês do payable etc.)
  mesReferencia: number | null; // 1-12
  anoReferencia: number | null;
  // Filtros: UC envolvida (nulo para tasks de usina-pura como PAGAR_INVESTIDOR e
  // EMITIR_RELATORIO_MENSAL). consumerUnitLabel = "codigoUC — nome" pra dropdown.
  consumerUnitId: string | null;
  consumerUnitLabel: string | null;
  // Valor monetário associado à tarefa, quando aplicável (R$). Hoje só
  // preenchido em PAGAR_FATURA — usado pra somar "a pagar" no header do dia.
  valor: number | null;
  // PAGAR_FATURA de usina onde "INVESTIDORES" pagam direto: a fatura aparece
  // pra controle mas não é responsabilidade da gestora. Não soma no caixa
  // do dia; renderizada com badge "Investidor paga".
  pagaInvestidor: boolean;
}

/**
 * Folga aplicada às janelas de busca no banco. O agendamento pode andar até
 * 2 dias para trás pela antecipação de fim de semana (domingo → sexta), e os
 * registros legados têm hora 00:00Z/03:00Z. Buscar com folga e depois filtrar
 * pelo dia-calendário em memória evita perder tarefa na borda da semana.
 */
const SLACK_DIAS = 4;

function addDays(d: Date, days: number): Date {
  return addDaysOnly(d, days);
}

function isWithin(date: Date, start: Date, end: Date): boolean {
  return date >= start && date <= end;
}

function ymd(d: Date): string {
  return dateOnlyKey(d);
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/**
 * Devolve todas as tarefas auto-derivadas pra janela [start, end].
 * Tarefas com `scheduledFor` na janela aparecem. Status:
 *  - DONE → o dado-origem já foi resolvido
 *  - OVERDUE → scheduledFor passou e a `dueDate` (deadline real) também
 *  - PENDING → caso contrário
 */
export async function getTasksForWeek(start: Date, end: Date): Promise<AgendaTask[]> {
  const windowStart = toDateOnly(start)!;
  const windowEnd = toDateOnly(end)!;
  const today = todayInBrasil();

  const tasks: AgendaTask[] = [];

  // ─── 1) PAGAR_FATURA ──────────────────────────────────────────────────
  // 2 dias antes do vencimento, antecipando para sexta quando cair no fim de
  // semana. Source: ConsumerBill com vencimento perto da janela.
  // DONE se pagoEm preenchido.
  // Filtra ConsumerBill que pertence a UC de cliente Brasil Solar — só faturas
  // da usina (plantId != null) ou de UC do fluxo investidor (origem=PADRAO)
  // devem virar tarefa. UCs com origem BRASIL_SOLAR_TITULAR/BENEFICIARIA
  // sincronizam fatura pra fins de monitoramento mas não entram na agenda.
  const billsForPayment = await prisma.consumerBill.findMany({
    where: {
      vencimento: {
        gte: startOfDayInstant(addDays(windowStart, 2 - SLACK_DIAS)),
        lte: endOfDayInstant(addDays(windowEnd, 2 + SLACK_DIAS)),
      },
      OR: [
        { plantId: { not: null } },
        { consumerUnit: { origem: "PADRAO" } },
      ],
    },
    select: {
      id: true,
      vencimento: true,
      pagoEm: true,
      valorTotal: true,
      mesReferencia: true,
      anoReferencia: true,
      consumerUnitId: true,
      consumerUnit: { select: { nome: true, codigoUc: true } },
      plant: { select: { name: true, unidadeConsumidora: true, pagadorFaturaEnergia: true } },
    },
  });

  for (const b of billsForPayment) {
    const vencimento = toDateOnly(b.vencimento);
    if (!vencimento) continue;
    const scheduled = previousBusinessDay(addDays(vencimento, -2));
    if (!isWithin(scheduled, windowStart, windowEnd)) continue;
    const isDone = !!b.pagoEm;
    const isOverdue = !isDone && vencimento < today;
    const nomeRef =
      b.consumerUnit?.nome ??
      formatCodigoUc(b.consumerUnit?.codigoUc) ??
      b.plant?.name ??
      formatCodigoUc(b.plant?.unidadeConsumidora) ??
      "";
    const labelUc = b.consumerUnit
      ? `${formatCodigoUc(b.consumerUnit.codigoUc)} — ${b.consumerUnit.nome}`
      : b.plant
        ? `${formatCodigoUc(b.plant.unidadeConsumidora) ?? "—"} — ${b.plant.name} (usina)`
        : null;
    const pagaInvestidor = b.plant?.pagadorFaturaEnergia === "INVESTIDORES";
    tasks.push({
      id: `PAGAR_FATURA-${b.id}`,
      type: "PAGAR_FATURA",
      title: `Pagar fatura ${nomeRef}`.trim(),
      subtitle: b.valorTotal
        ? `R$ ${b.valorTotal.toFixed(2).replace(".", ",")} · vence ${formatDateOnlyBR(vencimento)}`
        : `Vence ${formatDateOnlyBR(vencimento)}`,
      scheduledFor: scheduled,
      dueDate: vencimento,
      status: isDone ? "DONE" : isOverdue ? "OVERDUE" : "PENDING",
      sourceEntityType: "ConsumerBill",
      sourceEntityId: b.id,
      href: "/admin/faturas-energia",
      mesReferencia: b.mesReferencia,
      anoReferencia: b.anoReferencia,
      consumerUnitId: b.consumerUnitId,
      consumerUnitLabel: labelUc,
      valor: b.valorTotal ?? null,
      pagaInvestidor,
    });
  }

  // ─── 2) COBRAR_CLIENTE_DESCONTO ────────────────────────────────────────
  // 3 dias após `syncedAt` (data em que a fatura entrou no sistema).
  // Source: ConsumerBill onde a UC tem desconto (consumerUnit.consumerId não nulo
  // e UC linkada a um Plant — ou seja, é cliente compensado, não a própria usina).
  // DONE se já existe ConsumerUnitBilling daquele mês com asaasChargeId.
  const billsForCharge = await prisma.consumerBill.findMany({
    where: {
      syncedAt: {
        gte: startOfDayInstant(addDays(windowStart, -3 - SLACK_DIAS)),
        lte: endOfDayInstant(addDays(windowEnd, -3 + SLACK_DIAS)),
      },
      consumerUnitId: { not: null },
      consumerUnit: { origem: "PADRAO" },
    },
    select: {
      id: true,
      syncedAt: true,
      mesReferencia: true,
      anoReferencia: true,
      consumerUnitId: true,
      consumerUnit: {
        select: {
          nome: true,
          codigoUc: true,
          consumerId: true,
          plantId: true,
          billings: {
            select: { id: true, asaasChargeId: true, ano: true, mes: true, valorCobranca: true },
          },
        },
      },
    },
  });

  for (const b of billsForCharge) {
    if (!b.syncedAt) continue;
    // Só UC de cliente final com rateio (tem consumer + plant)
    if (!b.consumerUnit?.consumerId || !b.consumerUnit?.plantId) continue;
    // syncedAt é instante real (não data-calendário): o dia vale no fuso de
    // quem opera, então converte para o dia em Brasília antes de somar.
    const scheduled = previousBusinessDay(addDays(dayInBrasil(b.syncedAt), 3));
    if (!isWithin(scheduled, windowStart, windowEnd)) continue;
    const billing = b.consumerUnit.billings.find(
      (x) => x.ano === b.anoReferencia && x.mes === b.mesReferencia
    );
    const isDone = !!billing?.asaasChargeId;
    const isOverdue = !isDone && scheduled < today;
    tasks.push({
      id: `COBRAR_CLIENTE-${b.id}`,
      type: "COBRAR_CLIENTE_DESCONTO",
      title: `Cobrar ${b.consumerUnit.nome ?? formatCodigoUc(b.consumerUnit.codigoUc)}`,
      subtitle: `Ref. ${String(b.mesReferencia).padStart(2, "0")}/${b.anoReferencia}`,
      scheduledFor: scheduled,
      dueDate: null,
      status: isDone ? "DONE" : isOverdue ? "OVERDUE" : "PENDING",
      sourceEntityType: "ConsumerBill",
      sourceEntityId: b.id,
      href: "/admin/faturas-energia/gestao-financeira",
      mesReferencia: b.mesReferencia,
      anoReferencia: b.anoReferencia,
      consumerUnitId: b.consumerUnitId,
      consumerUnitLabel: `${formatCodigoUc(b.consumerUnit.codigoUc)} — ${b.consumerUnit.nome}`,
      valor: billing?.valorCobranca ?? null,
      pagaInvestidor: false,
    });
  }

  // ─── 3) PAGAR_INVESTIDOR ──────────────────────────────────────────────
  // Dia X do mês configurado em Plant.diaPagamentoInvestidor. 1 task por usina/mês.
  // DONE se TODOS os InvestorPayables daquele mês daquela usina estão com status PAGO.
  const plants = await prisma.plant.findMany({
    where: { active: true },
    select: {
      id: true,
      name: true,
      diaPagamentoInvestidor: true,
    },
  });

  // Pra cada usina, calcula a próxima data de pagamento que cai na janela
  // (pode ser este mês ou o anterior se windowStart é começo do mês)
  for (const p of plants) {
    // Testa o mês corrente da janela e o mês seguinte
    const candidates = [
      monthDay(windowStart.getUTCFullYear(), windowStart.getUTCMonth(), p.diaPagamentoInvestidor),
      monthDay(windowStart.getUTCFullYear(), windowStart.getUTCMonth() + 1, p.diaPagamentoInvestidor),
      monthDay(windowStart.getUTCFullYear(), windowStart.getUTCMonth() - 1, p.diaPagamentoInvestidor),
    ];
    for (const pagamento of candidates) {
      // O dia configurado é o prazo (dueDate); a tarefa em si antecipa para
      // sexta quando esse dia cai no fim de semana.
      const scheduled = previousBusinessDay(pagamento);
      if (!isWithin(scheduled, windowStart, windowEnd)) continue;
      // Mês de referência é o mês ANTERIOR ao do pagamento (paga em outubro o
      // relatório de setembro). Deriva do dia configurado, não do antecipado —
      // senão um pagamento no dia 1 mudaria de referência.
      const refMonth = pagamento.getUTCMonth() === 0 ? 12 : pagamento.getUTCMonth();
      const refYear =
        pagamento.getUTCMonth() === 0 ? pagamento.getUTCFullYear() - 1 : pagamento.getUTCFullYear();
      const payables = await prisma.investorPayable.findMany({
        where: {
          plantId: p.id,
          anoReferencia: refYear,
          mesReferencia: refMonth,
        },
        select: { id: true, status: true },
      });
      const isDone = payables.length > 0 && payables.every((pay) => pay.status === "PAGO");
      const isOverdue = !isDone && pagamento < today;
      tasks.push({
        id: `PAGAR_INVESTIDOR-${p.id}-${refYear}-${refMonth}`,
        type: "PAGAR_INVESTIDOR",
        title: `Pagar investidor — ${p.name}`,
        subtitle: `Ref. ${String(refMonth).padStart(2, "0")}/${refYear} · ${payables.length} payable(s)`,
        scheduledFor: scheduled,
        dueDate: pagamento,
        status: isDone ? "DONE" : isOverdue ? "OVERDUE" : "PENDING",
        sourceEntityType: "Plant",
        sourceEntityId: p.id,
        href: "/admin/faturamento/fechamentos-investidor",
        mesReferencia: refMonth,
        anoReferencia: refYear,
        consumerUnitId: null,
        consumerUnitLabel: null,
        valor: null,
        pagaInvestidor: false,
      });
    }

    // ─── 4) EMITIR_RELATORIO_MENSAL ────────────────────────────────────────
    // 3 dias antes do PAGAR_INVESTIDOR daquela usina. 1 task por usina/mês.
    // DONE se MonthlyReport daquele mês/usina tem publishedAt.
    for (const scheduledPagamento of candidates) {
      const scheduled = previousBusinessDay(addDays(scheduledPagamento, -3));
      if (!isWithin(scheduled, windowStart, windowEnd)) continue;
      const refMonth =
        scheduledPagamento.getUTCMonth() === 0 ? 12 : scheduledPagamento.getUTCMonth();
      const refYear =
        scheduledPagamento.getUTCMonth() === 0
          ? scheduledPagamento.getUTCFullYear() - 1
          : scheduledPagamento.getUTCFullYear();
      const reports = await prisma.monthlyReport.findMany({
        where: { plantId: p.id, ano: refYear, mes: refMonth },
        select: { id: true, publishedAt: true },
      });
      const isDone = reports.length > 0 && reports.every((r) => !!r.publishedAt);
      const isOverdue = !isDone && scheduledPagamento < today;
      tasks.push({
        id: `EMITIR_RELATORIO-${p.id}-${refYear}-${refMonth}`,
        type: "EMITIR_RELATORIO_MENSAL",
        title: `Emitir relatório — ${p.name}`,
        subtitle: `Ref. ${String(refMonth).padStart(2, "0")}/${refYear} · prazo p/ pagamento dia ${p.diaPagamentoInvestidor}`,
        scheduledFor: scheduled,
        dueDate: scheduledPagamento,
        status: isDone ? "DONE" : isOverdue ? "OVERDUE" : "PENDING",
        sourceEntityType: "Plant",
        sourceEntityId: p.id,
        href: `/admin/brasil-solar/relatorios`,
        mesReferencia: refMonth,
        anoReferencia: refYear,
        consumerUnitId: null,
        consumerUnitLabel: null,
        valor: null,
        pagaInvestidor: false,
      });
    }
  }

  // ─── 5) CONFERIR_PAGAMENTO_RGE ────────────────────────────────────────
  // 10 dias após pagoEm. Source: ConsumerBill com pagoEm preenchido mas
  // contaPaga ainda false (concessionária não confirmou). Pareia com a
  // dupla checagem da Gestão Financeira (interno × Infosimples).
  // Some sozinha quando o próximo sync trouxer contaPaga=true (vira DONE).
  const billsForConferRge = await prisma.consumerBill.findMany({
    where: {
      pagoEm: {
        gte: startOfDayInstant(addDays(windowStart, -DIAS_ATE_CONFERIR_RGE - SLACK_DIAS)),
        lte: endOfDayInstant(addDays(windowEnd, -DIAS_ATE_CONFERIR_RGE + SLACK_DIAS)),
      },
      OR: [
        { plantId: { not: null } },
        { consumerUnit: { origem: "PADRAO" } },
      ],
    },
    select: {
      id: true,
      pagoEm: true,
      contaPaga: true,
      mesReferencia: true,
      anoReferencia: true,
      consumerUnitId: true,
      consumerUnit: { select: { nome: true, codigoUc: true } },
      plant: { select: { name: true, unidadeConsumidora: true } },
    },
  });

  for (const b of billsForConferRge) {
    const pagoEm = toDateOnly(b.pagoEm);
    if (!pagoEm) continue;
    const scheduled = previousBusinessDay(addDays(pagoEm, DIAS_ATE_CONFERIR_RGE));
    if (!isWithin(scheduled, windowStart, windowEnd)) continue;
    const isDone = b.contaPaga;
    const isOverdue = !isDone && scheduled < today;
    const nomeRef =
      b.consumerUnit?.nome ??
      formatCodigoUc(b.consumerUnit?.codigoUc) ??
      b.plant?.name ??
      formatCodigoUc(b.plant?.unidadeConsumidora) ??
      "";
    const labelUc = b.consumerUnit
      ? `${formatCodigoUc(b.consumerUnit.codigoUc)} — ${b.consumerUnit.nome}`
      : b.plant
        ? `${formatCodigoUc(b.plant.unidadeConsumidora) ?? "—"} — ${b.plant.name} (usina)`
        : null;
    tasks.push({
      id: `CONFERIR_RGE-${b.id}`,
      type: "CONFERIR_PAGAMENTO_RGE",
      title: `Conferir pagamento na RGE — ${nomeRef}`.trim(),
      subtitle: `Pago em ${formatDateOnlyBR(pagoEm)} · Ref. ${String(b.mesReferencia).padStart(2, "0")}/${b.anoReferencia}`,
      scheduledFor: scheduled,
      dueDate: null,
      status: isDone ? "DONE" : isOverdue ? "OVERDUE" : "PENDING",
      sourceEntityType: "ConsumerBill",
      sourceEntityId: b.id,
      href: "/admin/faturas-energia/gestao-financeira",
      mesReferencia: b.mesReferencia,
      anoReferencia: b.anoReferencia,
      consumerUnitId: b.consumerUnitId,
      consumerUnitLabel: labelUc,
      valor: null,
      pagaInvestidor: false,
    });
  }

  // ─── 6) INFORMAR_LEITURA_RGE ──────────────────────────────────────────
  // 1 dia antes de ConsumerBill.proximaLeitura (do bill mais recente de cada UC).
  // Sem status auto-derivável — sempre PENDING ou OVERDUE.
  const ucsComLeitura = await prisma.consumerUnit.findMany({
    where: { active: true, origem: "PADRAO" },
    select: {
      id: true,
      nome: true,
      codigoUc: true,
      bills: {
        where: { proximaLeitura: { not: null } },
        orderBy: { syncedAt: "desc" },
        take: 1,
        select: {
          id: true,
          proximaLeitura: true,
          mesReferencia: true,
          anoReferencia: true,
        },
      },
    },
  });

  for (const uc of ucsComLeitura) {
    const latest = uc.bills[0];
    const proximaLeitura = toDateOnly(latest?.proximaLeitura);
    if (!proximaLeitura) continue;
    const scheduled = previousBusinessDay(addDays(proximaLeitura, -1));
    if (!isWithin(scheduled, windowStart, windowEnd)) continue;
    const isOverdue = scheduled < today;
    tasks.push({
      id: `INFORMAR_LEITURA-${uc.id}-${ymd(proximaLeitura)}`,
      type: "INFORMAR_LEITURA_RGE",
      title: `Informar leitura — ${uc.nome ?? formatCodigoUc(uc.codigoUc)}`,
      subtitle: `Leitura prevista ${formatDateOnlyBR(proximaLeitura)}`,
      scheduledFor: scheduled,
      dueDate: proximaLeitura,
      status: isOverdue ? "OVERDUE" : "PENDING",
      sourceEntityType: "ConsumerUnit",
      sourceEntityId: uc.id,
      href: `/admin/unidades-consumidoras`,
      mesReferencia: latest.mesReferencia,
      anoReferencia: latest.anoReferencia,
      consumerUnitId: uc.id,
      consumerUnitLabel: `${formatCodigoUc(uc.codigoUc)} — ${uc.nome}`,
      valor: null,
      pagaInvestidor: false,
    });
  }

  // Antes do "marco zero" só aparecem DONE — esconde pendências/atrasos legados
  // mas preserva o histórico de tarefas concluídas (ex.: faturas do backup Lumi).
  const filtered = AGENDA_MIN_DATE
    ? tasks.filter((t) => t.scheduledFor >= AGENDA_MIN_DATE || t.status === "DONE")
    : tasks;

  // Ordena por scheduledFor crescente
  filtered.sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime());

  return filtered;
}

function monthDay(year: number, monthIndex: number, day: number): Date {
  // Trata overflow do mês (-1 = dezembro do ano anterior; 12 = janeiro do próximo)
  const normalizedYear = year + Math.floor(monthIndex / 12);
  const normalizedMonth = ((monthIndex % 12) + 12) % 12;
  return dateOnlyUTC(
    normalizedYear,
    normalizedMonth + 1,
    Math.min(day, lastDayOfMonth(normalizedYear, normalizedMonth)),
  );
}

// Aceita tanto um instante real (`new Date()`) quanto um dia-calendário já
// ancorado em 12:00 UTC — `dayInBrasil` devolve o mesmo dia nos dois casos,
// e é o fuso de Brasília que define de quem é a semana.
export function startOfWeekMonday(d: Date): Date {
  return startOfWeekMondayOnly(dayInBrasil(d));
}

export function endOfWeekSunday(d: Date): Date {
  return endOfWeekSundayOnly(dayInBrasil(d));
}

export const TASK_TYPE_LABEL: Record<AgendaTaskType, string> = {
  PAGAR_FATURA: "Pagar fatura",
  EMITIR_RELATORIO_MENSAL: "Emitir relatório",
  COBRAR_CLIENTE_DESCONTO: "Cobrar cliente",
  PAGAR_INVESTIDOR: "Pagar investidor",
  INFORMAR_LEITURA_RGE: "Informar leitura RGE",
  CONFERIR_PAGAMENTO_RGE: "Conferir pagamento RGE",
};

import { prisma } from "./prisma";

/**
 * Tarefas com `scheduledFor` anterior a esta data não aparecem na agenda.
 * Permite "esconder" o histórico até o backfill dos dados-origem (pagoEm,
 * publishedAt etc.) ser feito. Para mostrar tudo, defina como `null` ou
 * uma data bem antiga (ex.: new Date(2020, 0, 1)).
 */
export const AGENDA_MIN_DATE: Date | null = new Date(2026, 3, 1); // 2026-04-01

export type AgendaTaskType =
  | "PAGAR_FATURA"
  | "EMITIR_RELATORIO_MENSAL"
  | "COBRAR_CLIENTE_DESCONTO"
  | "PAGAR_INVESTIDOR"
  | "INFORMAR_LEITURA_RGE";

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
}

const DAY = 24 * 60 * 60 * 1000;

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY);
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function isWithin(date: Date, start: Date, end: Date): boolean {
  return date >= start && date <= end;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Devolve todas as tarefas auto-derivadas pra janela [start, end].
 * Tarefas com `scheduledFor` na janela aparecem. Status:
 *  - DONE → o dado-origem já foi resolvido
 *  - OVERDUE → scheduledFor passou e a `dueDate` (deadline real) também
 *  - PENDING → caso contrário
 */
export async function getTasksForWeek(start: Date, end: Date): Promise<AgendaTask[]> {
  const windowStart = startOfDay(start);
  const windowEnd = endOfDay(end);
  const today = startOfDay(new Date());

  const tasks: AgendaTask[] = [];

  // ─── 1) PAGAR_FATURA ──────────────────────────────────────────────────
  // 2 dias antes do vencimento. Source: ConsumerBill com vencimento na janela [start+2d, end+2d].
  // DONE se pagoEm preenchido.
  const billsForPayment = await prisma.consumerBill.findMany({
    where: {
      vencimento: {
        gte: addDays(windowStart, 2),
        lte: addDays(windowEnd, 2),
      },
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
    },
  });

  for (const b of billsForPayment) {
    if (!b.vencimento) continue;
    const scheduled = addDays(b.vencimento, -2);
    if (!isWithin(scheduled, windowStart, windowEnd)) continue;
    const isDone = !!b.pagoEm;
    const isOverdue = !isDone && b.vencimento < today;
    tasks.push({
      id: `PAGAR_FATURA-${b.id}`,
      type: "PAGAR_FATURA",
      title: `Pagar fatura ${b.consumerUnit?.nome ?? b.consumerUnit?.codigoUc ?? ""}`.trim(),
      subtitle: b.valorTotal ? `R$ ${b.valorTotal.toFixed(2).replace(".", ",")} · vence ${b.vencimento.toLocaleDateString("pt-BR")}` : `Vence ${b.vencimento.toLocaleDateString("pt-BR")}`,
      scheduledFor: scheduled,
      dueDate: b.vencimento,
      status: isDone ? "DONE" : isOverdue ? "OVERDUE" : "PENDING",
      sourceEntityType: "ConsumerBill",
      sourceEntityId: b.id,
      href: "/admin/faturas-energia",
      mesReferencia: b.mesReferencia,
      anoReferencia: b.anoReferencia,
      consumerUnitId: b.consumerUnitId,
      consumerUnitLabel: b.consumerUnit
        ? `${b.consumerUnit.codigoUc} — ${b.consumerUnit.nome}`
        : null,
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
        gte: addDays(windowStart, -3),
        lte: addDays(windowEnd, -3),
      },
      consumerUnitId: { not: null },
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
            select: { id: true, asaasChargeId: true, ano: true, mes: true },
          },
        },
      },
    },
  });

  for (const b of billsForCharge) {
    if (!b.syncedAt) continue;
    // Só UC de cliente final com rateio (tem consumer + plant)
    if (!b.consumerUnit?.consumerId || !b.consumerUnit?.plantId) continue;
    const scheduled = addDays(b.syncedAt, 3);
    if (!isWithin(scheduled, windowStart, windowEnd)) continue;
    const billing = b.consumerUnit.billings.find(
      (x) => x.ano === b.anoReferencia && x.mes === b.mesReferencia
    );
    const isDone = !!billing?.asaasChargeId;
    const isOverdue = !isDone && scheduled < today;
    tasks.push({
      id: `COBRAR_CLIENTE-${b.id}`,
      type: "COBRAR_CLIENTE_DESCONTO",
      title: `Cobrar ${b.consumerUnit.nome ?? b.consumerUnit.codigoUc}`,
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
      consumerUnitLabel: `${b.consumerUnit.codigoUc} — ${b.consumerUnit.nome}`,
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
      monthDay(windowStart.getFullYear(), windowStart.getMonth(), p.diaPagamentoInvestidor),
      monthDay(windowStart.getFullYear(), windowStart.getMonth() + 1, p.diaPagamentoInvestidor),
      monthDay(windowStart.getFullYear(), windowStart.getMonth() - 1, p.diaPagamentoInvestidor),
    ];
    for (const scheduled of candidates) {
      if (!isWithin(scheduled, windowStart, windowEnd)) continue;
      // Mês de referência é o mês ANTERIOR ao do pagamento (paga em outubro o relatório de setembro)
      const refMonth = scheduled.getMonth() === 0 ? 12 : scheduled.getMonth();
      const refYear = scheduled.getMonth() === 0 ? scheduled.getFullYear() - 1 : scheduled.getFullYear();
      const payables = await prisma.investorPayable.findMany({
        where: {
          plantId: p.id,
          anoReferencia: refYear,
          mesReferencia: refMonth,
        },
        select: { id: true, status: true },
      });
      const isDone = payables.length > 0 && payables.every((pay) => pay.status === "PAGO");
      const isOverdue = !isDone && scheduled < today;
      tasks.push({
        id: `PAGAR_INVESTIDOR-${p.id}-${refYear}-${refMonth}`,
        type: "PAGAR_INVESTIDOR",
        title: `Pagar investidor — ${p.name}`,
        subtitle: `Ref. ${String(refMonth).padStart(2, "0")}/${refYear} · ${payables.length} payable(s)`,
        scheduledFor: scheduled,
        dueDate: scheduled,
        status: isDone ? "DONE" : isOverdue ? "OVERDUE" : "PENDING",
        sourceEntityType: "Plant",
        sourceEntityId: p.id,
        href: "/admin/faturamento/fechamentos-investidor",
        mesReferencia: refMonth,
        anoReferencia: refYear,
        consumerUnitId: null,
        consumerUnitLabel: null,
      });
    }

    // ─── 4) EMITIR_RELATORIO_MENSAL ────────────────────────────────────────
    // 3 dias antes do PAGAR_INVESTIDOR daquela usina. 1 task por usina/mês.
    // DONE se MonthlyReport daquele mês/usina tem publishedAt.
    for (const scheduledPagamento of candidates) {
      const scheduled = addDays(scheduledPagamento, -3);
      if (!isWithin(scheduled, windowStart, windowEnd)) continue;
      const refMonth = scheduledPagamento.getMonth() === 0 ? 12 : scheduledPagamento.getMonth();
      const refYear =
        scheduledPagamento.getMonth() === 0
          ? scheduledPagamento.getFullYear() - 1
          : scheduledPagamento.getFullYear();
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
      });
    }
  }

  // ─── 5) INFORMAR_LEITURA_RGE ──────────────────────────────────────────
  // 1 dia antes de ConsumerBill.proximaLeitura (do bill mais recente de cada UC).
  // Sem status auto-derivável — sempre PENDING ou OVERDUE.
  const ucsComLeitura = await prisma.consumerUnit.findMany({
    where: { active: true },
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
    if (!latest?.proximaLeitura) continue;
    const scheduled = addDays(latest.proximaLeitura, -1);
    if (!isWithin(scheduled, windowStart, windowEnd)) continue;
    const isOverdue = scheduled < today;
    tasks.push({
      id: `INFORMAR_LEITURA-${uc.id}-${ymd(latest.proximaLeitura)}`,
      type: "INFORMAR_LEITURA_RGE",
      title: `Informar leitura — ${uc.nome ?? uc.codigoUc}`,
      subtitle: `Leitura prevista ${latest.proximaLeitura.toLocaleDateString("pt-BR")}`,
      scheduledFor: scheduled,
      dueDate: latest.proximaLeitura,
      status: isOverdue ? "OVERDUE" : "PENDING",
      sourceEntityType: "ConsumerUnit",
      sourceEntityId: uc.id,
      href: `/admin/unidades-consumidoras`,
      mesReferencia: latest.mesReferencia,
      anoReferencia: latest.anoReferencia,
      consumerUnitId: uc.id,
      consumerUnitLabel: `${uc.codigoUc} — ${uc.nome}`,
    });
  }

  // Filtra tarefas antes do "marco zero" da agenda (histórico escondido até backfill).
  const filtered = AGENDA_MIN_DATE
    ? tasks.filter((t) => t.scheduledFor >= AGENDA_MIN_DATE)
    : tasks;

  // Ordena por scheduledFor crescente
  filtered.sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime());

  return filtered;
}

function monthDay(year: number, monthIndex: number, day: number): Date {
  // Trata overflow do mês (-1 = dezembro do ano anterior; 12 = janeiro do próximo)
  const d = new Date(year, monthIndex, Math.min(day, lastDayOfMonth(year, monthIndex)));
  d.setHours(0, 0, 0, 0);
  return d;
}

export function startOfWeekMonday(d: Date): Date {
  const x = startOfDay(d);
  const dow = x.getDay(); // 0=domingo, 1=segunda... 6=sábado
  const diff = dow === 0 ? -6 : 1 - dow;
  return addDays(x, diff);
}

export function endOfWeekSunday(d: Date): Date {
  const start = startOfWeekMonday(d);
  return endOfDay(addDays(start, 6));
}

export const TASK_TYPE_LABEL: Record<AgendaTaskType, string> = {
  PAGAR_FATURA: "Pagar fatura",
  EMITIR_RELATORIO_MENSAL: "Emitir relatório",
  COBRAR_CLIENTE_DESCONTO: "Cobrar cliente",
  PAGAR_INVESTIDOR: "Pagar investidor",
  INFORMAR_LEITURA_RGE: "Informar leitura RGE",
};

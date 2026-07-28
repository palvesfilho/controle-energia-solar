"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { PagarFaturaDialog } from "./pagar-fatura-dialog";
import {
  ChevronLeft,
  ChevronRight,
  Receipt,
  FileBarChart,
  Wallet,
  Users,
  Gauge,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Circle,
  CalendarDays,
  Search,
  X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { TASK_TYPE_LABEL, type AgendaTaskType, type AgendaTaskStatus } from "@/lib/agenda";
import { matchBusca } from "@/lib/busca";
import {
  addDaysOnly,
  dateOnlyKey,
  parseDateOnlyISO,
  todayInBrasil,
} from "@/lib/date-only";

interface SerializedTask {
  id: string;
  type: AgendaTaskType;
  title: string;
  subtitle: string | null;
  /** Dia-calendário "YYYY-MM-DD" — nunca ISO com hora (ver date-only.ts). */
  scheduledFor: string;
  dueDate: string | null;
  status: AgendaTaskStatus;
  sourceEntityType: string;
  sourceEntityId: string;
  href: string | null;
  mesReferencia: number | null;
  anoReferencia: number | null;
  consumerUnitId: string | null;
  consumerUnitLabel: string | null;
  valor: number | null;
  pagaInvestidor: boolean;
}

interface UcOption {
  id: string;
  /** Nome do cliente — chave de ordenação do filtro. Null quando a UC não tem nome. */
  nome: string | null;
  label: string;
}

interface AgendaWeekGridProps {
  /** "YYYY-MM-DD" da segunda-feira da semana. */
  inicio: string;
  /** "YYYY-MM-DD" do domingo da semana. */
  fim: string;
  userRole: string | null;
  tasks: SerializedTask[];
  allUcs: UcOption[];
}

const DIA_LABEL = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
const DIA_LABEL_SHORT = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 2,
});

const TYPE_META: Record<AgendaTaskType, { icon: React.ElementType; tone: string }> = {
  PAGAR_FATURA: {
    icon: Receipt,
    tone: "border-l-blue-500 bg-blue-50 dark:bg-blue-950/30",
  },
  EMITIR_RELATORIO_MENSAL: {
    icon: FileBarChart,
    tone: "border-l-emerald-500 bg-emerald-50 dark:bg-emerald-950/30",
  },
  COBRAR_CLIENTE_DESCONTO: {
    icon: Wallet,
    tone: "border-l-amber-500 bg-amber-50 dark:bg-amber-950/30",
  },
  PAGAR_INVESTIDOR: {
    icon: Users,
    tone: "border-l-violet-500 bg-violet-50 dark:bg-violet-950/30",
  },
  INFORMAR_LEITURA_RGE: {
    icon: Gauge,
    tone: "border-l-rose-500 bg-rose-50 dark:bg-rose-950/30",
  },
  CONFERIR_PAGAMENTO_RGE: {
    icon: ShieldCheck,
    tone: "border-l-purple-500 bg-purple-50 dark:bg-purple-950/30",
  },
};

const STATUS_META: Record<AgendaTaskStatus, { icon: React.ElementType; cls: string; label: string }> = {
  PENDING: { icon: Circle, cls: "text-slate-500", label: "Pendente" },
  DONE: { icon: CheckCircle2, cls: "text-emerald-600", label: "Feito" },
  OVERDUE: { icon: AlertCircle, cls: "text-red-600", label: "Atrasada" },
};

// Formata sempre a partir do componente UTC do dia-calendário: o rótulo tem
// que ser o mesmo no servidor (Railway, UTC) e no navegador (BRT).
function formatDiaMes(d: Date): string {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" });
}

function formatWeekRange(inicio: Date, fim: Date): string {
  return `${formatDiaMes(inicio)} — ${formatDiaMes(fim)}`;
}

function shiftWeekIso(currentInicio: Date, deltaWeeks: number): string {
  return dateOnlyKey(addDaysOnly(currentInicio, deltaWeeks * 7));
}

const ROLES_PODEM_EDITAR_PAGAMENTO = new Set(["ADMIN", "GESTOR"]);

export function AgendaWeekGrid({ inicio, fim, userRole, tasks, allUcs }: AgendaWeekGridProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inicioDate = useMemo(() => parseDateOnlyISO(inicio)!, [inicio]);
  const fimDate = useMemo(() => parseDateOnlyISO(fim)!, [fim]);

  const canEditPaidBill = userRole ? ROLES_PODEM_EDITAR_PAGAMENTO.has(userRole) : false;

  const [filterQuery, setFilterQuery] = useState("");
  const [filterType, setFilterType] = useState<AgendaTaskType | "ALL">("ALL");
  const [filterStatus, setFilterStatus] = useState<AgendaTaskStatus | "ALL">("ALL");
  const [filterMes, setFilterMes] = useState<string>("ALL"); // "ALL" ou "1".."12"
  const [filterAno, setFilterAno] = useState<string>("ALL"); // "ALL" ou "YYYY"
  const [filterUc, setFilterUc] = useState<string>("ALL"); // "ALL" ou consumerUnitId

  // Diálogo de ação por tipo de tarefa.
  const [openDialog, setOpenDialog] = useState<{ type: AgendaTaskType; sourceId: string } | null>(null);

  const handleTaskClick = (task: SerializedTask) => {
    if (task.type === "PAGAR_FATURA") {
      // Tasks DONE também abrem o dialog — em modo visualização/edição conforme o role.
      setOpenDialog({ type: task.type, sourceId: task.sourceEntityId });
    } else if (task.status === "DONE") {
      return; // outros tipos: feito sai do caminho
    } else if (task.href) {
      router.push(task.href);
    }
  };

  const handleDialogSuccess = () => {
    router.refresh();
  };

  // Opções dinâmicas dos dropdowns — derivadas das tarefas visíveis na semana.
  const MESES_NOMES = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];

  const mesOptions = useMemo(() => {
    const set = new Set<number>();
    for (const t of tasks) {
      if (t.mesReferencia != null) set.add(t.mesReferencia);
    }
    return Array.from(set)
      .sort((a, b) => a - b)
      .map((m) => ({ value: String(m), label: MESES_NOMES[m - 1] }));
  }, [tasks]);

  const anoOptions = useMemo(() => {
    const set = new Set<number>();
    for (const t of tasks) {
      if (t.anoReferencia != null) set.add(t.anoReferencia);
    }
    return Array.from(set)
      .sort((a, b) => b - a)
      .map((y) => ({ value: String(y), label: String(y) }));
  }, [tasks]);

  const ucOptions = useMemo(() => {
    // Ordem alfabética pelo NOME do cliente (ignorando acento e caixa), não pelo
    // código da UC. UCs sem nome caem no fim da lista, ordenadas pelo rótulo.
    return allUcs
      .map((u) => ({ value: u.id, label: u.label, nome: u.nome }))
      .sort((a, b) => {
        if (!a.nome && !b.nome) return a.label.localeCompare(b.label, "pt-BR");
        if (!a.nome) return 1;
        if (!b.nome) return -1;
        return a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });
      });
  }, [allUcs]);

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      // Busca por nome do cliente ou código da UC — casa contra título,
      // subtítulo e o rótulo "codigoUc — nome". O código pode vir pontuado no
      // rótulo e em dígitos no que o operador digita (ou o contrário).
      if (!matchBusca(filterQuery, [t.title, t.subtitle, t.consumerUnitLabel])) {
        return false;
      }
      if (filterType !== "ALL" && t.type !== filterType) return false;
      if (filterStatus !== "ALL" && t.status !== filterStatus) return false;
      if (filterMes !== "ALL") {
        if (t.mesReferencia == null) return false;
        if (t.mesReferencia !== Number(filterMes)) return false;
      }
      if (filterAno !== "ALL") {
        if (t.anoReferencia == null) return false;
        if (t.anoReferencia !== Number(filterAno)) return false;
      }
      if (filterUc !== "ALL") {
        if (t.consumerUnitId !== filterUc) return false;
      }
      return true;
    });
  }, [tasks, filterQuery, filterType, filterStatus, filterMes, filterAno, filterUc]);

  const hasActiveFilters =
    filterQuery.trim() !== "" ||
    filterType !== "ALL" ||
    filterStatus !== "ALL" ||
    filterMes !== "ALL" ||
    filterAno !== "ALL" ||
    filterUc !== "ALL";

  const clearFilters = () => {
    setFilterQuery("");
    setFilterType("ALL");
    setFilterStatus("ALL");
    setFilterMes("ALL");
    setFilterAno("ALL");
    setFilterUc("ALL");
  };

  // Colunas da semana como chaves "YYYY-MM-DD" (seg → dom).
  const dayKeys = useMemo(
    () => Array.from({ length: 7 }, (_, i) => dateOnlyKey(addDaysOnly(inicioDate, i))),
    [inicioDate],
  );

  // Agrupa por dia comparando a chave de data, não o dia da semana lido no
  // fuso do navegador — era daí que vinha a tarefa de segunda caindo na coluna
  // de domingo quando o servidor gravava a data em meia-noite UTC.
  const tasksByDay = useMemo(() => {
    const byDay: SerializedTask[][] = [[], [], [], [], [], [], []];
    const indexOf = new Map(dayKeys.map((k, i) => [k, i]));
    for (const t of filtered) {
      const idx = indexOf.get(t.scheduledFor);
      if (idx === undefined) continue; // fora da semana exibida
      byDay[idx].push(t);
    }
    return byDay;
  }, [filtered, dayKeys]);

  // Soma de valores a pagar em aberto (PAGAR_FATURA, status != DONE) por dia.
  // Faturas de usinas onde o investidor paga direto são puladas — aparecem
  // na agenda só pra controle, não saem do caixa da gestora.
  const valorAPagarByDay = useMemo(() => {
    return tasksByDay.map((dayTasks) =>
      dayTasks.reduce((acc, t) => {
        if (t.type !== "PAGAR_FATURA") return acc;
        if (t.status === "DONE") return acc;
        if (t.pagaInvestidor) return acc;
        return acc + (t.valor ?? 0);
      }, 0)
    );
  }, [tasksByDay]);

  // Soma de valores a receber em aberto (COBRAR_CLIENTE_DESCONTO, status != DONE) por dia.
  const valorAReceberByDay = useMemo(() => {
    return tasksByDay.map((dayTasks) =>
      dayTasks.reduce((acc, t) => {
        if (t.type !== "COBRAR_CLIENTE_DESCONTO") return acc;
        if (t.status === "DONE") return acc;
        return acc + (t.valor ?? 0);
      }, 0)
    );
  }, [tasksByDay]);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysOnly(inicioDate, i)),
    [inicioDate],
  );

  // "Hoje" é o dia em Brasília — não o do relógio do navegador, que pode estar
  // em outro fuso e destacaria a coluna errada.
  const todayKey = useMemo(() => dateOnlyKey(todayInBrasil()), []);

  const goWeek = (delta: number) => {
    const params = new URLSearchParams(searchParams);
    const novaSemana = shiftWeekIso(inicioDate, delta);
    params.set("semana", novaSemana);
    router.push(`/admin/agenda?${params.toString()}`);
  };

  const goToday = () => {
    router.push(`/admin/agenda`);
  };

  // Estatísticas
  const stats = useMemo(() => {
    const total = filtered.length;
    const done = filtered.filter((t) => t.status === "DONE").length;
    const overdue = filtered.filter((t) => t.status === "OVERDUE").length;
    return { total, done, overdue, pending: total - done - overdue };
  }, [filtered]);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg border bg-background p-1">
          <button
            type="button"
            onClick={() => goWeek(-1)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Semana anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={goToday}
            className="rounded-md px-3 py-1 text-sm font-medium hover:bg-muted"
          >
            Hoje
          </button>
          <button
            type="button"
            onClick={() => goWeek(1)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Próxima semana"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{formatWeekRange(inicioDate, fimDate)}</span>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Buscar cliente ou código da UC…"
              className="w-56 rounded-md border bg-background py-1 pl-7 pr-7 text-sm"
            />
            {filterQuery && (
              <button
                type="button"
                onClick={() => setFilterQuery("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Limpar busca"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as AgendaTaskType | "ALL")}
            className="rounded-md border bg-background px-2 py-1 text-sm"
          >
            <option value="ALL">Todos os tipos</option>
            {(Object.keys(TASK_TYPE_LABEL) as AgendaTaskType[]).map((t) => (
              <option key={t} value={t}>
                {TASK_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as AgendaTaskStatus | "ALL")}
            className="rounded-md border bg-background px-2 py-1 text-sm"
          >
            <option value="ALL">Todos os status</option>
            <option value="PENDING">Pendentes</option>
            <option value="OVERDUE">Atrasadas</option>
            <option value="DONE">Feitas</option>
          </select>
          <select
            value={filterMes}
            onChange={(e) => setFilterMes(e.target.value)}
            className="rounded-md border bg-background px-2 py-1 text-sm"
            disabled={mesOptions.length === 0}
          >
            <option value="ALL">Todos os meses</option>
            {mesOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={filterAno}
            onChange={(e) => setFilterAno(e.target.value)}
            className="rounded-md border bg-background px-2 py-1 text-sm"
            disabled={anoOptions.length === 0}
          >
            <option value="ALL">Todos os anos</option>
            {anoOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={filterUc}
            onChange={(e) => setFilterUc(e.target.value)}
            className="rounded-md border bg-background px-2 py-1 text-sm max-w-[220px]"
            disabled={ucOptions.length === 0}
          >
            <option value="ALL">Todas as UCs</option>
            {ucOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
            >
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card size="sm">
          <CardContent className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Total</span>
            <span className="text-xl font-semibold">{stats.total}</span>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Pendentes</span>
            <span className="text-xl font-semibold text-slate-600">{stats.pending}</span>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Atrasadas</span>
            <span className="text-xl font-semibold text-red-600">{stats.overdue}</span>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Feitas</span>
            <span className="text-xl font-semibold text-emerald-600">{stats.done}</span>
          </CardContent>
        </Card>
      </div>

      {/* Diálogos de ação por tipo */}
      <PagarFaturaDialog
        billId={openDialog?.type === "PAGAR_FATURA" ? openDialog.sourceId : null}
        open={openDialog?.type === "PAGAR_FATURA"}
        canEditPaid={canEditPaidBill}
        onOpenChange={(open) => !open && setOpenDialog(null)}
        onSuccess={handleDialogSuccess}
      />

      {/* Grade Seg→Dom */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-7">
        {days.map((day, idx) => {
          const isToday = dayKeys[idx] === todayKey;
          const dayTasks = tasksByDay[idx];
          const valorAPagar = valorAPagarByDay[idx];
          const valorAReceber = valorAReceberByDay[idx];
          return (
            <div
              key={idx}
              className={cn(
                "flex flex-col rounded-lg border bg-background",
                isToday && "ring-2 ring-primary/40"
              )}
            >
              <div
                className={cn(
                  "border-b px-3 py-2",
                  isToday ? "bg-primary/10" : "bg-muted/40"
                )}
              >
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {DIA_LABEL_SHORT[idx]}
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-lg font-semibold">
                    {day.getUTCDate().toString().padStart(2, "0")}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {day.toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" })}
                  </span>
                </div>
                <div
                  className={cn(
                    "mt-1 text-[11px] font-medium",
                    valorAPagar > 0
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-muted-foreground/40"
                  )}
                  title={
                    valorAPagar > 0
                      ? "Soma das faturas em aberto programadas para este dia"
                      : "Sem faturas a pagar neste dia"
                  }
                >
                  {valorAPagar > 0 ? (
                    <>
                      {BRL.format(valorAPagar)}{" "}
                      <span className="font-normal text-muted-foreground">a pagar</span>
                    </>
                  ) : (
                    "—"
                  )}
                </div>
                <div
                  className={cn(
                    "text-[11px] font-medium",
                    valorAReceber > 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-muted-foreground/40"
                  )}
                  title={
                    valorAReceber > 0
                      ? "Soma das cobranças aos clientes programadas para este dia"
                      : "Sem cobranças a receber neste dia"
                  }
                >
                  {valorAReceber > 0 ? (
                    <>
                      {BRL.format(valorAReceber)}{" "}
                      <span className="font-normal text-muted-foreground">a receber</span>
                    </>
                  ) : (
                    "—"
                  )}
                </div>
              </div>

              <div className="flex-1 space-y-2 p-2 min-h-[80px]">
                {dayTasks.length === 0 ? (
                  <div className="flex h-full items-center justify-center py-4 text-xs text-muted-foreground/60">
                    —
                  </div>
                ) : (
                  dayTasks.map((task) => (
                    <TaskCard key={task.id} task={task} onClick={() => handleTaskClick(task)} />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TaskCard({ task, onClick }: { task: SerializedTask; onClick: () => void }) {
  const TypeIcon = TYPE_META[task.type].icon;
  const tone = TYPE_META[task.type].tone;
  const StatusIcon = STATUS_META[task.status].icon;
  const statusCls = STATUS_META[task.status].cls;
  const isDone = task.status === "DONE";
  // PAGAR_FATURA permanece clicável quando DONE (abre detalhes). Outros tipos seguem desabilitados.
  const clickableQuandoDone = task.type === "PAGAR_FATURA";
  const disabled = isDone && !clickableQuandoDone;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group block w-full rounded-md border-l-4 p-2 text-xs text-left transition",
        tone,
        disabled
          ? "opacity-60 cursor-default"
          : isDone
            ? "opacity-75 hover:opacity-100 hover:shadow-sm cursor-pointer"
            : "hover:shadow-sm hover:brightness-95 cursor-pointer"
      )}
    >
      <div className="flex items-start gap-1.5">
        <TypeIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground/70" />
        <div className="flex-1 min-w-0">
          <div
            className={cn(
              "font-medium text-foreground/90 leading-tight",
              isDone && "line-through"
            )}
          >
            {task.title}
          </div>
          {task.subtitle && (
            <div className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">
              {task.subtitle}
            </div>
          )}
          {task.pagaInvestidor && (
            <div className="mt-1 inline-flex items-center rounded-sm bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
              Investidor paga
            </div>
          )}
        </div>
        <StatusIcon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", statusCls)} />
      </div>
    </button>
  );
}

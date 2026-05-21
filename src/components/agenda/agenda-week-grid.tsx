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
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { TASK_TYPE_LABEL, type AgendaTaskType, type AgendaTaskStatus } from "@/lib/agenda";

interface SerializedTask {
  id: string;
  type: AgendaTaskType;
  title: string;
  subtitle: string | null;
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
}

interface UcOption {
  id: string;
  label: string;
}

interface AgendaWeekGridProps {
  inicio: string;
  fim: string;
  userRole: string | null;
  tasks: SerializedTask[];
  allUcs: UcOption[];
}

const DIA_LABEL = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
const DIA_LABEL_SHORT = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

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

function formatWeekRange(inicio: Date, fim: Date): string {
  const fmt = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  return `${fmt(inicio)} — ${fmt(fim)}`;
}

function shiftWeekIso(currentInicio: Date, deltaWeeks: number): string {
  const d = new Date(currentInicio);
  d.setDate(d.getDate() + deltaWeeks * 7);
  return d.toISOString();
}

const ROLES_PODEM_EDITAR_PAGAMENTO = new Set(["ADMIN", "GESTOR"]);

export function AgendaWeekGrid({ inicio, fim, userRole, tasks, allUcs }: AgendaWeekGridProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inicioDate = useMemo(() => new Date(inicio), [inicio]);
  const fimDate = useMemo(() => new Date(fim), [fim]);

  const canEditPaidBill = userRole ? ROLES_PODEM_EDITAR_PAGAMENTO.has(userRole) : false;

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
    return allUcs
      .map((u) => ({ value: u.id, label: u.label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [allUcs]);

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
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
  }, [tasks, filterType, filterStatus, filterMes, filterAno, filterUc]);

  const hasActiveFilters =
    filterType !== "ALL" ||
    filterStatus !== "ALL" ||
    filterMes !== "ALL" ||
    filterAno !== "ALL" ||
    filterUc !== "ALL";

  const clearFilters = () => {
    setFilterType("ALL");
    setFilterStatus("ALL");
    setFilterMes("ALL");
    setFilterAno("ALL");
    setFilterUc("ALL");
  };

  // Agrupa por dia da semana (0=seg, 6=dom)
  const tasksByDay = useMemo(() => {
    const byDay: SerializedTask[][] = [[], [], [], [], [], [], []];
    for (const t of filtered) {
      const d = new Date(t.scheduledFor);
      const dow = d.getDay(); // 0=dom, 1=seg
      const idx = dow === 0 ? 6 : dow - 1; // seg=0, dom=6
      byDay[idx].push(t);
    }
    return byDay;
  }, [filtered]);

  const days = useMemo(() => {
    const result: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(inicioDate);
      d.setDate(d.getDate() + i);
      result.push(d);
    }
    return result;
  }, [inicioDate]);

  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

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

        <div className="ml-auto flex items-center gap-2">
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
          const isToday = day.getTime() === today.getTime();
          const dayTasks = tasksByDay[idx];
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
                    {day.getDate().toString().padStart(2, "0")}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {day.toLocaleDateString("pt-BR", { month: "short" })}
                  </span>
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
        </div>
        <StatusIcon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", statusCls)} />
      </div>
    </button>
  );
}

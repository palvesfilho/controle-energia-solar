"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import "gantt-task-react/dist/index.css";
import type { Task, ViewMode } from "gantt-task-react";

const Gantt = dynamic(() => import("gantt-task-react").then((m) => m.Gantt), {
  ssr: false,
  loading: () => (
    <div className="p-10 text-center text-sm text-muted-foreground">
      Carregando Gantt…
    </div>
  ),
});

export interface GanttTarefa {
  id: string;
  nome: string;
  dataInicioPlan: string;
  dataFimPlan: string;
  progresso: number;
  status: string;
  cor: string | null;
  dependencias: { dependeDe: { id: string } }[];
}

interface ObraGanttProps {
  tarefas: GanttTarefa[];
  onChanged: () => void;
}

const COR_POR_STATUS: Record<string, { bg: string; progress: string }> = {
  NAO_INICIADA: { bg: "#cbd5e1", progress: "#64748b" },
  EM_EXECUCAO: { bg: "#fed7aa", progress: "#f97316" },
  PAUSADA: { bg: "#fde68a", progress: "#ca8a04" },
  CONCLUIDA: { bg: "#bbf7d0", progress: "#16a34a" },
  ATRASADA: { bg: "#fecaca", progress: "#dc2626" },
};

const VIEW_MODES: { value: ViewMode; label: string; columnWidth: number }[] = [
  { value: "Day" as ViewMode, label: "Dia", columnWidth: 40 },
  { value: "Week" as ViewMode, label: "Semana", columnWidth: 180 },
  { value: "Month" as ViewMode, label: "Mês", columnWidth: 220 },
];

export function ObraGantt({ tarefas, onChanged }: ObraGanttProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("Week" as ViewMode);

  const tasks: Task[] = useMemo(() => {
    return tarefas.map((t) => {
      const cores = COR_POR_STATUS[t.status] ?? COR_POR_STATUS.NAO_INICIADA;
      return {
        id: t.id,
        name: t.nome,
        type: "task",
        start: new Date(t.dataInicioPlan),
        end: new Date(t.dataFimPlan),
        progress: t.progresso,
        dependencies: t.dependencias.map((d) => d.dependeDe.id),
        styles: {
          backgroundColor: t.cor ?? cores.bg,
          backgroundSelectedColor: t.cor ?? cores.bg,
          progressColor: cores.progress,
          progressSelectedColor: cores.progress,
        },
      } as Task;
    });
  }, [tarefas]);

  async function handleDateChange(task: Task) {
    try {
      const res = await fetch(`/api/tarefas/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataInicioPlan: task.start.toISOString(),
          dataFimPlan: task.end.toISOString(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Erro ao atualizar" }));
        toast.error(err.error || "Erro ao atualizar tarefa");
        onChanged();
        return;
      }
      toast.success("Datas atualizadas");
      onChanged();
    } catch {
      toast.error("Erro de rede");
      onChanged();
    }
  }

  async function handleProgressChange(task: Task) {
    try {
      const res = await fetch(`/api/tarefas/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ progresso: task.progress }),
      });
      if (!res.ok) {
        toast.error("Erro ao atualizar progresso");
        onChanged();
        return;
      }
      onChanged();
    } catch {
      toast.error("Erro de rede");
      onChanged();
    }
  }

  if (tasks.length === 0) {
    return (
      <div className="p-10 text-center text-sm text-muted-foreground">
        Adicione tarefas para visualizar o cronograma em formato Gantt.
      </div>
    );
  }

  const columnWidth = VIEW_MODES.find((v) => v.value === viewMode)?.columnWidth ?? 60;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Visualização:</span>
        {VIEW_MODES.map((m) => (
          <Button
            key={m.value}
            type="button"
            size="sm"
            variant={viewMode === m.value ? "default" : "outline"}
            onClick={() => setViewMode(m.value)}
          >
            {m.label}
          </Button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Gantt
          tasks={tasks}
          viewMode={viewMode}
          columnWidth={columnWidth}
          listCellWidth="200px"
          onDateChange={handleDateChange}
          onProgressChange={handleProgressChange}
          locale="pt-BR"
          TooltipContent={({ task }) => (
            <div className="rounded-md bg-popover p-2 text-xs shadow-md ring-1 ring-foreground/10">
              <div className="font-medium">{task.name}</div>
              <div className="text-muted-foreground">
                {task.start.toLocaleDateString("pt-BR")} → {task.end.toLocaleDateString("pt-BR")}
              </div>
              <div className="text-muted-foreground">{Math.round(task.progress)}%</div>
            </div>
          )}
        />
      </div>
    </div>
  );
}

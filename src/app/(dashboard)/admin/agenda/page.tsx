import { getTasksForWeek, startOfWeekMonday, endOfWeekSunday } from "@/lib/agenda";
import { AgendaWeekGrid } from "@/components/agenda/agenda-week-grid";

interface AgendaPageProps {
  searchParams: Promise<{ semana?: string }>;
}

export default async function AgendaPage({ searchParams }: AgendaPageProps) {
  const { semana } = await searchParams;
  const ref = semana ? new Date(semana) : new Date();
  const inicio = startOfWeekMonday(ref);
  const fim = endOfWeekSunday(ref);

  const tasks = await getTasksForWeek(inicio, fim);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Agenda da Semana</h1>
        <p className="text-sm text-muted-foreground">
          Tarefas operacionais geradas automaticamente a partir dos dados do sistema.
        </p>
      </div>

      <AgendaWeekGrid
        inicio={inicio.toISOString()}
        fim={fim.toISOString()}
        tasks={tasks.map((t) => ({
          ...t,
          scheduledFor: t.scheduledFor.toISOString(),
          dueDate: t.dueDate?.toISOString() ?? null,
        }))}
      />
    </div>
  );
}

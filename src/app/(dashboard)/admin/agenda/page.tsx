import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { getTasksForWeek, startOfWeekMonday, endOfWeekSunday } from "@/lib/agenda";
import { AgendaWeekGrid } from "@/components/agenda/agenda-week-grid";
import { prisma } from "@/lib/prisma";
import { formatCodigoUc } from "@/lib/uc-codigo";
import { dateOnlyKey, parseDateOnlyISO } from "@/lib/date-only";

interface AgendaPageProps {
  searchParams: Promise<{ semana?: string }>;
}

export default async function AgendaPage({ searchParams }: AgendaPageProps) {
  const { semana } = await searchParams;
  // `semana` vem como "YYYY-MM-DD" — parseia como dia-calendário (12:00 UTC),
  // nunca com `new Date()` direto, que ancora em meia-noite UTC e volta um dia
  // no fuso brasileiro.
  const ref = (semana ? parseDateOnlyISO(semana) : null) ?? new Date();
  const inicio = startOfWeekMonday(ref);
  const fim = endOfWeekSunday(ref);

  const session = await getServerSession(authOptions);
  const userRole = session?.user?.role ?? null;

  const [tasks, ucs] = await Promise.all([
    getTasksForWeek(inicio, fim),
    prisma.consumerUnit.findMany({
      // Mesmo recorte de `getTasksForWeek`: só UCs do fluxo investidor geram
      // tarefa. UCs Brasil Solar (origem BRASIL_SOLAR_*) sincronizam fatura pra
      // monitoramento mas nunca entram na agenda — listá-las no filtro só
      // renderia semana vazia.
      where: { active: true, origem: "PADRAO" },
      select: { id: true, codigoUc: true, nome: true },
      orderBy: [{ nome: "asc" }],
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Agenda da Semana</h1>
        <p className="text-sm text-muted-foreground">
          Tarefas operacionais geradas automaticamente a partir dos dados do sistema.
        </p>
      </div>

      {/* Datas trafegam como "YYYY-MM-DD": string de dia-calendário não sofre
          conversão de fuso no navegador, ao contrário de um ISO com hora. */}
      <AgendaWeekGrid
        inicio={dateOnlyKey(inicio)}
        fim={dateOnlyKey(fim)}
        userRole={userRole}
        tasks={tasks.map((t) => ({
          ...t,
          scheduledFor: dateOnlyKey(t.scheduledFor),
          dueDate: t.dueDate ? dateOnlyKey(t.dueDate) : null,
        }))}
        // O filtro é ordenado alfabeticamente pelo nome do cliente, então o
        // rótulo começa pelo nome — código da UC vem depois, como referência.
        allUcs={ucs.map((u) => ({
          id: u.id,
          nome: u.nome ?? null,
          label: u.nome
            ? `${u.nome} — ${formatCodigoUc(u.codigoUc)}`
            : (formatCodigoUc(u.codigoUc) ?? ""),
        }))}
      />
    </div>
  );
}

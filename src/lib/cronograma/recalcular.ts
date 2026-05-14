import { Prisma, PrismaClient } from "@prisma/client";

const MS_POR_DIA = 1000 * 60 * 60 * 24;

function addDias(data: Date, dias: number): Date {
  return new Date(data.getTime() + dias * MS_POR_DIA);
}

interface TarefaState {
  id: string;
  duracaoDias: number;
  dataInicioPlan: Date;
  dataFimPlan: Date;
}

interface DependenciaState {
  tarefaId: string;      // sucessora
  dependeDeId: string;   // predecessora
  tipo: string;          // FS | SS | FF | SF
  lagDias: number;
}

/**
 * Ordena tarefas topologicamente (predecessoras antes das sucessoras).
 * Lança erro se detectar ciclo.
 */
function ordenarTopologicamente(
  tarefaIds: string[],
  deps: DependenciaState[]
): string[] {
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, string[]>();

  for (const id of tarefaIds) {
    incoming.set(id, 0);
    outgoing.set(id, []);
  }

  for (const d of deps) {
    if (!incoming.has(d.tarefaId) || !incoming.has(d.dependeDeId)) continue;
    outgoing.get(d.dependeDeId)!.push(d.tarefaId);
    incoming.set(d.tarefaId, (incoming.get(d.tarefaId) ?? 0) + 1);
  }

  const fila: string[] = [];
  for (const [id, grau] of incoming) {
    if (grau === 0) fila.push(id);
  }

  const ordem: string[] = [];
  while (fila.length > 0) {
    const id = fila.shift()!;
    ordem.push(id);
    for (const prox of outgoing.get(id) ?? []) {
      const novoGrau = (incoming.get(prox) ?? 0) - 1;
      incoming.set(prox, novoGrau);
      if (novoGrau === 0) fila.push(prox);
    }
  }

  if (ordem.length !== tarefaIds.length) {
    throw new Error("Ciclo detectado nas dependências de tarefas");
  }

  return ordem;
}

/**
 * Calcula nova dataInicio/dataFim para uma tarefa sucessora dada o estado
 * atual das predecessoras.
 * Retorna `null` se a tarefa não tem dependências (mantém datas atuais).
 */
function calcularDatas(
  tarefa: TarefaState,
  dependencias: DependenciaState[],
  estadoAtual: Map<string, TarefaState>
): { dataInicioPlan: Date; dataFimPlan: Date } | null {
  if (dependencias.length === 0) return null;

  let novaInicio: Date | null = null;
  let novaFim: Date | null = null;

  for (const dep of dependencias) {
    const pred = estadoAtual.get(dep.dependeDeId);
    if (!pred) continue;

    switch (dep.tipo) {
      case "FS": {
        // sucessora começa após predecessora terminar
        const candidato = addDias(pred.dataFimPlan, dep.lagDias);
        if (!novaInicio || candidato > novaInicio) novaInicio = candidato;
        break;
      }
      case "SS": {
        // sucessora começa junto com predecessora
        const candidato = addDias(pred.dataInicioPlan, dep.lagDias);
        if (!novaInicio || candidato > novaInicio) novaInicio = candidato;
        break;
      }
      case "FF": {
        // sucessora termina junto com predecessora
        const candidato = addDias(pred.dataFimPlan, dep.lagDias);
        if (!novaFim || candidato > novaFim) novaFim = candidato;
        break;
      }
      case "SF": {
        // sucessora termina quando predecessora começa
        const candidato = addDias(pred.dataInicioPlan, dep.lagDias);
        if (!novaFim || candidato > novaFim) novaFim = candidato;
        break;
      }
    }
  }

  const duracao = tarefa.duracaoDias;

  if (novaInicio && !novaFim) {
    novaFim = addDias(novaInicio, duracao);
  } else if (novaFim && !novaInicio) {
    novaInicio = addDias(novaFim, -duracao);
  } else if (novaInicio && novaFim) {
    // Se inicio e fim foram derivados, usa o inicio e recalcula fim pela duração
    // para manter consistência (caso contrário a duração mudaria arbitrariamente).
    novaFim = addDias(novaInicio, duracao);
  }

  if (!novaInicio || !novaFim) return null;

  return { dataInicioPlan: novaInicio, dataFimPlan: novaFim };
}

/**
 * Recalcula em cascata as datas planejadas de todas as tarefas de uma obra
 * a partir do grafo de dependências. Aplica os updates em transação.
 *
 * Retorna o id das tarefas cujas datas mudaram.
 */
export async function recalcularCronograma(
  tx: Prisma.TransactionClient | PrismaClient,
  obraId: string
): Promise<string[]> {
  const tarefas = await tx.obraTarefa.findMany({
    where: { obraId },
    select: {
      id: true,
      duracaoDias: true,
      dataInicioPlan: true,
      dataFimPlan: true,
    },
  });

  if (tarefas.length === 0) return [];

  const tarefaIds = tarefas.map((t) => t.id);

  const deps = await tx.tarefaDependencia.findMany({
    where: { tarefaId: { in: tarefaIds } },
    select: {
      tarefaId: true,
      dependeDeId: true,
      tipo: true,
      lagDias: true,
    },
  });

  const ordem = ordenarTopologicamente(tarefaIds, deps);

  const estado = new Map<string, TarefaState>();
  for (const t of tarefas) {
    estado.set(t.id, {
      id: t.id,
      duracaoDias: t.duracaoDias,
      dataInicioPlan: t.dataInicioPlan,
      dataFimPlan: t.dataFimPlan,
    });
  }

  const depsPorTarefa = new Map<string, DependenciaState[]>();
  for (const d of deps) {
    const lista = depsPorTarefa.get(d.tarefaId) ?? [];
    lista.push(d);
    depsPorTarefa.set(d.tarefaId, lista);
  }

  const alteradas: string[] = [];

  for (const id of ordem) {
    const tarefa = estado.get(id)!;
    const tarefaDeps = depsPorTarefa.get(id) ?? [];
    const novas = calcularDatas(tarefa, tarefaDeps, estado);
    if (!novas) continue;

    const mudouInicio = novas.dataInicioPlan.getTime() !== tarefa.dataInicioPlan.getTime();
    const mudouFim = novas.dataFimPlan.getTime() !== tarefa.dataFimPlan.getTime();
    if (!mudouInicio && !mudouFim) continue;

    estado.set(id, {
      ...tarefa,
      dataInicioPlan: novas.dataInicioPlan,
      dataFimPlan: novas.dataFimPlan,
    });
    alteradas.push(id);
  }

  // Aplica updates apenas nas tarefas que mudaram
  for (const id of alteradas) {
    const t = estado.get(id)!;
    await tx.obraTarefa.update({
      where: { id },
      data: {
        dataInicioPlan: t.dataInicioPlan,
        dataFimPlan: t.dataFimPlan,
      },
    });
  }

  return alteradas;
}

/**
 * Detecta se adicionar uma dependência criaria um ciclo no grafo.
 * Retorna `true` se criaria ciclo (inválido).
 */
export async function criariaCiclo(
  tx: Prisma.TransactionClient | PrismaClient,
  tarefaId: string,
  dependeDeId: string
): Promise<boolean> {
  if (tarefaId === dependeDeId) return true;

  // Busca todas as deps da obra (apenas ids para performance)
  const tarefa = await tx.obraTarefa.findUnique({
    where: { id: tarefaId },
    select: { obraId: true },
  });
  if (!tarefa) return false;

  const todas = await tx.tarefaDependencia.findMany({
    where: { tarefa: { obraId: tarefa.obraId } },
    select: { tarefaId: true, dependeDeId: true },
  });

  // Adicionamos temporariamente a nova dep e verificamos alcance
  // de `tarefaId` saindo de `dependeDeId`.
  const adjacencias = new Map<string, string[]>();
  for (const d of todas) {
    const arr = adjacencias.get(d.dependeDeId) ?? [];
    arr.push(d.tarefaId);
    adjacencias.set(d.dependeDeId, arr);
  }
  const arr = adjacencias.get(dependeDeId) ?? [];
  arr.push(tarefaId);
  adjacencias.set(dependeDeId, arr);

  // BFS de `tarefaId` até encontrar `dependeDeId` → ciclo
  const visitados = new Set<string>();
  const fila: string[] = [tarefaId];
  while (fila.length > 0) {
    const atual = fila.shift()!;
    if (atual === dependeDeId) return true;
    if (visitados.has(atual)) continue;
    visitados.add(atual);
    for (const prox of adjacencias.get(atual) ?? []) {
      fila.push(prox);
    }
  }

  return false;
}

"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ChevronLeft,
  Pencil,
  Plus,
  Trash2,
  CalendarRange,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  TarefaDialog,
  TarefaInput,
  emptyTarefa,
  tarefaFromApi,
} from "@/components/obras/tarefa-dialog";
import { ObraGantt } from "@/components/obras/obra-gantt";

interface TarefaApi {
  id: string;
  nome: string;
  descricao: string | null;
  responsavel: string | null;
  status: string;
  dataInicioPlan: string;
  dataFimPlan: string;
  dataInicioReal: string | null;
  dataFimReal: string | null;
  duracaoDias: number;
  progresso: number;
  cor: string | null;
  dependencias: {
    id: string;
    tipo: string;
    lagDias: number;
    dependeDe: { id: string; nome: string };
  }[];
}

interface ObraApi {
  id: string;
  nome: string;
  descricao: string | null;
  cliente: string | null;
  responsavel: string | null;
  local: string | null;
  status: string;
  dataInicioPrevista: string | null;
  dataFimPrevista: string | null;
  progresso: number;
  observacoes: string | null;
  tarefas: TarefaApi[];
}

const OBRA_STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  PLANEJAMENTO: { label: "Planejamento", variant: "outline" },
  EM_EXECUCAO: { label: "Em execução", variant: "default" },
  PAUSADA: { label: "Pausada", variant: "secondary" },
  CONCLUIDA: { label: "Concluída", variant: "secondary" },
  CANCELADA: { label: "Cancelada", variant: "destructive" },
};

const TAREFA_STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  NAO_INICIADA: { label: "Não iniciada", variant: "outline" },
  EM_EXECUCAO: { label: "Em execução", variant: "default" },
  PAUSADA: { label: "Pausada", variant: "secondary" },
  CONCLUIDA: { label: "Concluída", variant: "secondary" },
  ATRASADA: { label: "Atrasada", variant: "destructive" },
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

export default function ObraDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [obra, setObra] = useState<ObraApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogInitial, setDialogInitial] = useState<TarefaInput>(emptyTarefa());
  const [editingTarefaId, setEditingTarefaId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/obras/${id}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Obra não encontrada");
        return res.json();
      })
      .then(setObra)
      .catch(() => toast.error("Erro ao carregar obra"))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  function openNova() {
    setDialogInitial(emptyTarefa());
    setEditingTarefaId(null);
    setDialogOpen(true);
  }

  function openEditar(tarefa: TarefaApi) {
    setDialogInitial(tarefaFromApi(tarefa));
    setEditingTarefaId(tarefa.id);
    setDialogOpen(true);
  }

  async function deletarTarefa(tarefaId: string) {
    if (!confirm("Excluir esta tarefa?")) return;
    const res = await fetch(`/api/tarefas/${tarefaId}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Erro ao excluir tarefa");
      return;
    }
    toast.success("Tarefa excluída");
    load();
  }

  if (loading && !obra) {
    return (
      <div className="space-y-6 p-6">
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Carregando…
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!obra) {
    return (
      <div className="space-y-6 p-6">
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Obra não encontrada.
          </CardContent>
        </Card>
      </div>
    );
  }

  const statusInfo = OBRA_STATUS_LABEL[obra.status] ?? { label: obra.status, variant: "outline" as const };

  return (
    <div className="space-y-6 p-6">
      <div>
        <Link
          href="/admin/obra/cronograma"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Voltar para cronograma
        </Link>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 text-white">
            <CalendarRange className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{obra.nome}</h1>
              <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {[obra.cliente, obra.responsavel, obra.local].filter(Boolean).join(" · ") || "—"}
            </p>
          </div>
        </div>
        <Link
          href={`/admin/obra/cronograma/${obra.id}/editar`}
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          <Pencil className="mr-2 h-4 w-4" />
          Editar obra
        </Link>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Resumo</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div>
            <div className="text-xs text-muted-foreground">Início previsto</div>
            <div className="text-sm">{formatDate(obra.dataInicioPrevista)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Fim previsto</div>
            <div className="text-sm">{formatDate(obra.dataFimPrevista)}</div>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>Progresso</span>
              <span>{Math.round(obra.progresso)}%</span>
            </div>
            <Progress value={obra.progresso} />
          </div>
          {obra.descricao && (
            <div className="md:col-span-3">
              <div className="text-xs text-muted-foreground">Descrição</div>
              <div className="text-sm">{obra.descricao}</div>
            </div>
          )}
          {obra.observacoes && (
            <div className="md:col-span-3">
              <div className="text-xs text-muted-foreground">Observações</div>
              <div className="text-sm whitespace-pre-wrap">{obra.observacoes}</div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Gantt</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <ObraGantt tarefas={obra.tarefas} onChanged={load} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tarefas</CardTitle>
          <CardAction>
            <Button size="sm" onClick={openNova}>
              <Plus className="mr-2 h-4 w-4" />
              Nova tarefa
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {obra.tarefas.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Nenhuma tarefa ainda. Clique em &quot;Nova tarefa&quot; para adicionar a primeira.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tarefa</TableHead>
                  <TableHead>Início plan.</TableHead>
                  <TableHead>Fim plan.</TableHead>
                  <TableHead className="text-center">Dur. (d)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[140px]">Progresso</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {obra.tarefas.map((t) => {
                  const tInfo = TAREFA_STATUS_LABEL[t.status] ?? { label: t.status, variant: "outline" as const };
                  return (
                    <TableRow key={t.id}>
                      <TableCell>
                        <div className="font-medium">{t.nome}</div>
                        {t.responsavel && (
                          <div className="text-xs text-muted-foreground">{t.responsavel}</div>
                        )}
                        {t.dependencias.length > 0 && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            Depende de: {t.dependencias.map((d) => d.dependeDe.nome).join(", ")}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{formatDate(t.dataInicioPlan)}</TableCell>
                      <TableCell className="text-sm">{formatDate(t.dataFimPlan)}</TableCell>
                      <TableCell className="text-center text-sm">{t.duracaoDias}</TableCell>
                      <TableCell>
                        <Badge variant={tInfo.variant}>{tInfo.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={t.progresso} className="flex-1" />
                          <span className="text-xs text-muted-foreground">{Math.round(t.progresso)}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => openEditar(t)} aria-label="Editar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deletarTarefa(t.id)}
                          aria-label="Excluir"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <TarefaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        obraId={obra.id}
        initial={dialogInitial}
        currentDependencias={
          editingTarefaId
            ? obra.tarefas.find((t) => t.id === editingTarefaId)?.dependencias ?? []
            : []
        }
        siblingTarefas={obra.tarefas
          .filter((t) => t.id !== editingTarefaId)
          .map((t) => ({ id: t.id, nome: t.nome }))}
        onSaved={load}
      />
    </div>
  );
}

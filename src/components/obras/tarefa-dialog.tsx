"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Trash2, Plus } from "lucide-react";

export const TAREFA_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "NAO_INICIADA", label: "Não iniciada" },
  { value: "EM_EXECUCAO", label: "Em execução" },
  { value: "PAUSADA", label: "Pausada" },
  { value: "CONCLUIDA", label: "Concluída" },
  { value: "ATRASADA", label: "Atrasada" },
];

export const DEP_TIPO_OPTIONS: { value: string; label: string; desc: string }[] = [
  { value: "FS", label: "FS", desc: "Termina → Inicia (padrão)" },
  { value: "SS", label: "SS", desc: "Iniciam juntas" },
  { value: "FF", label: "FF", desc: "Terminam juntas" },
  { value: "SF", label: "SF", desc: "Início → Termina" },
];

export interface TarefaInput {
  id?: string;
  nome: string;
  descricao: string;
  responsavel: string;
  status: string;
  dataInicioPlan: string;
  dataFimPlan: string;
  dataInicioReal: string;
  dataFimReal: string;
  progresso: number;
}

export interface TarefaDependenciaView {
  id: string;
  tipo: string;
  lagDias: number;
  dependeDe: { id: string; nome: string };
}

export interface TarefaSibling {
  id: string;
  nome: string;
}

export function emptyTarefa(): TarefaInput {
  return {
    nome: "",
    descricao: "",
    responsavel: "",
    status: "NAO_INICIADA",
    dataInicioPlan: "",
    dataFimPlan: "",
    dataInicioReal: "",
    dataFimReal: "",
    progresso: 0,
  };
}

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}

export function tarefaFromApi(t: {
  id?: string;
  nome?: string;
  descricao?: string | null;
  responsavel?: string | null;
  status?: string;
  dataInicioPlan?: string | null;
  dataFimPlan?: string | null;
  dataInicioReal?: string | null;
  dataFimReal?: string | null;
  progresso?: number;
}): TarefaInput {
  return {
    id: t.id,
    nome: t.nome ?? "",
    descricao: t.descricao ?? "",
    responsavel: t.responsavel ?? "",
    status: t.status ?? "NAO_INICIADA",
    dataInicioPlan: toDateInput(t.dataInicioPlan),
    dataFimPlan: toDateInput(t.dataFimPlan),
    dataInicioReal: toDateInput(t.dataInicioReal),
    dataFimReal: toDateInput(t.dataFimReal),
    progresso: t.progresso ?? 0,
  };
}

interface TarefaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  obraId: string;
  initial: TarefaInput;
  currentDependencias?: TarefaDependenciaView[];
  siblingTarefas?: TarefaSibling[];
  onSaved: () => void;
}

export function TarefaDialog({
  open,
  onOpenChange,
  obraId,
  initial,
  currentDependencias = [],
  siblingTarefas = [],
  onSaved,
}: TarefaDialogProps) {
  const [values, setValues] = useState<TarefaInput>(initial);
  const [submitting, setSubmitting] = useState(false);

  // Dependency-add form state
  const [depPredecessorId, setDepPredecessorId] = useState("");
  const [depTipo, setDepTipo] = useState("FS");
  const [depLag, setDepLag] = useState(0);
  const [addingDep, setAddingDep] = useState(false);

  useEffect(() => {
    if (open) {
      setValues(initial);
      setDepPredecessorId("");
      setDepTipo("FS");
      setDepLag(0);
    }
  }, [open, initial]);

  function update<K extends keyof TarefaInput>(key: K, value: TarefaInput[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  const isEdit = Boolean(values.id);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!values.nome.trim()) {
      toast.error("Informe o nome da tarefa");
      return;
    }
    if (!values.dataInicioPlan || !values.dataFimPlan) {
      toast.error("Informe as datas planejadas");
      return;
    }
    if (values.dataFimPlan < values.dataInicioPlan) {
      toast.error("Data fim não pode ser anterior à data início");
      return;
    }

    const payload = {
      nome: values.nome.trim(),
      descricao: values.descricao.trim() || null,
      responsavel: values.responsavel.trim() || null,
      status: values.status,
      dataInicioPlan: values.dataInicioPlan,
      dataFimPlan: values.dataFimPlan,
      dataInicioReal: values.dataInicioReal || null,
      dataFimReal: values.dataFimReal || null,
      progresso: Number(values.progresso) || 0,
    };

    setSubmitting(true);
    try {
      const url = isEdit ? `/api/tarefas/${values.id}` : `/api/obras/${obraId}/tarefas`;
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Erro ao salvar" }));
        toast.error(err.error || "Erro ao salvar tarefa");
        return;
      }
      toast.success(isEdit ? "Tarefa atualizada" : "Tarefa criada");
      onOpenChange(false);
      onSaved();
    } catch {
      toast.error("Erro de rede ao salvar tarefa");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAddDependencia() {
    if (!values.id) return;
    if (!depPredecessorId) {
      toast.error("Selecione uma tarefa predecessora");
      return;
    }
    setAddingDep(true);
    try {
      const res = await fetch(`/api/tarefas/${values.id}/dependencias`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dependeDeId: depPredecessorId,
          tipo: depTipo,
          lagDias: Number(depLag) || 0,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Erro ao adicionar dependência" }));
        toast.error(err.error || "Erro ao adicionar dependência");
        return;
      }
      toast.success("Dependência adicionada");
      setDepPredecessorId("");
      setDepTipo("FS");
      setDepLag(0);
      onSaved();
    } catch {
      toast.error("Erro de rede ao adicionar dependência");
    } finally {
      setAddingDep(false);
    }
  }

  async function handleRemoveDependencia(depId: string) {
    if (!confirm("Remover esta dependência?")) return;
    try {
      const res = await fetch(`/api/dependencias/${depId}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Erro ao remover dependência");
        return;
      }
      toast.success("Dependência removida");
      onSaved();
    } catch {
      toast.error("Erro de rede");
    }
  }

  const availablePredecessors = siblingTarefas.filter(
    (s) =>
      s.id !== values.id &&
      !currentDependencias.some((d) => d.dependeDe.id === s.id)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar tarefa" : "Nova tarefa"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="t-nome">Nome *</Label>
              <Input
                id="t-nome"
                value={values.nome}
                onChange={(e) => update("nome", e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="t-inicio">Início planejado *</Label>
              <Input
                id="t-inicio"
                type="date"
                value={values.dataInicioPlan}
                onChange={(e) => update("dataInicioPlan", e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="t-fim">Fim planejado *</Label>
              <Input
                id="t-fim"
                type="date"
                value={values.dataFimPlan}
                onChange={(e) => update("dataFimPlan", e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="t-inicio-real">Início real</Label>
              <Input
                id="t-inicio-real"
                type="date"
                value={values.dataInicioReal}
                onChange={(e) => update("dataInicioReal", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="t-fim-real">Fim real</Label>
              <Input
                id="t-fim-real"
                type="date"
                value={values.dataFimReal}
                onChange={(e) => update("dataFimReal", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="t-status">Status</Label>
              <Select
                value={values.status}
                onValueChange={(v) => update("status", v ?? "NAO_INICIADA")}
              >
                <SelectTrigger id="t-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TAREFA_STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="t-progresso">Progresso (%)</Label>
              <Input
                id="t-progresso"
                type="number"
                min={0}
                max={100}
                step={1}
                value={values.progresso}
                onChange={(e) => update("progresso", Number(e.target.value))}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="t-responsavel">Responsável</Label>
              <Input
                id="t-responsavel"
                value={values.responsavel}
                onChange={(e) => update("responsavel", e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="t-descricao">Descrição</Label>
              <Textarea
                id="t-descricao"
                rows={2}
                value={values.descricao}
                onChange={(e) => update("descricao", e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Salvando…" : isEdit ? "Salvar" : "Adicionar"}
            </Button>
          </DialogFooter>
        </form>

        {isEdit && (
          <>
            <Separator className="my-4" />
            <div className="space-y-3">
              <div>
                <h4 className="font-medium">Dependências</h4>
                <p className="text-xs text-muted-foreground">
                  Tarefas que precisam ocorrer antes desta. Ao alterar, as datas são recalculadas em cascata.
                </p>
              </div>

              {currentDependencias.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma dependência.</p>
              ) : (
                <ul className="space-y-2">
                  {currentDependencias.map((d) => (
                    <li
                      key={d.id}
                      className="flex items-center justify-between rounded-md border p-2 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{d.tipo}</Badge>
                        <span className="font-medium">{d.dependeDe.nome}</span>
                        {d.lagDias !== 0 && (
                          <span className="text-xs text-muted-foreground">
                            {d.lagDias > 0 ? `+${d.lagDias}d` : `${d.lagDias}d`}
                          </span>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveDependencia(d.id)}
                        aria-label="Remover dependência"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}

              {availablePredecessors.length > 0 ? (
                <div className="rounded-md border p-3">
                  <div className="mb-2 text-xs font-medium text-muted-foreground">
                    Adicionar dependência
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
                    <Select
                      value={depPredecessorId}
                      onValueChange={(v) => setDepPredecessorId(v ?? "")}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Tarefa predecessora…" />
                      </SelectTrigger>
                      <SelectContent>
                        {availablePredecessors.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={depTipo} onValueChange={(v) => setDepTipo(v ?? "FS")}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DEP_TIPO_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label} · {opt.desc}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      placeholder="Lag (d)"
                      className="w-24"
                      value={depLag}
                      onChange={(e) => setDepLag(Number(e.target.value))}
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleAddDependencia}
                      disabled={addingDep || !depPredecessorId}
                    >
                      <Plus className="mr-1 h-4 w-4" />
                      Adicionar
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {siblingTarefas.length === 0
                    ? "Cadastre outras tarefas na obra para poder criar dependências."
                    : "Não há outras tarefas disponíveis para adicionar como predecessora."}
                </p>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

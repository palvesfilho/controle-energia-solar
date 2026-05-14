"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Users,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Settings2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Label } from "@/components/ui/label";
import { isValidPhone } from "@/lib/phone";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Equipe {
  id: string;
  nome: string;
  telefoneResponsavel: string | null;
  cor: string | null;
  active: boolean;
}

type FormState = {
  nome: string;
  telefoneResponsavel: string;
  cor: string;
  active: boolean;
};

const CORES_SUGERIDAS = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#14b8a6", // teal
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#64748b", // slate
  "#78350f", // brown
];

function emptyForm(): FormState {
  return { nome: "", telefoneResponsavel: "", cor: "", active: true };
}

function toForm(e: Equipe): FormState {
  return {
    nome: e.nome,
    telefoneResponsavel: e.telefoneResponsavel ?? "",
    cor: e.cor ?? "",
    active: e.active,
  };
}

const API_BASE = "/api/admin/personalizacoes/equipes";

export default function PersonalizacoesEquipesPage() {
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(API_BASE, { cache: "no-store" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Falha ao carregar");
      }
      const data: Equipe[] = await res.json();
      setEquipes(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setDialogOpen(true);
  }

  function openEdit(e: Equipe) {
    setEditingId(e.id);
    setForm(toForm(e));
    setDialogOpen(true);
  }

  async function save() {
    if (!form.nome.trim()) {
      toast.error("Informe o nome da equipe");
      return;
    }
    if (form.telefoneResponsavel && !isValidPhone(form.telefoneResponsavel)) {
      toast.error("Telefone do responsável inválido. Use (XX)XXXXX-XXXX");
      return;
    }
    setSaving(true);
    try {
      const url = editingId ? `${API_BASE}/${editingId}` : API_BASE;
      const res = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: form.nome,
          telefoneResponsavel: form.telefoneResponsavel || null,
          cor: form.cor || null,
          active: form.active,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Falha ao salvar");
      toast.success(editingId ? "Equipe atualizada" : "Equipe criada");
      setDialogOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function remove(e: Equipe) {
    if (!confirm(`Excluir a equipe "${e.nome}"?`)) return;
    try {
      const res = await fetch(`${API_BASE}/${e.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Falha ao excluir");
      }
      toast.success("Equipe excluída");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir");
    }
  }

  async function toggleActive(e: Equipe) {
    try {
      const res = await fetch(`${API_BASE}/${e.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !e.active }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Falha ao atualizar");
      }
      toast.success(
        !e.active ? "Equipe reativada" : "Equipe marcada como inativa"
      );
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar");
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-slate-600 to-slate-800 text-white">
            <Settings2 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">
              Personalizações · Equipes de Execução
            </h1>
            <p className="text-sm text-muted-foreground">
              Cadastro das equipes de instalação/execução usadas na programação
              de obras.
            </p>
          </div>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Nova equipe
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-amber-600" />
            Equipes cadastradas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : equipes.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma equipe cadastrada. Clique em <b>Nova equipe</b> para
              começar.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome da equipe</TableHead>
                    <TableHead>Cor</TableHead>
                    <TableHead>Telefone do responsável</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {equipes.map((e) => (
                    <TableRow
                      key={e.id}
                      className={!e.active ? "opacity-60" : undefined}
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {e.cor && (
                            <span
                              className="inline-block h-3 w-3 rounded-full border border-border"
                              style={{ backgroundColor: e.cor }}
                              aria-hidden
                            />
                          )}
                          {e.nome}
                        </div>
                      </TableCell>
                      <TableCell>
                        {e.cor ? (
                          <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                            <span
                              className="inline-block h-4 w-8 rounded border border-border"
                              style={{ backgroundColor: e.cor }}
                            />
                            {e.cor}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>{e.telefoneResponsavel || "—"}</TableCell>
                      <TableCell>
                        <button
                          onClick={() => toggleActive(e)}
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            e.active
                              ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          }`}
                          title="Alternar ativo/inativo"
                        >
                          {e.active ? (
                            <>
                              <CheckCircle2 className="h-3.5 w-3.5" /> Ativa
                            </>
                          ) : (
                            <>
                              <XCircle className="h-3.5 w-3.5" /> Inativa
                            </>
                          )}
                        </button>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => openEdit(e)}
                            title="Editar"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => remove(e)}
                            title="Excluir"
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Editar equipe" : "Nova equipe de execução"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Nome da equipe *</Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Ex.: Equipe A - João"
                autoFocus
              />
            </div>

            <div className="space-y-1">
              <Label>Telefone do responsável</Label>
              <PhoneInput
                value={form.telefoneResponsavel}
                onChange={(e) =>
                  setForm({ ...form, telefoneResponsavel: e.target.value })
                }
              />
            </div>

            <div className="space-y-1">
              <Label>Cor da equipe</Label>
              <p className="text-xs text-muted-foreground">
                Usada para identificar a equipe no cronograma de obras.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {CORES_SUGERIDAS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm({ ...form, cor: c })}
                    title={c}
                    aria-label={`Cor ${c}`}
                    className={`h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 ${
                      form.cor.toLowerCase() === c
                        ? "border-foreground ring-2 ring-ring ring-offset-2 ring-offset-background"
                        : "border-border"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <input
                  type="color"
                  value={form.cor || "#000000"}
                  onChange={(e) =>
                    setForm({ ...form, cor: e.target.value.toLowerCase() })
                  }
                  className="h-7 w-10 cursor-pointer rounded border border-border bg-background p-0.5"
                  title="Escolher cor personalizada"
                />
                {form.cor && (
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, cor: "" })}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Limpar
                  </button>
                )}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) =>
                  setForm({ ...form, active: e.target.checked })
                }
                className="h-4 w-4 rounded border-slate-300"
              />
              Equipe ativa
            </label>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

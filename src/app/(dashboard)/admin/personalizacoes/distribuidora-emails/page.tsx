"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Mail,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

interface DistribuidoraEmail {
  id: string;
  distribuidora: string;
  emailDestino: string;
  emailRemetente: string;
  emailCc: string | null;
  nomeResponsavel: string | null;
  observacoes: string | null;
  active: boolean;
}

type FormState = {
  distribuidora: string;
  emailDestino: string;
  emailRemetente: string;
  emailCc: string;
  nomeResponsavel: string;
  observacoes: string;
  active: boolean;
};

function emptyForm(): FormState {
  return {
    distribuidora: "",
    emailDestino: "",
    emailRemetente: "",
    emailCc: "",
    nomeResponsavel: "",
    observacoes: "",
    active: true,
  };
}

function toForm(d: DistribuidoraEmail): FormState {
  return {
    distribuidora: d.distribuidora,
    emailDestino: d.emailDestino,
    emailRemetente: d.emailRemetente,
    emailCc: d.emailCc ?? "",
    nomeResponsavel: d.nomeResponsavel ?? "",
    observacoes: d.observacoes ?? "",
    active: d.active,
  };
}

function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function isEmailList(v: string): boolean {
  const parts = v.split(";").map((p) => p.trim()).filter(Boolean);
  return parts.every(isEmail);
}

const API_BASE = "/api/admin/personalizacoes/distribuidora-emails";

const DISTRIBUIDORAS_RS = [
  "RGE Sul",
  "CEEE Equatorial",
  "Copel (RS)",
  "DEMEI",
  "CERTAJA",
  "CERTEL",
  "CERTHIL",
  "CERMISSÕES",
  "CRELUZ",
  "COPREL",
];

export default function DistribuidoraEmailsPage() {
  const [rows, setRows] = useState<DistribuidoraEmail[]>([]);
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
      const data: DistribuidoraEmail[] = await res.json();
      setRows(data);
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

  function openEdit(d: DistribuidoraEmail) {
    setEditingId(d.id);
    setForm(toForm(d));
    setDialogOpen(true);
  }

  async function save() {
    if (!form.distribuidora.trim()) {
      toast.error("Informe o nome da distribuidora");
      return;
    }
    if (!form.emailDestino.trim() || !isEmail(form.emailDestino)) {
      toast.error("Email de destino inválido");
      return;
    }
    if (!form.emailRemetente.trim() || !isEmail(form.emailRemetente)) {
      toast.error("Email do remetente inválido");
      return;
    }
    if (form.emailCc.trim() && !isEmailList(form.emailCc)) {
      toast.error('Email em cópia inválido. Separe múltiplos por ";"');
      return;
    }
    setSaving(true);
    try {
      const url = editingId ? `${API_BASE}/${editingId}` : API_BASE;
      const res = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          distribuidora: form.distribuidora,
          emailDestino: form.emailDestino,
          emailRemetente: form.emailRemetente,
          emailCc: form.emailCc.trim() || null,
          nomeResponsavel: form.nomeResponsavel.trim() || null,
          observacoes: form.observacoes.trim() || null,
          active: form.active,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Falha ao salvar");
      toast.success(editingId ? "Cadastro atualizado" : "Cadastro criado");
      setDialogOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function remove(d: DistribuidoraEmail) {
    if (!confirm(`Excluir o cadastro da distribuidora "${d.distribuidora}"?`)) return;
    try {
      const res = await fetch(`${API_BASE}/${d.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Falha ao excluir");
      }
      toast.success("Cadastro excluído");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir");
    }
  }

  async function toggleActive(d: DistribuidoraEmail) {
    try {
      const res = await fetch(`${API_BASE}/${d.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !d.active }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Falha ao atualizar");
      }
      toast.success(!d.active ? "Cadastro reativado" : "Cadastro inativado");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar");
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-indigo-800 text-white">
            <Mail className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">
              Personalizações · Emails das concessionárias
            </h1>
            <p className="text-sm text-muted-foreground">
              Cadastro de emails (destino, remetente e cópia) usados para enviar
              rateios às concessionárias de energia.
            </p>
          </div>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Novo cadastro
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-indigo-600" />
            Concessionárias cadastradas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : rows.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Nenhum cadastro ainda. Clique em <b>Novo cadastro</b> para começar.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Distribuidora</TableHead>
                    <TableHead>Email de destino</TableHead>
                    <TableHead>Email do remetente</TableHead>
                    <TableHead>Cópia (CC)</TableHead>
                    <TableHead>Responsável</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((d) => (
                    <TableRow
                      key={d.id}
                      className={!d.active ? "opacity-60" : undefined}
                    >
                      <TableCell className="font-medium">
                        {d.distribuidora}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {d.emailDestino}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {d.emailRemetente}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {d.emailCc || "—"}
                      </TableCell>
                      <TableCell>{d.nomeResponsavel || "—"}</TableCell>
                      <TableCell>
                        <button
                          onClick={() => toggleActive(d)}
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            d.active
                              ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          }`}
                          title="Alternar ativo/inativo"
                        >
                          {d.active ? (
                            <>
                              <CheckCircle2 className="h-3.5 w-3.5" /> Ativo
                            </>
                          ) : (
                            <>
                              <XCircle className="h-3.5 w-3.5" /> Inativo
                            </>
                          )}
                        </button>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => openEdit(d)}
                            title="Editar"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => remove(d)}
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
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editingId
                ? "Editar cadastro"
                : "Novo cadastro de emails da concessionária"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Distribuidora *</Label>
              <Input
                list="distribuidoras-rs"
                value={form.distribuidora}
                onChange={(e) =>
                  setForm({ ...form, distribuidora: e.target.value })
                }
                placeholder="Ex.: RGE Sul"
                autoFocus
              />
              <datalist id="distribuidoras-rs">
                {DISTRIBUIDORAS_RS.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Email de destino *</Label>
                <Input
                  type="email"
                  value={form.emailDestino}
                  onChange={(e) =>
                    setForm({ ...form, emailDestino: e.target.value })
                  }
                  placeholder="rateio@concessionaria.com.br"
                />
                <p className="text-xs text-muted-foreground">
                  Email oficial da distribuidora que recebe os rateios.
                </p>
              </div>

              <div className="space-y-1">
                <Label>Email do remetente *</Label>
                <Input
                  type="email"
                  value={form.emailRemetente}
                  onChange={(e) =>
                    setForm({ ...form, emailRemetente: e.target.value })
                  }
                  placeholder="ex.: atendimento@solvesm.eng.br"
                />
                <p className="text-xs text-muted-foreground">
                  Email que sairá como remetente para esta concessionária.
                </p>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Cópia (CC) — separe múltiplos por &quot;;&quot;</Label>
              <Input
                value={form.emailCc}
                onChange={(e) =>
                  setForm({ ...form, emailCc: e.target.value })
                }
                placeholder="engenharia@solvesm.eng.br; admin@solvesm.eng.br"
              />
            </div>

            <div className="space-y-1">
              <Label>Nome do responsável na distribuidora</Label>
              <Input
                value={form.nomeResponsavel}
                onChange={(e) =>
                  setForm({ ...form, nomeResponsavel: e.target.value })
                }
                placeholder="Ex.: Setor de rateios"
              />
            </div>

            <div className="space-y-1">
              <Label>Observações</Label>
              <textarea
                value={form.observacoes}
                onChange={(e) =>
                  setForm({ ...form, observacoes: e.target.value })
                }
                placeholder="Notas internas sobre o envio (ex.: formato do anexo, prazo de resposta)"
                className="min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300"
              />
              Cadastro ativo
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

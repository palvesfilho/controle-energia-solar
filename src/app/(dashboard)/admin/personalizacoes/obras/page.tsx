"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  HardHat,
  Plus,
  Upload,
  Pencil,
  Trash2,
  Loader2,
  Settings2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

interface MaterialPadrao {
  id: string;
  potenciaW: number;
  disjuntorA: number | null;
  caboMm2: number | null;
  cdPosicoes: string | null;
  dpsQtd: number | null;
  barramento: string | null;
  canaleta: string | null;
  caixaPassagem: string | null;
  placaRge: number | null;
  placaPisarModulos: number | null;
  placaGerador: number | null;
  observacoes: string | null;
}

type FormState = {
  potenciaW: string;
  disjuntorA: string;
  caboMm2: string;
  cdPosicoes: string;
  dpsQtd: string;
  barramento: string;
  canaleta: string;
  caixaPassagem: string;
  placaRge: string;
  placaPisarModulos: string;
  placaGerador: string;
  observacoes: string;
};

function emptyForm(): FormState {
  return {
    potenciaW: "",
    disjuntorA: "",
    caboMm2: "",
    cdPosicoes: "",
    dpsQtd: "",
    barramento: "",
    canaleta: "",
    caixaPassagem: "",
    placaRge: "",
    placaPisarModulos: "",
    placaGerador: "",
    observacoes: "",
  };
}

function toForm(item: MaterialPadrao): FormState {
  return {
    potenciaW: String(item.potenciaW ?? ""),
    disjuntorA: item.disjuntorA != null ? String(item.disjuntorA) : "",
    caboMm2: item.caboMm2 != null ? String(item.caboMm2) : "",
    cdPosicoes: item.cdPosicoes ?? "",
    dpsQtd: item.dpsQtd != null ? String(item.dpsQtd) : "",
    barramento: item.barramento ?? "",
    canaleta: item.canaleta ?? "",
    caixaPassagem: item.caixaPassagem ?? "",
    placaRge: item.placaRge != null ? String(item.placaRge) : "",
    placaPisarModulos:
      item.placaPisarModulos != null ? String(item.placaPisarModulos) : "",
    placaGerador: item.placaGerador != null ? String(item.placaGerador) : "",
    observacoes: item.observacoes ?? "",
  };
}

const API_BASE = "/api/admin/personalizacoes/obras-materiais";

function formatCabo(v: number | null): string {
  if (v == null) return "—";
  return Number.isInteger(v) ? String(v) : v.toString().replace(".", ",");
}

function fmt(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

export default function PersonalizacoesObrasPage() {
  const [itens, setItens] = useState<MaterialPadrao[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(API_BASE, { cache: "no-store" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Falha ao carregar");
      }
      const data: MaterialPadrao[] = await res.json();
      setItens(data);
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

  function openEdit(item: MaterialPadrao) {
    setEditingId(item.id);
    setForm(toForm(item));
    setDialogOpen(true);
  }

  async function save() {
    if (!form.potenciaW.trim()) {
      toast.error("Informe a potência (W)");
      return;
    }
    setSaving(true);
    try {
      const url = editingId ? `${API_BASE}/${editingId}` : API_BASE;
      const res = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Falha ao salvar");
      toast.success(editingId ? "Registro atualizado" : "Registro criado");
      setDialogOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: MaterialPadrao) {
    if (!confirm(`Excluir o registro de ${item.potenciaW} W?`)) return;
    try {
      const res = await fetch(`${API_BASE}/${item.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Falha ao excluir");
      }
      toast.success("Registro excluído");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir");
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const replaceAll = confirm(
      "Deseja SUBSTITUIR todos os registros existentes pela planilha?\n\n" +
        "OK = substituir tudo\nCancelar = somente mesclar (upsert por potência)"
    );
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("replaceAll", String(replaceAll));
      const res = await fetch(`${API_BASE}/import`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Falha ao importar");
      toast.success(
        `${data.imported} registros importados${data.replaced ? " (substituição total)" : ""}`
      );
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao importar");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
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
            <h1 className="text-2xl font-bold">Personalizações · Obras</h1>
            <p className="text-sm text-muted-foreground">
              Tabela de padrões de materiais por potência de inversor (disjuntor,
              cabo, CD, DPS, barramento, placas etc.)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={handleFile}
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            {importing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Importar planilha
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Novo padrão
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardHat className="h-5 w-5 text-amber-600" />
            Padrões cadastrados
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : itens.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Nenhum padrão cadastrado. Clique em <b>Novo padrão</b> ou{" "}
              <b>Importar planilha</b> para começar.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Potência (W)</TableHead>
                    <TableHead className="whitespace-nowrap">Disjuntor (A)</TableHead>
                    <TableHead className="whitespace-nowrap">Cabo (mm²)</TableHead>
                    <TableHead className="whitespace-nowrap">CD (Posições)</TableHead>
                    <TableHead className="whitespace-nowrap">DPS 275VCA</TableHead>
                    <TableHead className="whitespace-nowrap">Barramento</TableHead>
                    <TableHead className="whitespace-nowrap">Canaleta</TableHead>
                    <TableHead className="whitespace-nowrap">Caixa de Passagem</TableHead>
                    <TableHead className="whitespace-nowrap">Placa RGE</TableHead>
                    <TableHead className="whitespace-nowrap">Placa Pisar Módulos</TableHead>
                    <TableHead className="whitespace-nowrap">Placa Gerador</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itens.map((it) => (
                    <TableRow key={it.id}>
                      <TableCell className="font-medium">
                        {it.potenciaW.toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell>{fmt(it.disjuntorA)}</TableCell>
                      <TableCell>{formatCabo(it.caboMm2)}</TableCell>
                      <TableCell>{fmt(it.cdPosicoes)}</TableCell>
                      <TableCell>{fmt(it.dpsQtd)}</TableCell>
                      <TableCell>{fmt(it.barramento)}</TableCell>
                      <TableCell>{fmt(it.canaleta)}</TableCell>
                      <TableCell>{fmt(it.caixaPassagem)}</TableCell>
                      <TableCell>{fmt(it.placaRge)}</TableCell>
                      <TableCell>{fmt(it.placaPisarModulos)}</TableCell>
                      <TableCell>{fmt(it.placaGerador)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => openEdit(it)}
                            title="Editar"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => remove(it)}
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Editar padrão" : "Novo padrão de material"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Potência (W) *" value={form.potenciaW} onChange={(v) => setForm({ ...form, potenciaW: v })} type="number" />
            <Field label="Disjuntor (A)" value={form.disjuntorA} onChange={(v) => setForm({ ...form, disjuntorA: v })} type="number" />
            <Field label="Cabo (mm²)" value={form.caboMm2} onChange={(v) => setForm({ ...form, caboMm2: v })} />
            <Field label="CD (Posições)" value={form.cdPosicoes} onChange={(v) => setForm({ ...form, cdPosicoes: v })} />
            <Field label="DPS 275VCA" value={form.dpsQtd} onChange={(v) => setForm({ ...form, dpsQtd: v })} type="number" />
            <Field label="Barramento" value={form.barramento} onChange={(v) => setForm({ ...form, barramento: v })} />
            <Field label="Canaleta" value={form.canaleta} onChange={(v) => setForm({ ...form, canaleta: v })} />
            <Field label="Caixa de Passagem" value={form.caixaPassagem} onChange={(v) => setForm({ ...form, caixaPassagem: v })} />
            <Field label="Placa RGE" value={form.placaRge} onChange={(v) => setForm({ ...form, placaRge: v })} type="number" />
            <Field label="Placa Pisar Módulos" value={form.placaPisarModulos} onChange={(v) => setForm({ ...form, placaPisarModulos: v })} type="number" />
            <Field label="Placa Gerador" value={form.placaGerador} onChange={(v) => setForm({ ...form, placaGerador: v })} type="number" />
          </div>

          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea
              value={form.observacoes}
              onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
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

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

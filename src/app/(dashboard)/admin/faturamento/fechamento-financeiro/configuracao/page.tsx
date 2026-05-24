"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  Percent,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  CheckCircle2,
  XCircle,
  Receipt,
  Settings2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function formatMonthYear(ano: number, mes: number): string {
  return `${MESES[mes - 1]}/${ano}`;
}

function formatBRL(v: number): string {
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

// ============================================================
// Alíquotas de imposto
// ============================================================

interface TaxRate {
  id: string;
  ano: number;
  mes: number;
  percentual: number;
  observacao: string | null;
}

type TaxForm = {
  ano: number;
  mes: number;
  percentual: string;
  observacao: string;
};

function emptyTaxForm(): TaxForm {
  const now = new Date();
  return {
    ano: now.getFullYear(),
    mes: now.getMonth() + 1,
    percentual: "",
    observacao: "",
  };
}

function TaxRatesCard() {
  const [rows, setRows] = useState<TaxRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TaxForm>(emptyTaxForm());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/financeiro/tax-rates", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Falha ao carregar");
      const data: TaxRate[] = await res.json();
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
    setForm(emptyTaxForm());
    setDialogOpen(true);
  }

  function openEdit(t: TaxRate) {
    setEditingId(t.id);
    setForm({
      ano: t.ano,
      mes: t.mes,
      percentual: String(t.percentual),
      observacao: t.observacao ?? "",
    });
    setDialogOpen(true);
  }

  async function save() {
    const pct = Number(form.percentual.replace(",", "."));
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      toast.error("Percentual deve estar entre 0 e 100.");
      return;
    }
    setSaving(true);
    try {
      const url = editingId
        ? `/api/admin/financeiro/tax-rates/${editingId}`
        : "/api/admin/financeiro/tax-rates";
      const res = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ano: form.ano,
          mes: form.mes,
          percentual: pct,
          observacao: form.observacao.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Falha ao salvar");
      toast.success(editingId ? "Alíquota atualizada" : "Alíquota cadastrada");
      setDialogOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function remove(t: TaxRate) {
    if (!confirm(`Excluir alíquota de ${formatMonthYear(t.ano, t.mes)}?`))
      return;
    try {
      const res = await fetch(`/api/admin/financeiro/tax-rates/${t.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Falha ao excluir");
      }
      toast.success("Alíquota excluída");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir");
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <Percent className="h-5 w-5 text-emerald-600" />
            Alíquotas de imposto
          </CardTitle>
          <Button onClick={openCreate} size="sm">
            <Plus className="h-4 w-4" />
            Nova alíquota
          </Button>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Percentual aplicado sobre a receita bruta do mês. A vigência é por mês —
          o cálculo usa a alíquota cuja vigência é a mais recente até o mês de
          referência.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
          </div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma alíquota cadastrada. Clique em <b>Nova alíquota</b> para
            começar.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vigência (mês/ano)</TableHead>
                <TableHead>Percentual</TableHead>
                <TableHead>Observação</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">
                    {formatMonthYear(t.ano, t.mes)}
                  </TableCell>
                  <TableCell>
                    {t.percentual.toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 4,
                    })}
                    %
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {t.observacao || "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openEdit(t)}
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => remove(t)}
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
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Editar alíquota" : "Nova alíquota"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Mês *</Label>
                <select
                  value={form.mes}
                  onChange={(e) =>
                    setForm({ ...form, mes: Number(e.target.value) })
                  }
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {MESES.map((nome, i) => (
                    <option key={i + 1} value={i + 1}>
                      {nome}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Ano *</Label>
                <Input
                  type="number"
                  min={2000}
                  max={2100}
                  value={form.ano}
                  onChange={(e) =>
                    setForm({ ...form, ano: Number(e.target.value) })
                  }
                />
              </div>
            </div>
            <p className="-mt-2 text-xs text-muted-foreground">
              A alíquota vale a partir deste mês até a próxima mudança.
            </p>

            <div className="space-y-1">
              <Label>Percentual sobre receita bruta (%) *</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={form.percentual}
                onChange={(e) =>
                  setForm({ ...form, percentual: e.target.value })
                }
                placeholder="Ex.: 6"
                autoFocus
              />
            </div>

            <div className="space-y-1">
              <Label>Observação</Label>
              <textarea
                value={form.observacao}
                onChange={(e) =>
                  setForm({ ...form, observacao: e.target.value })
                }
                placeholder="Ex.: Simples Nacional anexo III"
                className="min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
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
    </Card>
  );
}

// ============================================================
// Rubricas recorrentes
// ============================================================

interface RecurringCost {
  id: string;
  nome: string;
  categoria: string | null;
  valorPadrao: number;
  ativo: boolean;
  ordem: number;
  observacao: string | null;
}

type RubricaForm = {
  nome: string;
  categoria: string;
  valorPadrao: string;
  ativo: boolean;
  ordem: string;
  observacao: string;
};

function emptyRubricaForm(): RubricaForm {
  return {
    nome: "",
    categoria: "",
    valorPadrao: "",
    ativo: true,
    ordem: "0",
    observacao: "",
  };
}

const CATEGORIA_SUGGESTIONS = [
  "Folha",
  "Software",
  "Infra",
  "Contador",
  "Marketing",
  "Gestão Terceirizada",
  "Outros",
];

function RecurringCostsCard() {
  const [rows, setRows] = useState<RecurringCost[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RubricaForm>(emptyRubricaForm());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/financeiro/recurring-costs", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Falha ao carregar");
      const data: RecurringCost[] = await res.json();
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
    setForm(emptyRubricaForm());
    setDialogOpen(true);
  }

  function openEdit(r: RecurringCost) {
    setEditingId(r.id);
    setForm({
      nome: r.nome,
      categoria: r.categoria ?? "",
      valorPadrao: String(r.valorPadrao),
      ativo: r.ativo,
      ordem: String(r.ordem),
      observacao: r.observacao ?? "",
    });
    setDialogOpen(true);
  }

  async function save() {
    if (!form.nome.trim()) {
      toast.error("Nome da rubrica é obrigatório");
      return;
    }
    const valorPadrao = Number(form.valorPadrao.replace(",", "."));
    if (!Number.isFinite(valorPadrao) || valorPadrao < 0) {
      toast.error("Valor padrão inválido");
      return;
    }
    const ordem = Number(form.ordem);
    if (!Number.isInteger(ordem)) {
      toast.error("Ordem deve ser um número inteiro");
      return;
    }
    setSaving(true);
    try {
      const url = editingId
        ? `/api/admin/financeiro/recurring-costs/${editingId}`
        : "/api/admin/financeiro/recurring-costs";
      const res = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: form.nome.trim(),
          categoria: form.categoria.trim() || null,
          valorPadrao,
          ativo: form.ativo,
          ordem,
          observacao: form.observacao.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Falha ao salvar");
      toast.success(editingId ? "Rubrica atualizada" : "Rubrica cadastrada");
      setDialogOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function remove(r: RecurringCost) {
    if (!confirm(`Excluir a rubrica "${r.nome}"?`)) return;
    try {
      const res = await fetch(
        `/api/admin/financeiro/recurring-costs/${r.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Falha ao excluir");
      }
      toast.success("Rubrica excluída");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir");
    }
  }

  async function toggleActive(r: RecurringCost) {
    try {
      const res = await fetch(
        `/api/admin/financeiro/recurring-costs/${r.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ativo: !r.ativo }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Falha ao atualizar");
      }
      toast.success(!r.ativo ? "Rubrica reativada" : "Rubrica inativada");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar");
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-emerald-600" />
            Rubricas recorrentes (custos fixos)
          </CardTitle>
          <Button onClick={openCreate} size="sm">
            <Plus className="h-4 w-4" />
            Nova rubrica
          </Button>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Custos fixos mensais (Click Sign, contador, gestão terceirizada, etc.). O
          valor padrão é proposto a cada novo mês — o gestor confirma ou edita
          durante o fechamento.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
          </div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma rubrica cadastrada. Clique em <b>Nova rubrica</b> para começar.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Valor padrão</TableHead>
                <TableHead>Ordem</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow
                  key={r.id}
                  className={!r.ativo ? "opacity-60" : undefined}
                >
                  <TableCell className="font-medium">{r.nome}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.categoria || "—"}
                  </TableCell>
                  <TableCell>{formatBRL(r.valorPadrao)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.ordem}
                  </TableCell>
                  <TableCell>
                    <button
                      onClick={() => toggleActive(r)}
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        r.ativo
                          ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                      title="Alternar ativo/inativo"
                    >
                      {r.ativo ? (
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
                        onClick={() => openEdit(r)}
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => remove(r)}
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
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Editar rubrica" : "Nova rubrica"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Nome *</Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Ex.: Click Sign"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Categoria</Label>
                <Input
                  list="categoria-suggestions"
                  value={form.categoria}
                  onChange={(e) =>
                    setForm({ ...form, categoria: e.target.value })
                  }
                  placeholder="Ex.: Software"
                />
                <datalist id="categoria-suggestions">
                  {CATEGORIA_SUGGESTIONS.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>

              <div className="space-y-1">
                <Label>Valor padrão (R$) *</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={form.valorPadrao}
                  onChange={(e) =>
                    setForm({ ...form, valorPadrao: e.target.value })
                  }
                  placeholder="Ex.: 1200"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Ordem de exibição</Label>
                <Input
                  type="number"
                  value={form.ordem}
                  onChange={(e) =>
                    setForm({ ...form, ordem: e.target.value })
                  }
                  placeholder="0"
                />
                <p className="text-xs text-muted-foreground">
                  Menor primeiro.
                </p>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.ativo}
                    onChange={(e) =>
                      setForm({ ...form, ativo: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  Rubrica ativa
                </label>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Observação</Label>
              <textarea
                value={form.observacao}
                onChange={(e) =>
                  setForm({ ...form, observacao: e.target.value })
                }
                placeholder="Notas internas (ex.: contrato termina em X)"
                className="min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
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
    </Card>
  );
}

// ============================================================
// Página
// ============================================================

export default function FechamentoFinanceiroConfigPage() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-600 to-emerald-800 text-white">
            <Settings2 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">
              Configurações · Fechamento Financeiro
            </h1>
            <p className="text-sm text-muted-foreground">
              Alíquotas de imposto e rubricas de custos fixos usadas no DRE
              mensal.
            </p>
          </div>
        </div>
        <Link href="/admin/faturamento/fechamento-financeiro">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
        </Link>
      </div>

      <Tabs defaultValue="aliquotas">
        <TabsList>
          <TabsTrigger value="aliquotas" className="gap-2">
            <Percent className="h-4 w-4" />
            Alíquotas de imposto
          </TabsTrigger>
          <TabsTrigger value="rubricas" className="gap-2">
            <Receipt className="h-4 w-4" />
            Rubricas recorrentes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="aliquotas" className="mt-4">
          <TaxRatesCard />
        </TabsContent>

        <TabsContent value="rubricas" className="mt-4">
          <RecurringCostsCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}

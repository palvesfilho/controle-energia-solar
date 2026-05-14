"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Edit3,
  Loader2,
  Plus,
  Save,
  Search,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  ACAO_REQUERIDA_LABEL,
  ACOES_REQUERIDAS,
  type AcaoRequerida,
} from "@/lib/alertas-usinas";

const FABRICANTES = ["FRONIUS", "SOLAREDGE", "SUNGROW", "HUAWEI"] as const;
type Fabricante = (typeof FABRICANTES)[number];

const FABRICANTE_LABEL: Record<Fabricante, string> = {
  FRONIUS: "Fronius",
  SOLAREDGE: "SolarEdge",
  SUNGROW: "Sungrow",
  HUAWEI: "Huawei",
};

const SEVERIDADES = ["BAIXA", "MEDIA", "ALTA", "CRITICA"] as const;
type Severidade = (typeof SEVERIDADES)[number];

const SEVERIDADE_LABEL: Record<Severidade, string> = {
  BAIXA: "Baixo",
  MEDIA: "Médio",
  ALTA: "Alto",
  CRITICA: "Crítico",
};

const SEVERIDADE_CHIP: Record<Severidade, string> = {
  CRITICA: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  ALTA: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200",
  MEDIA: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  BAIXA: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
};

interface Acao {
  id?: string;
  ordem: number;
  descricao: string;
  acaoRequerida: AcaoRequerida | null;
}

interface Codigo {
  id: string;
  fabricante: Fabricante;
  codigo: string;
  titulo: string;
  descricao: string | null;
  severidadeSugerida: Severidade | null;
  acoes: Acao[];
}

interface Form {
  id: string | null;
  fabricante: Fabricante;
  codigo: string;
  titulo: string;
  descricao: string;
  severidadeSugerida: Severidade | "";
  acoes: Acao[];
}

const FORM_VAZIO: Form = {
  id: null,
  fabricante: "FRONIUS",
  codigo: "",
  titulo: "",
  descricao: "",
  severidadeSugerida: "",
  acoes: [{ ordem: 1, descricao: "", acaoRequerida: null }],
};

export default function CodigosErroInversorPage() {
  const [codigos, setCodigos] = useState<Codigo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [fabricanteFiltro, setFabricanteFiltro] = useState<Fabricante | "TODOS">(
    "TODOS",
  );
  const [expandido, setExpandido] = useState<Set<string>>(new Set());
  const [formAberto, setFormAberto] = useState(false);
  const [form, setForm] = useState<Form>(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);

  const carregar = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/codigos-erro-inversor");
      if (!res.ok) throw new Error("Falha ao carregar");
      const d = (await res.json()) as { codigos: Codigo[] };
      setCodigos(d.codigos);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregar();
  }, []);

  const filtrados = useMemo(() => {
    const buscaNorm = busca.trim().toLowerCase();
    return codigos.filter((c) => {
      if (fabricanteFiltro !== "TODOS" && c.fabricante !== fabricanteFiltro)
        return false;
      if (buscaNorm) {
        const blob = `${c.codigo} ${c.titulo} ${c.descricao ?? ""}`.toLowerCase();
        if (!blob.includes(buscaNorm)) return false;
      }
      return true;
    });
  }, [codigos, busca, fabricanteFiltro]);

  const grupos = useMemo(() => {
    const g: Record<Fabricante, Codigo[]> = {
      FRONIUS: [],
      SOLAREDGE: [],
      SUNGROW: [],
      HUAWEI: [],
    };
    for (const c of filtrados) g[c.fabricante].push(c);
    return g;
  }, [filtrados]);

  const totaisPorFabricante = useMemo(() => {
    const t: Record<Fabricante, number> = {
      FRONIUS: 0,
      SOLAREDGE: 0,
      SUNGROW: 0,
      HUAWEI: 0,
    };
    for (const c of codigos) t[c.fabricante]++;
    return t;
  }, [codigos]);

  const toggleExpand = (id: string) => {
    setExpandido((prev) => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  };

  const novoCodigo = () => {
    setForm({
      ...FORM_VAZIO,
      fabricante: fabricanteFiltro === "TODOS" ? "FRONIUS" : fabricanteFiltro,
    });
    setFormAberto(true);
  };

  const editarCodigo = (c: Codigo) => {
    setForm({
      id: c.id,
      fabricante: c.fabricante,
      codigo: c.codigo,
      titulo: c.titulo,
      descricao: c.descricao ?? "",
      severidadeSugerida: c.severidadeSugerida ?? "",
      acoes:
        c.acoes.length > 0
          ? c.acoes.map((a) => ({
              ordem: a.ordem,
              descricao: a.descricao,
              acaoRequerida: a.acaoRequerida,
            }))
          : [{ ordem: 1, descricao: "", acaoRequerida: null }],
    });
    setFormAberto(true);
  };

  const removerCodigo = async (c: Codigo) => {
    if (
      !confirm(
        `Remover o código "${c.codigo}" (${FABRICANTE_LABEL[c.fabricante]})?`,
      )
    )
      return;
    try {
      const res = await fetch(`/api/admin/codigos-erro-inversor/${c.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Falha ao remover");
      toast.success("Código removido");
      carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao remover");
    }
  };

  const adicionarAcao = () => {
    setForm((p) => {
      const proxima =
        p.acoes.length > 0 ? Math.max(...p.acoes.map((a) => a.ordem)) + 1 : 1;
      return {
        ...p,
        acoes: [
          ...p.acoes,
          { ordem: proxima, descricao: "", acaoRequerida: null },
        ],
      };
    });
  };

  const removerAcao = (idx: number) => {
    setForm((p) => ({
      ...p,
      acoes: p.acoes.filter((_, i) => i !== idx).map((a, i) => ({
        ...a,
        ordem: i + 1,
      })),
    }));
  };

  const moverAcao = (idx: number, dir: -1 | 1) => {
    setForm((p) => {
      const novo = [...p.acoes];
      const target = idx + dir;
      if (target < 0 || target >= novo.length) return p;
      [novo[idx], novo[target]] = [novo[target], novo[idx]];
      return { ...p, acoes: novo.map((a, i) => ({ ...a, ordem: i + 1 })) };
    });
  };

  const salvarForm = async () => {
    if (!form.codigo.trim() || !form.titulo.trim()) {
      toast.error("Preencha código e título");
      return;
    }
    if (form.acoes.some((a) => !a.descricao.trim())) {
      toast.error("Toda ação precisa de descrição");
      return;
    }
    setSalvando(true);
    try {
      const url = form.id
        ? `/api/admin/codigos-erro-inversor/${form.id}`
        : "/api/admin/codigos-erro-inversor";
      const method = form.id ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fabricante: form.fabricante,
          codigo: form.codigo.trim(),
          titulo: form.titulo.trim(),
          descricao: form.descricao.trim() || null,
          severidadeSugerida: form.severidadeSugerida || null,
          acoes: form.acoes.map((a) => ({
            ordem: a.ordem,
            descricao: a.descricao.trim(),
            acaoRequerida: a.acaoRequerida,
          })),
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? "Falha ao salvar");
      }
      toast.success(form.id ? "Código atualizado" : "Código criado");
      setFormAberto(false);
      carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-700 text-white">
            <Wrench className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Códigos de erro do inversor</h1>
            <p className="text-sm text-muted-foreground">
              Base de conhecimento por fabricante. Cada código tem ações
              sugeridas pro time de pós-venda/engenharia executar.
            </p>
          </div>
        </div>
        <Button onClick={novoCodigo}>
          <Plus className="h-4 w-4" />
          Novo código
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {FABRICANTES.map((f) => {
          const ativo = fabricanteFiltro === f;
          return (
            <button
              key={f}
              type="button"
              onClick={() =>
                setFabricanteFiltro((prev) => (prev === f ? "TODOS" : f))
              }
              className={cn(
                "rounded-lg border p-4 text-left transition-all",
                ativo
                  ? "border-primary bg-primary/5"
                  : "bg-card hover:border-primary/40",
              )}
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {FABRICANTE_LABEL[f]}
              </p>
              <p className="mt-1 text-2xl font-bold">{totaisPorFabricante[f]}</p>
              <p className="text-[10px] text-muted-foreground">
                {ativo ? "Filtrando" : "Clique pra filtrar"}
              </p>
            </button>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por código, título ou descrição..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-100">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Carregando...
        </div>
      )}

      {!loading && !error && filtrados.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nenhum código cadastrado{busca ? " com esse filtro" : ""}.
          </CardContent>
        </Card>
      )}

      {!loading &&
        FABRICANTES.map((f) => {
          const itens = grupos[f];
          if (itens.length === 0) return null;
          return (
            <section key={f} className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {FABRICANTE_LABEL[f]}{" "}
                <span className="font-normal">({itens.length})</span>
              </h2>
              <div className="space-y-2">
                {itens.map((c) => (
                  <CodigoRow
                    key={c.id}
                    codigo={c}
                    expandido={expandido.has(c.id)}
                    onToggle={() => toggleExpand(c.id)}
                    onEdit={() => editarCodigo(c)}
                    onRemove={() => removerCodigo(c)}
                  />
                ))}
              </div>
            </section>
          );
        })}

      <Dialog open={formAberto} onOpenChange={setFormAberto}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {form.id ? "Editar código de erro" : "Novo código de erro"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="fabricante">Fabricante</Label>
                <select
                  id="fabricante"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.fabricante}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      fabricante: e.target.value as Fabricante,
                    }))
                  }
                >
                  {FABRICANTES.map((f) => (
                    <option key={f} value={f}>
                      {FABRICANTE_LABEL[f]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="codigo">Código</Label>
                <Input
                  id="codigo"
                  value={form.codigo}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, codigo: e.target.value }))
                  }
                  placeholder="ex.: 103"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="severidade">Severidade sugerida</Label>
                <select
                  id="severidade"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.severidadeSugerida}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      severidadeSugerida: e.target.value as Severidade | "",
                    }))
                  }
                >
                  <option value="">— sem sugestão —</option>
                  {SEVERIDADES.map((s) => (
                    <option key={s} value={s}>
                      {SEVERIDADE_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="titulo">Título</Label>
              <Input
                id="titulo"
                value={form.titulo}
                onChange={(e) =>
                  setForm((p) => ({ ...p, titulo: e.target.value }))
                }
                placeholder="ex.: Subtensão CA — Rede fora da faixa"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="descricao">Descrição (opcional)</Label>
              <Textarea
                id="descricao"
                rows={2}
                value={form.descricao}
                onChange={(e) =>
                  setForm((p) => ({ ...p, descricao: e.target.value }))
                }
                placeholder="Explicação técnica do erro"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Ações sugeridas (em ordem)</Label>
                <Button size="sm" variant="outline" onClick={adicionarAcao}>
                  <Plus className="h-3.5 w-3.5" />
                  Adicionar ação
                </Button>
              </div>

              <div className="space-y-2">
                {form.acoes.map((a, idx) => (
                  <div
                    key={idx}
                    className="rounded-md border bg-card p-3 space-y-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                        {a.ordem}
                      </span>
                      <span className="text-xs font-medium text-muted-foreground">
                        Ação {a.ordem}
                      </span>
                      <div className="ml-auto flex gap-1">
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          onClick={() => moverAcao(idx, -1)}
                          disabled={idx === 0}
                        >
                          <ArrowUp className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          onClick={() => moverAcao(idx, 1)}
                          disabled={idx === form.acoes.length - 1}
                        >
                          <ArrowDown className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          onClick={() => removerAcao(idx)}
                          disabled={form.acoes.length === 1}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <Textarea
                      rows={2}
                      placeholder="O que o time precisa fazer"
                      value={a.descricao}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          acoes: p.acoes.map((x, i) =>
                            i === idx ? { ...x, descricao: e.target.value } : x,
                          ),
                        }))
                      }
                    />
                    <div className="space-y-1">
                      <Label className="text-xs">Etiqueta</Label>
                      <select
                        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                        value={a.acaoRequerida ?? ""}
                        onChange={(e) =>
                          setForm((p) => ({
                            ...p,
                            acoes: p.acoes.map((x, i) =>
                              i === idx
                                ? {
                                    ...x,
                                    acaoRequerida:
                                      (e.target.value || null) as AcaoRequerida | null,
                                  }
                                : x,
                            ),
                          }))
                        }
                      >
                        <option value="">— sem etiqueta —</option>
                        {ACOES_REQUERIDAS.map((ac) => (
                          <option key={ac} value={ac}>
                            {ACAO_REQUERIDA_LABEL[ac]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={salvarForm} disabled={salvando}>
              {salvando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CodigoRow({
  codigo,
  expandido,
  onToggle,
  onEdit,
  onRemove,
}: {
  codigo: Codigo;
  expandido: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggle}
            className="flex flex-1 items-center gap-2 text-left"
          >
            {expandido ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-sm font-bold">
              {codigo.codigo}
            </span>
            <span className="font-medium">{codigo.titulo}</span>
            {codigo.severidadeSugerida && (
              <span
                className={cn(
                  "ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium",
                  SEVERIDADE_CHIP[codigo.severidadeSugerida],
                )}
              >
                {SEVERIDADE_LABEL[codigo.severidadeSugerida]}
              </span>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              {codigo.acoes.length} ação
              {codigo.acoes.length === 1 ? "" : "ões"}
            </span>
          </button>
          <Button size="sm" variant="ghost" onClick={onEdit}>
            <Edit3 className="h-3.5 w-3.5" />
            Editar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onRemove}
            className="text-red-600 hover:text-red-700"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>

        {expandido && (
          <div className="mt-3 space-y-2 border-t pt-3 pl-6">
            {codigo.descricao && (
              <p className="text-sm text-muted-foreground">{codigo.descricao}</p>
            )}
            <ol className="space-y-1.5">
              {codigo.acoes.map((a) => (
                <li key={a.id ?? a.ordem} className="flex gap-2 text-sm">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                    {a.ordem}
                  </span>
                  <div className="flex-1">
                    <p>{a.descricao}</p>
                    {a.acaoRequerida && (
                      <span className="mt-0.5 inline-block rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {ACAO_REQUERIDA_LABEL[a.acaoRequerida]}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

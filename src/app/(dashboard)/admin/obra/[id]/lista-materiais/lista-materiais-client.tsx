"use client";

import { useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  ArrowLeft,
  Download,
  FileDown,
  Loader2,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import {
  LISTA_CATEGORIAS,
  type ListaCategoria,
} from "@/lib/obra-lista-materiais-template";

interface ItemForm {
  id?: string;
  categoria: ListaCategoria;
  descricao: string;
  especificacao: string;
  quantidade: string;
  ordem: number;
}

interface FormValues {
  responsavel: string;
  numeroSerieInversor: string;
  observacoes: string;
  itens: ItemForm[];
}

interface ApiLista {
  id: string;
  obraId: string;
  responsavel: string | null;
  numeroSerieInversor: string | null;
  observacoes: string | null;
  pdfRelativePath: string | null;
  pdfGeradoEm: string | null;
  itens: {
    id: string;
    categoria: string;
    descricao: string;
    especificacao: string | null;
    quantidade: string;
    ordem: number;
  }[];
}

interface ApiObra {
  id: string;
  nome: string;
  cliente: string | null;
  local: string | null;
  responsavel: string | null;
}

// Converte "uploads/lista-materiais/xxx.pdf" para "/api/files/lista-materiais/xxx.pdf"
function pdfHref(relativePath: string): string {
  const stripped = relativePath.replace(/^uploads\//, "");
  return `/api/files/${stripped}`;
}

export default function ListaMateriaisClient({ obraId }: { obraId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [obra, setObra] = useState<ApiObra | null>(null);
  const [pdfRelativePath, setPdfRelativePath] = useState<string | null>(null);
  const [pdfGeradoEm, setPdfGeradoEm] = useState<string | null>(null);

  const form = useForm<FormValues>({
    defaultValues: {
      responsavel: "",
      numeroSerieInversor: "",
      observacoes: "",
      itens: [],
    },
  });
  const { control, register, handleSubmit, reset, watch } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "itens" });

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/admin/obra/${obraId}/lista-materiais`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { lista, obra: o } = (await res.json()) as {
          lista: ApiLista;
          obra: ApiObra;
        };
        setObra(o);
        setPdfRelativePath(lista.pdfRelativePath);
        setPdfGeradoEm(lista.pdfGeradoEm);
        reset({
          responsavel: lista.responsavel ?? o.responsavel ?? "",
          numeroSerieInversor: lista.numeroSerieInversor ?? "",
          observacoes: lista.observacoes ?? "",
          itens: lista.itens.map((it) => ({
            id: it.id,
            categoria: it.categoria as ListaCategoria,
            descricao: it.descricao,
            especificacao: it.especificacao ?? "",
            quantidade: it.quantidade,
            ordem: it.ordem,
          })),
        });
      } catch (e) {
        toast.error("Erro ao carregar lista", {
          description: (e as Error).message,
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [obraId, reset]);

  const itensWatched = watch("itens");
  const grouped = useMemo(() => {
    const byCat = new Map<ListaCategoria, number[]>();
    itensWatched.forEach((it, idx) => {
      const cat = (it.categoria as ListaCategoria) ?? "INVERSOR";
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat)!.push(idx);
    });
    return byCat;
  }, [itensWatched]);

  async function onSave(values: FormValues) {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/obra/${obraId}/lista-materiais`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          responsavel: values.responsavel || null,
          numeroSerieInversor: values.numeroSerieInversor || null,
          observacoes: values.observacoes || null,
          itens: values.itens.map((it, i) => ({
            categoria: it.categoria,
            descricao: it.descricao,
            especificacao: it.especificacao || null,
            quantidade: it.quantidade,
            ordem: i,
          })),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? `HTTP ${res.status}`);
      }
      toast.success("Lista salva");
    } catch (e) {
      toast.error("Erro ao salvar", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function onGenerate() {
    // Salva antes de gerar para garantir que o PDF reflete a UI atual
    await handleSubmit(onSave)();
    setGenerating(true);
    try {
      const res = await fetch(
        `/api/admin/obra/${obraId}/lista-materiais/gerar-pdf`,
        { method: "POST" }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        relativePath: string;
        emitidoEm: string;
      };
      setPdfRelativePath(data.relativePath);
      setPdfGeradoEm(data.emitidoEm);
      toast.success("PDF gerado e salvo no sistema");
      window.open(pdfHref(data.relativePath), "_blank");
    } catch (e) {
      toast.error("Erro ao gerar PDF", { description: (e as Error).message });
    } finally {
      setGenerating(false);
    }
  }

  function addItem(categoria: ListaCategoria) {
    append({
      categoria,
      descricao: "",
      especificacao: "",
      quantidade: "1",
      ordem: itensWatched.length,
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Carregando lista de materiais…
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/obra/gestao-obra"
            className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Link>
          <div>
            <h1 className="text-xl font-bold">Lista de Materiais</h1>
            <p className="text-sm text-muted-foreground">
              Obra: <span className="font-medium">{obra?.nome}</span>
              {obra?.cliente ? ` • Cliente: ${obra.cliente}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {pdfRelativePath ? (
            <a
              href={pdfHref(pdfRelativePath)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm hover:bg-muted"
              title={
                pdfGeradoEm
                  ? `Gerado em ${new Date(pdfGeradoEm).toLocaleString("pt-BR")}`
                  : undefined
              }
            >
              <Download className="h-4 w-4" />
              PDF atual
            </a>
          ) : null}
          <button
            type="submit"
            disabled={saving}
            className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Salvar
          </button>
          <button
            type="button"
            onClick={onGenerate}
            disabled={generating || saving}
            className="inline-flex h-9 items-center gap-1 rounded-md bg-orange-600 px-3 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileDown className="h-4 w-4" />
            )}
            Gerar PDF
          </button>
        </div>
      </div>

      {/* Cabeçalho ------------------------------------------------------- */}
      <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Responsável</span>
            <input
              {...register("responsavel")}
              className="rounded-md border bg-background px-2 py-1.5"
              placeholder="Nome do responsável pela documentação"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Nº Série do Inversor</span>
            <input
              {...register("numeroSerieInversor")}
              className="rounded-md border bg-background px-2 py-1.5"
              placeholder="(opcional)"
            />
          </label>
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Local</span>
            <div className="rounded-md border bg-muted px-2 py-1.5 text-muted-foreground">
              {obra?.local || "—"}
            </div>
          </div>
        </div>
      </div>

      {/* Itens agrupados por categoria ----------------------------------- */}
      {LISTA_CATEGORIAS.map((cat) => {
        const indexes = grouped.get(cat.value) ?? [];
        return (
          <div
            key={cat.value}
            className="rounded-xl bg-card ring-1 ring-foreground/10"
          >
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="text-sm font-semibold">{cat.label}</h2>
              <button
                type="button"
                onClick={() => addItem(cat.value)}
                className="inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs hover:bg-muted"
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar item
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Item</th>
                    <th className="px-3 py-2 text-left font-medium">
                      Especificação
                    </th>
                    <th className="w-32 px-3 py-2 text-left font-medium">
                      Quantidade
                    </th>
                    <th className="w-10 px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {indexes.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-3 py-4 text-center text-xs text-muted-foreground"
                      >
                        Nenhum item nesta categoria.
                      </td>
                    </tr>
                  ) : (
                    indexes.map((idx) => (
                      <tr key={fields[idx]?.id ?? idx} className="border-t">
                        <td className="px-3 py-1.5">
                          <input
                            {...register(`itens.${idx}.descricao` as const)}
                            className="w-full rounded border bg-background px-2 py-1"
                            placeholder="Descrição"
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <input
                            {...register(
                              `itens.${idx}.especificacao` as const
                            )}
                            className="w-full rounded border bg-background px-2 py-1"
                            placeholder="(opcional)"
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <input
                            {...register(`itens.${idx}.quantidade` as const)}
                            className="w-full rounded border bg-background px-2 py-1"
                            placeholder="1"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <button
                            type="button"
                            onClick={() => remove(idx)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-red-50 hover:text-red-600"
                            title="Remover"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {/* Observações ----------------------------------------------------- */}
      <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Observações</span>
          <textarea
            {...register("observacoes")}
            rows={3}
            className="rounded-md border bg-background px-2 py-1.5"
            placeholder="Notas adicionais para a equipe de estoque/obra"
          />
        </label>
      </div>

      <p className="text-xs text-muted-foreground">
        Total de itens: <strong>{itensWatched.length}</strong>
        {pdfGeradoEm
          ? ` • último PDF gerado em ${new Date(pdfGeradoEm).toLocaleString("pt-BR")}`
          : ""}
      </p>
    </form>
  );
}

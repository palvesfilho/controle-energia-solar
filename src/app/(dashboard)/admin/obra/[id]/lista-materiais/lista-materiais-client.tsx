"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Download,
  FileCheck2,
  FileDown,
  ImagePlus,
  Loader2,
  Lock,
  LockOpen,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  LISTA_CATEGORIAS,
  type ListaCategoria,
} from "@/lib/obra-lista-materiais-template";
import { AssinaturaCanvas } from "@/components/obra/assinatura-canvas";

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

type ListaStatus = "RASCUNHO" | "LIBERADA" | "RETIRADA";

interface ApiFoto {
  id: string;
  relativePath: string;
  fileName: string;
}

interface ApiLista {
  id: string;
  obraId: string;
  status: ListaStatus;
  responsavel: string | null;
  numeroSerieInversor: string | null;
  observacoes: string | null;
  pdfRelativePath: string | null;
  pdfGeradoEm: string | null;
  liberadaEm: string | null;
  liberadaPorNome: string | null;
  equipeRetiradaId: string | null;
  retiradoPor: string | null;
  assinaturaEntregouNome: string | null;
  assinaturaEntregouData: string | null;
  assinaturaRetirouNome: string | null;
  assinaturaRetirouData: string | null;
  observacoesSeparacao: string | null;
  retiradaEm: string | null;
  comprovanteRelativePath: string | null;
  itens: {
    id: string;
    categoria: string;
    descricao: string;
    especificacao: string | null;
    quantidade: string;
    ordem: number;
    separado: boolean;
    quantidadeSeparada: string | null;
  }[];
  fotos: ApiFoto[];
}

interface ApiObra {
  id: string;
  nome: string;
  cliente: string | null;
  local: string | null;
  responsavel: string | null;
}

interface ApiEquipe {
  id: string;
  nome: string;
  active: boolean;
}

interface Permissoes {
  editarLista: boolean;
  liberar: boolean;
  separar: boolean;
  reabrir: boolean;
}

interface SepItem {
  separado: boolean;
  quantidadeSeparada: string;
}

interface SeparacaoState {
  equipeRetiradaId: string;
  retiradoPor: string;
  assinaturaEntregouNome: string;
  assinaturaEntregouData: string | null;
  assinaturaRetirouNome: string;
  assinaturaRetirouData: string | null;
  observacoesSeparacao: string;
}

// Converte "uploads/lista-materiais/xxx.pdf" para "/api/files/lista-materiais/xxx.pdf"
function pdfHref(relativePath: string): string {
  const stripped = relativePath.replace(/^uploads\//, "");
  return `/api/files/${stripped}`;
}

const STATUS_LABEL: Record<ListaStatus, string> = {
  RASCUNHO: "Rascunho",
  LIBERADA: "Liberada para o gestor de obras",
  RETIRADA: "Retirada fechada",
};

const STATUS_CLASS: Record<ListaStatus, string> = {
  RASCUNHO: "bg-muted text-muted-foreground",
  LIBERADA: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200",
  RETIRADA: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
};

function fmt(dt: string | null): string {
  return dt ? new Date(dt).toLocaleString("pt-BR") : "—";
}

export default function ListaMateriaisClient({ obraId }: { obraId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [savingSep, setSavingSep] = useState(false);
  const [closing, setClosing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [obra, setObra] = useState<ApiObra | null>(null);
  const [status, setStatus] = useState<ListaStatus>("RASCUNHO");
  const [pdfRelativePath, setPdfRelativePath] = useState<string | null>(null);
  const [pdfGeradoEm, setPdfGeradoEm] = useState<string | null>(null);
  const [liberadaEm, setLiberadaEm] = useState<string | null>(null);
  const [liberadaPorNome, setLiberadaPorNome] = useState<string | null>(null);
  const [retiradaEm, setRetiradaEm] = useState<string | null>(null);
  const [comprovante, setComprovante] = useState<string | null>(null);
  const [equipes, setEquipes] = useState<ApiEquipe[]>([]);
  const [fotos, setFotos] = useState<ApiFoto[]>([]);
  const [permissoes, setPermissoes] = useState<Permissoes>({
    editarLista: false,
    liberar: false,
    separar: false,
    reabrir: false,
  });
  const [sepItens, setSepItens] = useState<Record<string, SepItem>>({});
  const [sep, setSep] = useState<SeparacaoState>({
    equipeRetiradaId: "",
    retiradoPor: "",
    assinaturaEntregouNome: "",
    assinaturaEntregouData: null,
    assinaturaRetirouNome: "",
    assinaturaRetirouData: null,
    observacoesSeparacao: "",
  });
  // Dois inputs de propósito: "capture" abre a câmera direto, mas o navegador
  // devolve UMA foto só e ignora o "multiple" — quem já fotografou tudo antes
  // precisa do caminho da galeria.
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const aplicar = useCallback(
    (data: {
      lista: ApiLista;
      obra: ApiObra;
      equipes: ApiEquipe[];
      permissoes: Permissoes;
    }) => {
      const { lista, obra: o } = data;
      setObra(o);
      setEquipes(data.equipes);
      setPermissoes(data.permissoes);
      setStatus(lista.status);
      setPdfRelativePath(lista.pdfRelativePath);
      setPdfGeradoEm(lista.pdfGeradoEm);
      setLiberadaEm(lista.liberadaEm);
      setLiberadaPorNome(lista.liberadaPorNome);
      setRetiradaEm(lista.retiradaEm);
      setComprovante(lista.comprovanteRelativePath);
      setFotos(lista.fotos ?? []);
      setSep({
        equipeRetiradaId: lista.equipeRetiradaId ?? "",
        retiradoPor: lista.retiradoPor ?? "",
        assinaturaEntregouNome: lista.assinaturaEntregouNome ?? "",
        assinaturaEntregouData: lista.assinaturaEntregouData,
        assinaturaRetirouNome: lista.assinaturaRetirouNome ?? "",
        assinaturaRetirouData: lista.assinaturaRetirouData,
        observacoesSeparacao: lista.observacoesSeparacao ?? "",
      });
      setSepItens(
        Object.fromEntries(
          lista.itens.map((it) => [
            it.id,
            {
              separado: it.separado,
              quantidadeSeparada: it.quantidadeSeparada ?? "",
            },
          ])
        )
      );
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
    },
    [reset]
  );

  const carregar = useCallback(async () => {
    const res = await fetch(`/api/admin/obra/${obraId}/lista-materiais`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    aplicar(await res.json());
  }, [obraId, aplicar]);

  useEffect(() => {
    (async () => {
      try {
        await carregar();
      } catch (e) {
        toast.error("Erro ao carregar lista", {
          description: (e as Error).message,
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [carregar]);

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

  const totalSeparados = useMemo(
    () => Object.values(sepItens).filter((s) => s.separado).length,
    [sepItens]
  );

  const editavel = permissoes.editarLista;
  const separavel = permissoes.separar;
  const mostraSeparacao = status !== "RASCUNHO";

  async function onSave(values: FormValues) {
    if (!editavel) return;
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
            id: it.id,
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
      throw e;
    } finally {
      setSaving(false);
    }
  }

  async function onGerarLista() {
    // Salva antes de liberar para o gestor receber exatamente o que está na tela
    let falhou = false;
    await handleSubmit(onSave)().catch(() => {
      falhou = true;
    });
    if (falhou) return;

    setGenerating(true);
    try {
      const res = await fetch(
        `/api/admin/obra/${obraId}/lista-materiais/liberar`,
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
      await carregar();
      toast.success("Lista liberada para o gestor de obras", {
        description: "PDF gerado e salvo no sistema.",
      });
      window.open(pdfHref(data.relativePath), "_blank");
    } catch (e) {
      toast.error("Erro ao gerar lista", { description: (e as Error).message });
    } finally {
      setGenerating(false);
    }
  }

  function corpoSeparacao() {
    return {
      itens: Object.entries(sepItens).map(([id, s]) => ({
        id,
        separado: s.separado,
        quantidadeSeparada: s.quantidadeSeparada || null,
      })),
      equipeRetiradaId: sep.equipeRetiradaId || null,
      retiradoPor: sep.retiradoPor || null,
      assinaturaEntregouNome: sep.assinaturaEntregouNome || null,
      assinaturaEntregouData: sep.assinaturaEntregouData,
      assinaturaRetirouNome: sep.assinaturaRetirouNome || null,
      assinaturaRetirouData: sep.assinaturaRetirouData,
      observacoesSeparacao: sep.observacoesSeparacao || null,
    };
  }

  async function salvarSeparacao(silencioso = false): Promise<boolean> {
    setSavingSep(true);
    try {
      const res = await fetch(
        `/api/admin/obra/${obraId}/lista-materiais/separacao`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(corpoSeparacao()),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? `HTTP ${res.status}`);
      }
      if (!silencioso) toast.success("Separação salva");
      return true;
    } catch (e) {
      toast.error("Erro ao salvar separação", {
        description: (e as Error).message,
      });
      return false;
    } finally {
      setSavingSep(false);
    }
  }

  async function fecharRetirada() {
    const ok = await salvarSeparacao(true);
    if (!ok) return;
    setClosing(true);
    try {
      const res = await fetch(
        `/api/admin/obra/${obraId}/lista-materiais/retirada`,
        { method: "POST" }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { relativePath: string };
      await carregar();
      toast.success("Retirada fechada", {
        description: "Comprovante assinado gerado e salvo.",
      });
      window.open(pdfHref(data.relativePath), "_blank");
    } catch (e) {
      toast.error("Erro ao fechar retirada", {
        description: (e as Error).message,
      });
    } finally {
      setClosing(false);
    }
  }

  async function reabrirRetirada() {
    setClosing(true);
    try {
      const res = await fetch(
        `/api/admin/obra/${obraId}/lista-materiais/retirada`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? `HTTP ${res.status}`);
      }
      await carregar();
      toast.success("Retirada reaberta", {
        description: "O comprovante anterior foi removido.",
      });
    } catch (e) {
      toast.error("Erro ao reabrir", { description: (e as Error).message });
    } finally {
      setClosing(false);
    }
  }

  async function enviarFotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const fd = new FormData();
      Array.from(files).forEach((f) => fd.append("fotos", f));
      const res = await fetch(
        `/api/admin/obra/${obraId}/lista-materiais/fotos`,
        { method: "POST", body: fd }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { fotos: ApiFoto[] };
      setFotos((prev) => [...prev, ...data.fotos]);
      toast.success(
        data.fotos.length > 1
          ? `${data.fotos.length} fotos anexadas`
          : "Foto anexada"
      );
    } catch (e) {
      toast.error("Erro ao anexar foto", { description: (e as Error).message });
    } finally {
      setUploading(false);
      // Zerar o value permite re-enviar o mesmo arquivo logo em seguida
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  }

  async function removerFoto(fotoId: string) {
    try {
      const res = await fetch(
        `/api/admin/obra/${obraId}/lista-materiais/fotos/${fotoId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? `HTTP ${res.status}`);
      }
      setFotos((prev) => prev.filter((f) => f.id !== fotoId));
    } catch (e) {
      toast.error("Erro ao remover foto", { description: (e as Error).message });
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

  function setSepItem(id: string, patch: Partial<SepItem>) {
    setSepItens((prev) => ({
      ...prev,
      [id]: {
        separado: prev[id]?.separado ?? false,
        quantidadeSeparada: prev[id]?.quantidadeSeparada ?? "",
        ...patch,
      },
    }));
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
    <div className="space-y-4">
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
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold">Lista de Materiais</h1>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[status]}`}
                >
                  {STATUS_LABEL[status]}
                </span>
              </div>
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
                    ? `Gerado em ${fmt(pdfGeradoEm)}`
                    : undefined
                }
              >
                <Download className="h-4 w-4" />
                Lista em PDF
              </a>
            ) : null}
            {comprovante ? (
              <a
                href={pdfHref(comprovante)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center gap-1 rounded-md border border-emerald-300 px-3 text-sm text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950"
              >
                <FileCheck2 className="h-4 w-4" />
                Comprovante
              </a>
            ) : null}
            {editavel && (
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
            )}
            {permissoes.liberar && (
              <button
                type="button"
                onClick={onGerarLista}
                disabled={generating || saving}
                className="inline-flex h-9 items-center gap-1 rounded-md bg-orange-600 px-3 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
                title={
                  status === "RASCUNHO"
                    ? "Gera o PDF e libera a lista para o gestor de obras separar"
                    : "Gera o PDF novamente com as alterações"
                }
              >
                {generating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileDown className="h-4 w-4" />
                )}
                Gerar Lista
              </button>
            )}
            {permissoes.reabrir && (
              <button
                type="button"
                onClick={reabrirRetirada}
                disabled={closing}
                className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm hover:bg-muted disabled:opacity-50"
                title="Reabrir a retirada para corrigir a separação"
              >
                {closing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LockOpen className="h-4 w-4" />
                )}
                Reabrir
              </button>
            )}
          </div>
        </div>

        {/* Faixa de estado do fluxo ---------------------------------------- */}
        {status === "RASCUNHO" ? (
          <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            A lista ainda não foi liberada. Clique em{" "}
            <strong>Gerar Lista</strong> para emitir o PDF e abrir a separação
            para o gestor de obras.
          </p>
        ) : (
          <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            Liberada em {fmt(liberadaEm)}
            {liberadaPorNome ? ` por ${liberadaPorNome}` : ""}
            {status === "RETIRADA"
              ? ` • retirada fechada em ${fmt(retiradaEm)}`
              : ""}
            {" • "}
            {totalSeparados} de {itensWatched.length} itens conferidos
          </p>
        )}

        {!editavel && (
          <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-900">
            <Lock className="h-3.5 w-3.5 shrink-0" />
            {status === "RETIRADA"
              ? "Retirada fechada — a lista está travada. Reabra para editar."
              : "Somente leitura: o que é seu é a coluna de separação e o bloco de retirada abaixo."}
          </p>
        )}

        {/* Cabeçalho ------------------------------------------------------- */}
        <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Responsável</span>
              <input
                {...register("responsavel")}
                disabled={!editavel}
                className="rounded-md border bg-background px-2 py-1.5 disabled:opacity-70"
                placeholder="Nome do responsável pela documentação"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Nº Série do Inversor</span>
              <input
                {...register("numeroSerieInversor")}
                disabled={!editavel}
                className="rounded-md border bg-background px-2 py-1.5 disabled:opacity-70"
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
                {editavel && (
                  <button
                    type="button"
                    onClick={() => addItem(cat.value)}
                    className="inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs hover:bg-muted"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Adicionar item
                  </button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Item</th>
                      <th className="px-3 py-2 text-left font-medium">
                        Especificação
                      </th>
                      <th className="w-28 px-3 py-2 text-left font-medium">
                        Quantidade
                      </th>
                      {mostraSeparacao && (
                        <>
                          <th className="w-28 px-3 py-2 text-left font-medium">
                            Qtd. separada
                          </th>
                          <th className="w-20 px-3 py-2 text-center font-medium">
                            Separado
                          </th>
                        </>
                      )}
                      {editavel && <th className="w-10 px-2 py-2" />}
                    </tr>
                  </thead>
                  <tbody>
                    {indexes.length === 0 ? (
                      <tr>
                        <td
                          colSpan={mostraSeparacao ? 6 : 4}
                          className="px-3 py-4 text-center text-xs text-muted-foreground"
                        >
                          Nenhum item nesta categoria.
                        </td>
                      </tr>
                    ) : (
                      indexes.map((idx) => {
                        const dbId = itensWatched[idx]?.id;
                        const s = dbId ? sepItens[dbId] : undefined;
                        const qtdPedida = itensWatched[idx]?.quantidade ?? "";
                        const divergiu =
                          !!s?.quantidadeSeparada &&
                          s.quantidadeSeparada !== qtdPedida;
                        return (
                          <tr
                            key={fields[idx]?.id ?? idx}
                            className={`border-t ${
                              s?.separado ? "bg-emerald-50/40 dark:bg-emerald-950/20" : ""
                            }`}
                          >
                            <td className="px-3 py-1.5">
                              <input
                                {...register(`itens.${idx}.descricao` as const)}
                                disabled={!editavel}
                                className="w-full rounded border bg-background px-2 py-1 disabled:border-transparent disabled:bg-transparent"
                                placeholder="Descrição"
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <input
                                {...register(
                                  `itens.${idx}.especificacao` as const
                                )}
                                disabled={!editavel}
                                className="w-full rounded border bg-background px-2 py-1 disabled:border-transparent disabled:bg-transparent"
                                placeholder="(opcional)"
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <input
                                {...register(`itens.${idx}.quantidade` as const)}
                                disabled={!editavel}
                                className="w-full rounded border bg-background px-2 py-1 disabled:border-transparent disabled:bg-transparent"
                                placeholder="1"
                              />
                            </td>
                            {mostraSeparacao && (
                              <>
                                <td className="px-3 py-1.5">
                                  {dbId ? (
                                    <input
                                      value={s?.quantidadeSeparada ?? ""}
                                      onChange={(e) =>
                                        setSepItem(dbId, {
                                          quantidadeSeparada: e.target.value,
                                        })
                                      }
                                      disabled={!separavel}
                                      placeholder={qtdPedida}
                                      title={
                                        divergiu
                                          ? `Diferente do pedido (${qtdPedida})`
                                          : undefined
                                      }
                                      className={`w-full rounded border bg-background px-2 py-1 disabled:opacity-70 ${
                                        divergiu
                                          ? "border-amber-400 font-semibold text-amber-700 dark:text-amber-300"
                                          : ""
                                      }`}
                                    />
                                  ) : (
                                    <span className="text-xs text-muted-foreground">
                                      salve a lista
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-1.5 text-center">
                                  {dbId ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setSepItem(dbId, {
                                          separado: !(s?.separado ?? false),
                                        })
                                      }
                                      disabled={!separavel}
                                      title={
                                        s?.separado
                                          ? "Separado — clique para desmarcar"
                                          : "Marcar como separado"
                                      }
                                      className={`inline-flex h-7 w-7 items-center justify-center rounded-md border transition ${
                                        s?.separado
                                          ? "border-emerald-500 bg-emerald-500 text-white"
                                          : "text-muted-foreground hover:bg-muted"
                                      } disabled:opacity-50`}
                                    >
                                      <CheckCircle2 className="h-4 w-4" />
                                    </button>
                                  ) : null}
                                </td>
                              </>
                            )}
                            {editavel && (
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
                            )}
                          </tr>
                        );
                      })
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
              disabled={!editavel}
              className="rounded-md border bg-background px-2 py-1.5 disabled:opacity-70"
              placeholder="Notas adicionais para a equipe de estoque/obra"
            />
          </label>
        </div>
      </form>

      {/* Retirada do material --------------------------------------------- */}
      {mostraSeparacao && (
        <div className="rounded-xl bg-card ring-1 ring-foreground/10">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">Retirada do material</h2>
              <p className="text-xs text-muted-foreground">
                Quem veio buscar, quem retirou, as fotos do que foi separado e as
                assinaturas.
              </p>
            </div>
            {separavel && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => salvarSeparacao()}
                  disabled={savingSep || closing}
                  className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
                >
                  {savingSep ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Salvar separação
                </button>
                <button
                  type="button"
                  onClick={fecharRetirada}
                  disabled={closing || savingSep}
                  className="inline-flex h-9 items-center gap-1 rounded-md bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  title="Grava a retirada e emite o comprovante assinado"
                >
                  {closing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileCheck2 className="h-4 w-4" />
                  )}
                  Fechar retirada
                </button>
              </div>
            )}
          </div>

          <div className="space-y-4 p-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">
                  Empresa / equipe de instalação que retirou
                </span>
                <select
                  value={sep.equipeRetiradaId}
                  onChange={(e) =>
                    setSep((p) => ({ ...p, equipeRetiradaId: e.target.value }))
                  }
                  disabled={!separavel}
                  className="rounded-md border bg-background px-2 py-1.5 disabled:opacity-70"
                >
                  <option value="">Selecione a empresa…</option>
                  {equipes.map((eq) => (
                    <option key={eq.id} value={eq.id}>
                      {eq.nome}
                      {eq.active ? "" : " (inativa)"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">Quem retirou</span>
                <input
                  value={sep.retiradoPor}
                  onChange={(e) =>
                    setSep((p) => ({ ...p, retiradoPor: e.target.value }))
                  }
                  disabled={!separavel}
                  placeholder="Nome de quem levou o material"
                  className="rounded-md border bg-background px-2 py-1.5 disabled:opacity-70"
                />
              </label>
            </div>

            {/* Fotos ------------------------------------------------------ */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Fotos dos materiais separados{" "}
                  {fotos.length > 0 ? `(${fotos.length})` : ""}
                </span>
                {separavel && (
                  <div className="flex gap-2">
                    <input
                      ref={cameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => enviarFotos(e.target.files)}
                      className="hidden"
                    />
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => enviarFotos(e.target.files)}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      disabled={uploading}
                      className="inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs hover:bg-muted disabled:opacity-50"
                      title="Abre a câmera do celular e envia a foto direto"
                    >
                      {uploading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Camera className="h-3.5 w-3.5" />
                      )}
                      Tirar foto
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs hover:bg-muted disabled:opacity-50"
                      title="Escolhe uma ou várias fotos já tiradas"
                    >
                      <ImagePlus className="h-3.5 w-3.5" />
                      Da galeria
                    </button>
                  </div>
                )}
              </div>
              {fotos.length === 0 ? (
                <p className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                  Nenhuma foto anexada.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  {fotos.map((f) => (
                    <div
                      key={f.id}
                      className="group relative aspect-video overflow-hidden rounded-md border"
                    >
                      <a
                        href={pdfHref(f.relativePath)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={pdfHref(f.relativePath)}
                          alt={f.fileName}
                          className="h-full w-full object-cover"
                        />
                      </a>
                      {separavel && (
                        <button
                          type="button"
                          onClick={() => removerFoto(f.id)}
                          className="absolute right-1 top-1 hidden h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white group-hover:flex"
                          title="Remover foto"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Assinaturas ------------------------------------------------ */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <AssinaturaCanvas
                titulo="Quem entregou"
                descricao="Separação / estoque — Rede Brasil Solar"
                nome={sep.assinaturaEntregouNome}
                valor={sep.assinaturaEntregouData}
                disabled={!separavel}
                onChangeNome={(v) =>
                  setSep((p) => ({ ...p, assinaturaEntregouNome: v }))
                }
                onChange={(v) =>
                  setSep((p) => ({ ...p, assinaturaEntregouData: v }))
                }
              />
              <AssinaturaCanvas
                titulo="Quem retirou"
                descricao="Equipe de instalação que veio buscar o material"
                nome={sep.assinaturaRetirouNome}
                valor={sep.assinaturaRetirouData}
                disabled={!separavel}
                onChangeNome={(v) =>
                  setSep((p) => ({ ...p, assinaturaRetirouNome: v }))
                }
                onChange={(v) =>
                  setSep((p) => ({ ...p, assinaturaRetirouData: v }))
                }
              />
            </div>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">
                Observações da separação
              </span>
              <textarea
                value={sep.observacoesSeparacao}
                onChange={(e) =>
                  setSep((p) => ({
                    ...p,
                    observacoesSeparacao: e.target.value,
                  }))
                }
                rows={2}
                disabled={!separavel}
                className="rounded-md border bg-background px-2 py-1.5 disabled:opacity-70"
                placeholder="Faltou material? Trocou por outro? Registre aqui."
              />
            </label>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Total de itens: <strong>{itensWatched.length}</strong>
        {pdfGeradoEm ? ` • última lista gerada em ${fmt(pdfGeradoEm)}` : ""}
      </p>
    </div>
  );
}

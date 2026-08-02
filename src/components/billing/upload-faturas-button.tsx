"use client";

import { useMemo, useRef, useState } from "react";
import {
  Upload,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Copy,
  Filter,
} from "lucide-react";
import { toast } from "sonner";
import { formatCodigoUc } from "@/lib/uc-codigo";

const MESES_LABEL = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

interface UploadResultItem {
  file: string;
  success: boolean;
  error: string | null;
  warning: string | null;
  codigoInstalacao: string | null;
  ucNome: string | null;
  mesRef: number | null;
  anoRef: number | null;
  valorTotal: number | null;
}

/**
 * "queued" e "processing" existem só na tela: o envio é sequencial (um POST por
 * arquivo), então dá pra mostrar a fila inteira desde o começo em vez de a lista
 * ir crescendo do nada.
 */
type LinhaStatus = "queued" | "processing" | "ok" | "error";

interface UploadRow extends UploadResultItem {
  status: LinhaStatus;
}

function linhaVazia(file: string, status: LinhaStatus): UploadRow {
  return {
    file,
    status,
    success: status === "ok",
    error: null,
    warning: null,
    codigoInstalacao: null,
    ucNome: null,
    mesRef: null,
    anoRef: null,
    valorTotal: null,
  };
}

/**
 * Rótulo curto pra coluna STATUS. A mensagem inteira continua visível na linha
 * (ocupa as colunas de UC/Ref, que ficam vazias quando dá erro) e no `title`.
 */
function tagDoErro(error: string | null): string {
  const e = (error ?? "").toLowerCase();
  if (e.includes("não cadastrada") || e.includes("nao cadastrada")) return "UC?";
  if (e.includes("camada de texto") || e.includes("ocr")) return "OCR";
  if (e.includes("duplicad") || e.includes("já existe") || e.includes("ja existe")) return "dup";
  if (e.includes("http") || e.includes("servidor") || e.includes("timeout")) return "servidor";
  return "erro";
}

interface UploadFaturasButtonProps {
  /** Variantes visuais. "primary" = botão principal verde; "outline" = secundário discreto. */
  variant?: "primary" | "outline";
  /** Callback opcional disparado após upload bem-sucedido (ao menos 1 arquivo OK). */
  onUploadComplete?: () => void;
  /** Texto custom no botão (default "Upload fatura(s)"). */
  label?: string;
}

/**
 * Botão "Upload fatura(s)" reutilizável. Abre dialog com drag-and-drop,
 * envia para /api/admin/faturas-energia/upload-manual (mesmo endpoint usado
 * em Faturas → Visão Geral) e mostra o resultado numa tabela, uma linha por
 * arquivo, com progresso ao vivo.
 *
 * ⚠️ O diálogo TEM que ter altura máxima com o miolo rolável e o rodapé preso:
 * com ~30 arquivos a lista passava da altura da viewport e levava o botão
 * "Fechar" pra fora da tela — e como o modal cobria tudo, não sobrava fundo pra
 * clicar e fechar. Ficava sem saída.
 */
export function UploadFaturasButton({
  variant = "primary",
  onUploadComplete,
  label = "Upload fatura(s)",
}: UploadFaturasButtonProps) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [rows, setRows] = useState<UploadRow[] | null>(null);
  const [soErros, setSoErros] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const close = () => {
    setOpen(false);
    setRows(null);
    setSoErros(false);
  };

  async function handleUpload(files: FileList) {
    if (files.length === 0) return;
    const lista = Array.from(files);
    setUploading(true);
    setSoErros(false);
    // Fila inteira na tela desde o inicio — o operador ja ve o tamanho do lote.
    setRows(lista.map((f) => linhaVazia(f.name, "queued")));

    // Envia UM arquivo por request (sequencial). Mandar todos num único POST
    // fazia o pdfjs acumular memória no servidor e derrubar o processo
    // (resposta vazia → "Unexpected end of JSON input"). Um por vez é robusto e
    // ainda dá pra mostrar o progresso arquivo a arquivo.
    for (let i = 0; i < lista.length; i++) {
      const f = lista[i];
      setRows((prev) => {
        if (!prev) return prev;
        const next = [...prev];
        next[i] = { ...next[i], status: "processing" };
        return next;
      });

      let resultado: UploadResultItem[];
      try {
        const fd = new FormData();
        fd.append("files", f);
        const res = await fetch("/api/admin/faturas-energia/upload-manual", {
          method: "POST",
          body: fd,
        });
        const text = await res.text();
        let data: { items?: UploadResultItem[]; ok?: number; error?: string } = {};
        try {
          data = text ? JSON.parse(text) : {};
        } catch {
          // Resposta não-JSON (crash/timeout no servidor) — reporta por arquivo.
          data = {};
        }
        if (!res.ok || (!data.items && !data.error && !text)) {
          resultado = [
            {
              ...linhaVazia(f.name, "error"),
              success: false,
              error:
                data.error ??
                `Falha no servidor (HTTP ${res.status}${!text ? " — resposta vazia" : ""})`,
            },
          ];
        } else if (data.items && data.items.length > 0) {
          resultado = data.items;
        } else {
          resultado = [
            {
              ...linhaVazia(f.name, "error"),
              success: false,
              error: data.error ?? "Resposta inesperada do servidor",
            },
          ];
        }
      } catch (e) {
        resultado = [
          {
            ...linhaVazia(f.name, "error"),
            success: false,
            error: e instanceof Error ? e.message : String(e),
          },
        ];
      }

      const novas: UploadRow[] = resultado.map((r) => ({
        ...r,
        status: r.success ? "ok" : "error",
      }));
      // Um PDF pode devolver mais de um item; troca a linha da fila pelas que
      // vieram, mantendo a ordem do lote.
      setRows((prev) => {
        if (!prev) return prev;
        const next = [...prev];
        next.splice(i, 1, ...novas);
        return next;
      });
    }

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setRows((prev) => {
      if (prev?.some((r) => r.status === "ok")) onUploadComplete?.();
      return prev;
    });
  }

  const onFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleUpload(e.target.files);
    }
  };

  const resumo = useMemo(() => {
    const todas = rows ?? [];
    const ok = todas.filter((r) => r.status === "ok");
    const err = todas.filter((r) => r.status === "error");
    const processadas = ok.length + err.length;
    return {
      ok: ok.length,
      err: err.length,
      avisos: ok.filter((r) => r.warning).length,
      processadas,
      total: todas.length,
      pct: todas.length ? Math.round((processadas / todas.length) * 100) : 0,
    };
  }, [rows]);

  const visiveis = useMemo(
    () => (soErros ? (rows ?? []).filter((r) => r.status === "error") : rows ?? []),
    [rows, soErros],
  );

  async function copiarLista() {
    const linhas = visiveis.map((r) => {
      const ref = r.mesRef && r.anoRef ? `${MESES_LABEL[r.mesRef - 1]}/${r.anoRef}` : "";
      const detalhe = r.status === "error" ? r.error ?? "erro" : r.ucNome ?? "";
      return [r.file, detalhe, ref].join("\t");
    });
    try {
      await navigator.clipboard.writeText(linhas.join("\n"));
      toast.success(
        `${linhas.length} linha(s) copiada(s)${soErros ? " (só erros)" : ""}`,
      );
    } catch {
      toast.error("Não foi possível copiar. Selecione e copie manualmente.");
    }
  }

  const buttonClass =
    variant === "primary"
      ? "inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
      : "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted/50 transition";

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setRows(null);
          setSoErros(false);
        }}
        className={buttonClass}
      >
        <Upload className={variant === "primary" ? "h-4 w-4" : "h-3.5 w-3.5"} />
        {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={uploading ? undefined : close}
        >
          {/* max-h + flex-col: o miolo rola, cabeçalho e rodapé ficam presos. */}
          <div
            className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-background shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ── Cabeçalho (fixo) ─────────────────────────────────────── */}
            <div className="shrink-0 border-b px-6 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-lg font-bold">Upload manual de fatura(s)</h2>
                  {!rows && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Envie um ou mais PDFs de faturas. O sistema identifica a UC e o
                      mês de referência pelo conteúdo da fatura.
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={close}
                  disabled={uploading}
                  className="rounded p-1 text-muted-foreground transition hover:bg-muted disabled:opacity-50"
                  aria-label="Fechar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {rows && rows.length > 0 && (
                <div className="mt-3">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        uploading
                          ? "bg-primary"
                          : resumo.err === 0
                            ? "bg-emerald-500"
                            : resumo.ok === 0
                              ? "bg-red-500"
                              : "bg-amber-500"
                      }`}
                      style={{ width: `${resumo.pct}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {uploading ? (
                      <>
                        {resumo.processadas} de {resumo.total} processados
                      </>
                    ) : (
                      <>
                        <span className="font-medium text-emerald-600 dark:text-emerald-400">
                          {resumo.ok} com sucesso
                        </span>
                        {resumo.err > 0 && (
                          <>
                            {" · "}
                            <span className="font-medium text-red-600 dark:text-red-400">
                              {resumo.err} com erro
                            </span>
                          </>
                        )}
                        {resumo.avisos > 0 && (
                          <>
                            {" · "}
                            <span className="font-medium text-amber-600 dark:text-amber-400">
                              {resumo.avisos} com aviso
                            </span>
                          </>
                        )}
                      </>
                    )}
                  </p>
                </div>
              )}
            </div>

            {/* ── Miolo (rola) ─────────────────────────────────────────── */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              {!rows && (
                <div className="p-6">
                  <label
                    className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-10 text-center transition ${
                      uploading
                        ? "cursor-wait opacity-50"
                        : "border-muted-foreground/30 hover:border-primary hover:bg-muted/30"
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="application/pdf"
                      multiple
                      onChange={onFilesChange}
                      disabled={uploading}
                      className="hidden"
                    />
                    <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
                    <p className="text-sm font-medium">Clique para selecionar PDFs</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      ou arraste aqui (vários arquivos aceitos)
                    </p>
                  </label>
                </div>
              )}

              {rows && rows.length > 0 && (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
                    <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2 font-semibold">Arquivo</th>
                      <th className="px-2 py-2 font-semibold">UC</th>
                      <th className="px-2 py-2 font-semibold">Ref</th>
                      <th className="px-4 py-2 text-right font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiveis.map((r, idx) => {
                      const ref =
                        r.mesRef && r.anoRef
                          ? `${MESES_LABEL[r.mesRef - 1]}/${r.anoRef}`
                          : "—";
                      const pendente = r.status === "queued" || r.status === "processing";
                      return (
                        <tr
                          key={`${r.file}-${idx}`}
                          className={`border-b last:border-0 ${
                            r.status === "error"
                              ? "bg-red-50/60 dark:bg-red-950/20"
                              : pendente
                                ? "opacity-60"
                                : ""
                          }`}
                        >
                          <td className="max-w-[13rem] truncate px-4 py-2 font-mono text-xs" title={r.file}>
                            {r.file}
                          </td>

                          {r.status === "error" ? (
                            // Erro ocupa as colunas de UC e Ref, que ficariam vazias.
                            <td
                              colSpan={2}
                              className="px-2 py-2 text-xs text-red-700 dark:text-red-300"
                              title={r.error ?? undefined}
                            >
                              <span className="line-clamp-2">{r.error}</span>
                            </td>
                          ) : (
                            <>
                              <td className="max-w-[14rem] truncate px-2 py-2 text-xs" title={r.ucNome ?? undefined}>
                                {r.ucNome ? (
                                  <>
                                    <span className="font-medium">{r.ucNome}</span>
                                    {r.codigoInstalacao && (
                                      <span className="ml-1 font-mono text-muted-foreground">
                                        {formatCodigoUc(r.codigoInstalacao)}
                                      </span>
                                    )}
                                  </>
                                ) : r.codigoInstalacao ? (
                                  <span className="font-mono text-muted-foreground">
                                    {formatCodigoUc(r.codigoInstalacao)}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-2 py-2 font-mono text-xs text-muted-foreground">
                                {ref}
                              </td>
                            </>
                          )}

                          <td className="whitespace-nowrap px-4 py-2 text-right">
                            {r.status === "ok" && (
                              <span
                                className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"
                                title={r.warning ?? undefined}
                              >
                                {r.warning && (
                                  <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                                )}
                                <CheckCircle2 className="h-4 w-4" />
                              </span>
                            )}
                            {r.status === "error" && (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
                                <AlertCircle className="h-4 w-4" />
                                {tagDoErro(r.error)}
                              </span>
                            )}
                            {r.status === "processing" && (
                              <Loader2 className="ml-auto h-4 w-4 animate-spin text-primary" />
                            )}
                            {r.status === "queued" && (
                              <span className="text-xs text-muted-foreground">na fila</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {rows && visiveis.length === 0 && (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  Nenhum arquivo com erro.
                </p>
              )}
            </div>

            {/* ── Rodapé (fixo) ────────────────────────────────────────── */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t px-4 py-3">
              <div className="flex flex-wrap gap-2">
                {rows && resumo.err > 0 && (
                  <button
                    type="button"
                    onClick={() => setSoErros((v) => !v)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                      soErros
                        ? "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
                        : "hover:bg-muted"
                    }`}
                  >
                    <Filter className="h-3.5 w-3.5" />
                    {soErros ? `Mostrando só erros (${resumo.err})` : "Só erros"}
                  </button>
                )}
                {rows && rows.length > 0 && (
                  <button
                    type="button"
                    onClick={copiarLista}
                    className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition hover:bg-muted"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copiar lista
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={close}
                disabled={uploading}
                className="rounded-lg border px-4 py-2 text-sm transition hover:bg-muted disabled:opacity-50"
              >
                {uploading ? "Processando..." : "Fechar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

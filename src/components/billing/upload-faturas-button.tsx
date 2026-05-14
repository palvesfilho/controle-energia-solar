"use client";

import { useRef, useState } from "react";
import {
  Upload,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

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
 * em Faturas → Visão Geral) e mostra resultado de cada arquivo.
 */
export function UploadFaturasButton({
  variant = "primary",
  onUploadComplete,
  label = "Upload fatura(s)",
}: UploadFaturasButtonProps) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<UploadResultItem[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const close = () => {
    setOpen(false);
    setResults(null);
  };

  async function handleUpload(files: FileList) {
    if (files.length === 0) return;
    setUploading(true);
    setResults(null);
    try {
      const fd = new FormData();
      for (const f of Array.from(files)) fd.append("files", f);
      const res = await fetch("/api/admin/faturas-energia/upload-manual", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setResults([
          {
            file: "erro geral",
            success: false,
            error: data.error ?? "Falha no upload",
            warning: null,
            codigoInstalacao: null,
            ucNome: null,
            mesRef: null,
            anoRef: null,
            valorTotal: null,
          },
        ]);
      } else {
        setResults(data.items ?? []);
        if ((data.ok ?? 0) > 0) onUploadComplete?.();
      }
    } catch (e) {
      setResults([
        {
          file: "erro",
          success: false,
          error: e instanceof Error ? e.message : String(e),
          warning: null,
          codigoInstalacao: null,
          ucNome: null,
          mesRef: null,
          anoRef: null,
          valorTotal: null,
        },
      ]);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const onFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleUpload(e.target.files);
    }
  };

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
          setResults(null);
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
          <div
            className="w-full max-w-2xl rounded-lg bg-background p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold">Upload manual de fatura(s)</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Envie um ou mais PDFs de faturas RGE/CPFL. O sistema identifica
                  automaticamente a UC e o mês de referência pelo conteúdo da fatura.
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                disabled={uploading}
                className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {!results && (
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
                {uploading ? (
                  <>
                    <Loader2 className="mb-2 h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm font-medium">Processando...</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Extraindo dados e salvando no banco.
                    </p>
                  </>
                ) : (
                  <>
                    <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
                    <p className="text-sm font-medium">Clique para selecionar PDFs</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      ou arraste aqui (vários arquivos aceitos)
                    </p>
                  </>
                )}
              </label>
            )}

            {results && (() => {
              const ok = results.filter((r) => r.success);
              const err = results.filter((r) => !r.success);
              const warns = ok.filter((r) => r.warning);
              const headerText =
                err.length === 0
                  ? results.length === 1
                    ? "Leitura efetuada com sucesso"
                    : "Leituras efetuadas com sucesso"
                  : ok.length === 0
                    ? results.length === 1
                      ? "Leitura com erro"
                      : "Leituras com erro"
                    : `${ok.length} com sucesso, ${err.length} com erro`;
              const headerCls =
                err.length === 0
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900"
                  : ok.length === 0
                    ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900"
                    : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900";
              const HeaderIcon = err.length === 0 ? CheckCircle2 : AlertCircle;
              return (
                <div className="space-y-3">
                  <div
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${headerCls}`}
                  >
                    <HeaderIcon className="h-5 w-5" />
                    {headerText}
                  </div>

                  {ok.length > 0 && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                        Arquivos lidos com sucesso ({ok.length})
                      </p>
                      <ul className="space-y-1.5 text-sm">
                        {ok.map((r, idx) => {
                          const ref =
                            r.mesRef && r.anoRef
                              ? `${MESES_LABEL[r.mesRef - 1]}/${r.anoRef}`
                              : null;
                          return (
                            <li key={idx} className="flex items-start gap-2">
                              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
                              <div className="min-w-0 flex-1">
                                <div className="font-mono text-xs">{r.file}</div>
                                <div className="text-xs text-muted-foreground">
                                  {r.ucNome ? (
                                    <>
                                      <span className="font-medium text-foreground">
                                        {r.ucNome}
                                      </span>
                                      {r.codigoInstalacao && (
                                        <span className="ml-1 font-mono">
                                          ({r.codigoInstalacao})
                                        </span>
                                      )}
                                    </>
                                  ) : r.codigoInstalacao ? (
                                    <span className="font-mono">
                                      Instalação {r.codigoInstalacao} — UC não cadastrada
                                    </span>
                                  ) : null}
                                  {ref && (
                                    <span className="ml-2 inline-flex items-center rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                                      {ref}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  {err.length > 0 && (
                    <div className="rounded-lg border border-red-200 bg-red-50/50 p-3 dark:border-red-900 dark:bg-red-950/30">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">
                        Arquivos com erro ({err.length})
                      </p>
                      <ul className="space-y-1 text-sm">
                        {err.map((r, idx) => {
                          const msg =
                            r.error && r.error.length > 200
                              ? r.error.slice(0, 200) + "…"
                              : r.error;
                          return (
                            <li key={idx} className="flex items-start gap-2">
                              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600 dark:text-red-400" />
                              <div className="min-w-0 flex-1 break-words">
                                <span className="font-mono text-xs">{r.file}</span>
                                {msg && (
                                  <span className="ml-1 text-xs text-red-700 dark:text-red-300">
                                    — {msg}
                                  </span>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  {warns.length > 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-xs dark:border-amber-900 dark:bg-amber-950/30">
                      <p className="mb-1 font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                        Avisos
                      </p>
                      <ul className="space-y-0.5 text-amber-700 dark:text-amber-300">
                        {warns.map((r, idx) => (
                          <li key={idx}>
                            <span className="font-mono">{r.file}</span>: {r.warning}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={close}
                      className="rounded-lg border px-3 py-2 text-sm transition hover:bg-muted"
                    >
                      Fechar
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </>
  );
}

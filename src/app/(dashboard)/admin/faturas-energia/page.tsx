"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, Minus, X, Receipt, Upload, CheckCircle2, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { FaturasEnergiaRow, FaturaCell } from "@/app/api/admin/faturas-energia/route";

const MESES_LABEL = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const selectClass =
  "text-sm border rounded-lg px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all";

function CellIcon({ cell }: { cell: FaturaCell }) {
  if (cell.status === "ok" && cell.pdfUrl) {
    return (
      <a
        href={cell.pdfUrl}
        target="_blank"
        rel="noopener noreferrer"
        title="Baixar fatura"
        className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-emerald-100 text-emerald-700 transition hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60"
      >
        <Download className="h-3.5 w-3.5" />
      </a>
    );
  }
  if (cell.status === "error") {
    return (
      <span
        title="Falha no download da fatura"
        className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
      >
        <X className="h-3.5 w-3.5" />
      </span>
    );
  }
  return (
    <span
      title="Não sincronizado"
      className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-muted text-muted-foreground"
    >
      <Minus className="h-3.5 w-3.5" />
    </span>
  );
}

function OrigemBadge({ origem }: { origem: FaturasEnergiaRow["origem"] }) {
  const map = {
    cliente: { label: "Cliente", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
    usina: { label: "Usina", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  } as const;
  const it = map[origem];
  return <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs ${it.cls}`}>{it.label}</span>;
}

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

export default function FaturasEnergiaVisaoGeralPage() {
  const currentYear = new Date().getFullYear();
  const [ano, setAno] = useState(currentYear);
  const [rows, setRows] = useState<FaturasEnergiaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [origemFilter, setOrigemFilter] = useState<"all" | "cliente" | "usina">("all");
  const [apenasAtivas, setApenasAtivas] = useState(false);

  // Upload manual
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<UploadResultItem[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadRows = () => {
    setLoading(true);
    setError(null);
    fetch(`/api/admin/faturas-energia?ano=${ano}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Falha ao carregar faturas"))))
      .then((data) => setRows(data.rows ?? []))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ano]);

  async function handleUpload(files: FileList) {
    if (files.length === 0) return;
    setUploading(true);
    setUploadResults(null);
    try {
      const fd = new FormData();
      for (const f of Array.from(files)) fd.append("files", f);
      const res = await fetch("/api/admin/faturas-energia/upload-manual", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setUploadResults([{
          file: "erro geral",
          success: false,
          error: data.error ?? "Falha no upload",
          warning: null,
          codigoInstalacao: null, ucNome: null, mesRef: null, anoRef: null, valorTotal: null,
        }]);
      } else {
        setUploadResults(data.items ?? []);
        if ((data.ok ?? 0) > 0) loadRows();
      }
    } catch (e) {
      setUploadResults([{
        file: "erro",
        success: false,
        error: e instanceof Error ? e.message : String(e),
        warning: null,
        codigoInstalacao: null, ucNome: null, mesRef: null, anoRef: null, valorTotal: null,
      }]);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const anos = useMemo(() => {
    const arr: number[] = [];
    for (let y = currentYear + 1; y >= currentYear - 4; y--) arr.push(y);
    return arr;
  }, [currentYear]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (apenasAtivas && !r.active) return false;
      if (origemFilter !== "all" && r.origem !== origemFilter) return false;
      if (!term) return true;
      return (
        r.nome.toLowerCase().includes(term) ||
        r.codigoUc.toLowerCase().includes(term) ||
        r.proprietario.toLowerCase().includes(term) ||
        (r.distribuidora ?? "").toLowerCase().includes(term)
      );
    });
  }, [rows, search, origemFilter, apenasAtivas]);

  const totals = useMemo(() => {
    let ok = 0, err = 0, miss = 0;
    for (const r of filtered) {
      for (let m = 1; m <= 12; m++) {
        const c = r.meses[m];
        if (!c) continue;
        if (c.status === "ok") ok++;
        else if (c.status === "error") err++;
        else miss++;
      }
    }
    return { ok, err, miss };
  }, [filtered]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          <Receipt className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Faturas de Energia — Visão Geral</h1>
          <p className="text-sm text-muted-foreground">
            Todas as unidades consumidoras (clientes e usinas) com os PDFs das faturas por mês.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setUploadOpen(true); setUploadResults(null); }}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
        >
          <Upload className="h-4 w-4" />
          Upload fatura(s)
        </button>
      </div>

      {uploadOpen && (
        <UploadFaturasDialog
          uploading={uploading}
          results={uploadResults}
          fileInputRef={fileInputRef}
          onClose={() => { setUploadOpen(false); setUploadResults(null); }}
          onSubmit={handleUpload}
        />
      )}

      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ano</label>
              <select value={ano} onChange={(e) => setAno(Number(e.target.value))} className={selectClass}>
                {anos.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Origem</label>
              <select
                value={origemFilter}
                onChange={(e) => setOrigemFilter(e.target.value as typeof origemFilter)}
                className={selectClass}
              >
                <option value="all">Todas</option>
                <option value="cliente">Clientes</option>
                <option value="usina">Usinas</option>
              </select>
            </div>
            <div className="space-y-1.5 flex-1 min-w-[220px]">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Buscar</label>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="UC, nome, proprietário, distribuidora..."
                className={`${selectClass} w-full`}
              />
            </div>
            <label className="flex items-center gap-2 text-sm h-9">
              <input
                type="checkbox"
                checked={apenasAtivas}
                onChange={(e) => setApenasAtivas(e.target.checked)}
                className="accent-primary"
              />
              Apenas ativas
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm bg-emerald-500" />
              Disponível ({totals.ok})
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm bg-red-500" />
              Falha no download ({totals.err})
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm bg-muted-foreground/40" />
              Não sincronizado ({totals.miss})
            </div>
            <div className="ml-auto">{filtered.length} UC(s)</div>
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando...
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              {error}
            </div>
          )}

          {!loading && !error && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="sticky left-0 z-10 bg-background px-3 py-2 text-left font-medium text-xs uppercase tracking-wide">UC</th>
                    <th className="px-3 py-2 text-left font-medium text-xs uppercase tracking-wide">Nome</th>
                    <th className="px-3 py-2 text-left font-medium text-xs uppercase tracking-wide">Origem</th>
                    <th className="px-3 py-2 text-left font-medium text-xs uppercase tracking-wide">Distribuidora</th>
                    {MESES_LABEL.map((m) => (
                      <th key={m} className="px-2 py-2 text-center font-medium text-xs uppercase tracking-wide">
                        {m}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.ucId} className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${r.active ? "" : "opacity-60"}`}>
                      <td className="sticky left-0 z-10 bg-background px-3 py-2 font-mono text-xs">{r.codigoUc}</td>
                      <td className="px-3 py-2">{r.nome}</td>
                      <td className="px-3 py-2">
                        <OrigemBadge origem={r.origem} />
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{r.distribuidora ?? "-"}</td>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                        <td key={m} className="px-1 py-1 text-center">
                          <CellIcon cell={r.meses[m]} />
                        </td>
                      ))}
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={16} className="px-3 py-8 text-center text-sm text-muted-foreground">
                        Nenhuma UC encontrada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function UploadFaturasDialog({
  uploading,
  results,
  fileInputRef,
  onClose,
  onSubmit,
}: {
  uploading: boolean;
  results: UploadResultItem[] | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onSubmit: (files: FileList) => void;
}) {
  const onFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onSubmit(e.target.files);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={uploading ? undefined : onClose}
    >
      <div
        className="flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b px-6 pb-4 pt-6">
          <div>
            <h2 className="text-lg font-bold">Upload manual de fatura(s)</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Envie um ou mais PDFs de faturas RGE/CPFL. O sistema identifica automaticamente
              a UC e o mês de referência pelo conteúdo da fatura.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
        {!results && (
          <label className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-10 text-center transition ${uploading ? "cursor-wait opacity-50" : "border-muted-foreground/30 hover:border-primary hover:bg-muted/30"}`}>
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
              <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${headerCls}`}>
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
                      const ref = r.mesRef && r.anoRef ? `${MESES_LABEL[r.mesRef - 1]}/${r.anoRef}` : null;
                      return (
                        <li key={idx} className="flex items-start gap-2">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
                          <div className="min-w-0 flex-1">
                            <div className="font-mono text-xs">{r.file}</div>
                            <div className="text-xs text-muted-foreground">
                              {r.ucNome ? (
                                <>
                                  <span className="font-medium text-foreground">{r.ucNome}</span>
                                  {r.codigoInstalacao && (
                                    <span className="ml-1 font-mono">({r.codigoInstalacao})</span>
                                  )}
                                </>
                              ) : r.codigoInstalacao ? (
                                <span className="font-mono">Instalação {r.codigoInstalacao} — UC não cadastrada</span>
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
                      const msg = r.error && r.error.length > 200 ? r.error.slice(0, 200) + "…" : r.error;
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
            </div>
          );
        })()}
        </div>

        {results && (
          <div className="flex shrink-0 justify-end gap-2 border-t bg-background px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border px-3 py-2 text-sm transition hover:bg-muted"
            >
              Fechar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

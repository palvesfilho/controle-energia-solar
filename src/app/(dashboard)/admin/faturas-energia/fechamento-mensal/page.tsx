"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  Clock,
  Download,
  Filter,
  Loader2,
  RefreshCw,
  Sparkles,
  XCircle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import type {
  FechamentoMensalRow,
  FechamentoStatus,
} from "@/app/api/admin/faturas-energia/fechamento-mensal/route";
import { formatCodigoUc } from "@/lib/uc-codigo";
import { matchBusca } from "@/lib/busca";

const MESES = [
  { v: 1, l: "Janeiro" }, { v: 2, l: "Fevereiro" }, { v: 3, l: "Março" },
  { v: 4, l: "Abril" }, { v: 5, l: "Maio" }, { v: 6, l: "Junho" },
  { v: 7, l: "Julho" }, { v: 8, l: "Agosto" }, { v: 9, l: "Setembro" },
  { v: 10, l: "Outubro" }, { v: 11, l: "Novembro" }, { v: 12, l: "Dezembro" },
];

const selectClass =
  "text-sm border rounded-lg px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all";

function formatBRL(v: number | null): string {
  if (v == null) return "-";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "-" : d.toLocaleDateString("pt-BR");
}

const STATUS_UI: Record<FechamentoStatus, { label: string; cls: string; Icon: React.ElementType }> = {
  pronta: { label: "Pronta", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300", Icon: CheckCircle2 },
  paga: { label: "Paga", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300", Icon: CheckCircle2 },
  erro: { label: "Com erro", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300", Icon: AlertTriangle },
  pendente: { label: "Pendente concessionária", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300", Icon: Clock },
};

function StatusBadge({ status }: { status: FechamentoStatus }) {
  const it = STATUS_UI[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs ${it.cls}`}>
      <it.Icon className="h-3 w-3" />
      {it.label}
    </span>
  );
}

export default function FechamentoMensalPage() {
  const now = new Date();
  const [ano, setAno] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [rows, setRows] = useState<FechamentoMensalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [syncingAll, setSyncingAll] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | FechamentoStatus>("all");
  const [search, setSearch] = useState("");
  const anos = useMemo(() => {
    const y = now.getFullYear();
    const arr: number[] = [];
    for (let i = y + 1; i >= y - 4; i--) arr.push(i);
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = () => {
    setLoading(true);
    setError(null);
    fetch(`/api/admin/faturas-energia/fechamento-mensal?ano=${ano}&mes=${mes}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Falha ao carregar"))))
      .then((data) => setRows(data.rows ?? []))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [ano, mes]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSyncAll() {
    if (
      !confirm(
        "Sincronizar todas as UCs com credencial? Isso pode levar alguns minutos."
      )
    )
      return;
    setSyncingAll(true);
    const loadingToast = toast.loading("Sincronizando 0/? UCs...");

    type ProgressResult = {
      codigoUc: string;
      nome: string;
      success: boolean;
      error: string | null;
      skipped?: boolean;
      skipReason?: string;
      synced: number;
    };
    type StreamEvent =
      | { type: "start"; total: number; skippedAhead?: ProgressResult[] }
      | { type: "progress"; index: number; total: number; result: ProgressResult }
      | {
          type: "summary";
          total: number;
          successCount: number;
          errorCount: number;
          skippedCount?: number;
          syncedTotal: number;
          /** Preenchido quando o disjuntor cortou o lote (origem fora do ar). */
          aborted?: string | null;
          naoConsultadas?: number;
        }
      | { type: "error"; message: string };

    const collected: ProgressResult[] = [];
    let summary: Extract<StreamEvent, { type: "summary" }> | null = null;
    let totalKnown = 0;

    try {
      const res = await fetch("/api/admin/faturas-energia/sync-all", {
        method: "POST",
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // Recarrega a tabela em background (não bloqueia o loop) com debounce.
      let reloadTimer: ReturnType<typeof setTimeout> | null = null;
      const scheduleReload = () => {
        if (reloadTimer) return;
        reloadTimer = setTimeout(() => {
          reloadTimer = null;
          load();
        }, 400);
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let evt: StreamEvent;
          try {
            evt = JSON.parse(line) as StreamEvent;
          } catch {
            continue;
          }
          if (evt.type === "start") {
            totalKnown = evt.total;
            if (evt.skippedAhead?.length) {
              collected.push(...evt.skippedAhead);
            }
            const skippedMsg = evt.skippedAhead?.length
              ? ` (${evt.skippedAhead.length} aguardando próxima leitura)`
              : "";
            toast.loading(
              `Sincronizando 0/${totalKnown} UCs${skippedMsg}...`,
              { id: loadingToast },
            );
          } else if (evt.type === "progress") {
            collected.push(evt.result);
            // Mostra faturas baixadas e erros, não só o contador de UCs — que
            // sobe igual quando a consulta falha e passa a impressão de que
            // tudo veio.
            const baixadas = collected.reduce((acc, r) => acc + (r.synced ?? 0), 0);
            const comErro = collected.filter((r) => !r.success && !r.skipped).length;
            toast.loading(
              `UC ${evt.index}/${evt.total} — ${baixadas} fatura(s) baixada(s)` +
                (comErro > 0 ? `, ${comErro} com erro` : ""),
              { id: loadingToast },
            );
            scheduleReload();
          } else if (evt.type === "summary") {
            summary = evt;
          } else if (evt.type === "error") {
            throw new Error(evt.message);
          }
        }
      }

      // Garante refresh final mesmo se o debounce não tiver disparado.
      if (reloadTimer) {
        clearTimeout(reloadTimer);
        reloadTimer = null;
      }
      load();

      toast.dismiss(loadingToast);

      const finalSummary = summary ?? {
        total: collected.length,
        successCount: collected.filter((r) => r.success).length,
        errorCount: collected.filter((r) => !r.success && !r.skipped).length,
        skippedCount: collected.filter((r) => r.skipped).length,
        syncedTotal: collected.reduce((acc, r) => acc + (r.synced ?? 0), 0),
      };

      const skippedCount = finalSummary.skippedCount ?? 0;
      const summaryStr = [
        `${finalSummary.successCount}/${finalSummary.total} sincronizadas`,
        finalSummary.syncedTotal > 0
          ? `${finalSummary.syncedTotal} fatura(s) atualizadas`
          : null,
        skippedCount > 0 ? `${skippedCount} aguardando próxima leitura` : null,
        finalSummary.errorCount > 0
          ? `${finalSummary.errorCount} com erro`
          : null,
      ]
        .filter(Boolean)
        .join(" • ");
      const descLines = [
        ...collected
          .filter((r) => r.skipped)
          .map((r) => `⏳ ${formatCodigoUc(r.codigoUc)}: ${r.skipReason ?? "aguardando leitura"}`),
        ...collected
          .filter((r) => !r.success && !r.skipped)
          .map((r) => `❌ ${formatCodigoUc(r.codigoUc)}: ${r.error ?? "erro desconhecido"}`),
      ].join("\n");
      const aborted = (finalSummary as { aborted?: string | null }).aborted;
      if (aborted) {
        // Disjuntor cortou o lote: destaca o motivo acima da lista de erros,
        // senão o operador acha que o sync varreu tudo.
        toast.error("Sincronização interrompida", {
          description: [aborted, descLines].filter(Boolean).join("\n\n"),
          duration: 20000,
        });
      } else if (finalSummary.errorCount === 0) {
        toast.success(
          summaryStr,
          descLines ? { description: descLines, duration: 10000 } : undefined,
        );
      } else {
        toast.warning(summaryStr, { description: descLines, duration: 10000 });
      }
    } catch (e) {
      toast.dismiss(loadingToast);
      toast.error("Falha ao sincronizar em lote", {
        description: (e as Error).message,
      });
      load();
    } finally {
      setSyncingAll(false);
    }
  }

  async function handleResync(ucId: string, rowKey: string) {
    setSyncing((s) => ({ ...s, [rowKey]: true }));
    try {
      const res = await fetch(`/api/consumer-units/${ucId}/bills/sync`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      load();
      toast.success("Sincronização concluída");
    } catch (e) {
      toast.error("Falha ao re-sincronizar", { description: (e as Error).message });
    } finally {
      setSyncing((s) => ({ ...s, [rowKey]: false }));
    }
  }

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      return matchBusca(search, [r.nome, r.codigoUc, r.proprietario, r.distribuidora]);
    });
  }, [rows, statusFilter, search]);

  // Os KPIs contam sobre `filtered`, NÃO sobre `rows`: o número em cima da tela
  // tem que descrever a lista que está embaixo dela. Contando o mês inteiro, o
  // operador filtrava por um cliente e continuava lendo o total geral como se
  // fosse daquele cliente.
  const totals = useMemo(() => {
    const t = { pronta: 0, paga: 0, erro: 0, pendente: 0 };
    for (const r of filtered) t[r.status]++;
    return t;
  }, [filtered]);

  const buscadas = totals.pronta + totals.paga + totals.erro;
  const percentBuscadas = filtered.length > 0
    ? Math.round((buscadas / filtered.length) * 100)
    : 0;

  // Com filtro ativo os KPIs deixam de ser o retrato do mês. Dizer isso na tela
  // é o que impede a leitura errada no sentido contrário.
  const filtroAtivo = statusFilter !== "all" || search.trim() !== "";

  const mesLabel = MESES.find((m) => m.v === mes)?.l ?? "";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          <CalendarCheck className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Fechamento Mensal — {mesLabel}/{ano}</h1>
          <p className="text-sm text-muted-foreground">
            Status operacional do mês para cobrar a concessionária e os clientes.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Mês</label>
              <select value={mes} onChange={(e) => setMes(Number(e.target.value))} className={selectClass}>
                {MESES.map((m) => (
                  <option key={m.v} value={m.v}>
                    {m.l}
                  </option>
                ))}
              </select>
            </div>
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
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                className={selectClass}
              >
                <option value="all">Todos</option>
                <option value="pronta">Prontas</option>
                <option value="paga">Pagas</option>
                <option value="erro">Com erro</option>
                <option value="pendente">Pendentes (concessionária)</option>
              </select>
            </div>
            <div className="space-y-1.5 flex-1 min-w-[200px]">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Buscar</label>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="UC, nome, proprietário..."
                className={`${selectClass} w-full`}
              />
            </div>
            <button
              type="button"
              onClick={load}
              className="h-9 inline-flex items-center gap-1 px-3 text-sm font-medium border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
            <div className="ml-auto flex flex-col items-end gap-1">
              <button
                type="button"
                onClick={handleSyncAll}
                disabled={syncingAll}
                className="h-9 inline-flex items-center gap-1.5 px-3 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-60 transition-colors"
                title="Sincroniza faturas de todas as UCs com credencial cadastrada"
              >
                {syncingAll ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {syncingAll ? "Sincronizando..." : "Sincronizar todas"}
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {filtroAtivo && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 font-medium text-violet-700 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300">
            <Filter className="h-3 w-3" />
            Indicadores do filtro — {filtered.length} de {rows.length} UCs do mês
          </span>
          <button
            type="button"
            onClick={() => {
              setStatusFilter("all");
              setSearch("");
            }}
            className="underline underline-offset-2 hover:text-foreground transition-colors"
          >
            limpar filtros
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          label="% Buscadas na concessionária"
          value={`${percentBuscadas}%`}
          sublabel={`${buscadas}/${filtered.length} faturas`}
          dotCls="bg-violet-500"
        />
        <KpiCard label="Pagas" value={totals.paga} dotCls="bg-blue-500" />
        <KpiCard label="Com erro" value={totals.erro} dotCls="bg-amber-500" />
        <KpiCard label="Cobrar concessionária" value={totals.pendente} dotCls="bg-red-500" />
      </div>

      {loading && (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
          </CardContent>
        </Card>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {!loading && !error && (
        <Card>
          <CardContent className="p-3">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium text-xs uppercase tracking-wide">UC</th>
                    <th className="px-3 py-2 text-left font-medium text-xs uppercase tracking-wide">Nome</th>
                    <th className="px-3 py-2 text-left font-medium text-xs uppercase tracking-wide">Origem</th>
                    <th className="px-3 py-2 text-left font-medium text-xs uppercase tracking-wide">Distribuidora</th>
                    <th className="px-3 py-2 text-left font-medium text-xs uppercase tracking-wide">Status</th>
                    <th className="px-3 py-2 text-right font-medium text-xs uppercase tracking-wide">Valor Fatura</th>
                    <th className="px-3 py-2 text-right font-medium text-xs uppercase tracking-wide">Valor a Cobrar</th>
                    <th className="px-3 py-2 text-left font-medium text-xs uppercase tracking-wide">Vencimento</th>
                    <th className="px-3 py-2 text-left font-medium text-xs uppercase tracking-wide">Observações</th>
                    <th className="px-3 py-2 text-right font-medium text-xs uppercase tracking-wide">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const isSyncing = !!syncing[r.ucId];
                    return (
                      <tr key={r.ucId} className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${r.active ? "" : "opacity-60"}`}>
                        <td className="px-3 py-2.5 font-mono text-xs">{formatCodigoUc(r.codigoUc)}</td>
                        <td className="px-3 py-2.5">{r.nome}</td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs ${r.origem === "cliente" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"}`}>
                            {r.origem === "cliente" ? "Cliente" : "Usina"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">{r.distribuidora ?? "-"}</td>
                        <td className="px-3 py-2.5">
                          <StatusBadge status={r.status} />
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{formatBRL(r.valorTotal)}</td>
                        <td
                          className="px-3 py-2.5 text-right tabular-nums"
                          title={
                            r.cobrancaProblemas.length > 0
                              ? r.cobrancaProblemas.join(" • ")
                              : r.regraRemuneracao
                              ? `Regra: ${r.regraRemuneracao}`
                              : undefined
                          }
                        >
                          {r.valorCobrado != null ? (
                            <span className="font-medium text-emerald-700 dark:text-emerald-400">
                              {formatBRL(r.valorCobrado)}
                            </span>
                          ) : r.cobrancaProblemas.length > 0 ? (
                            <span className="text-xs text-amber-600 dark:text-amber-400">
                              —
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-2.5">{formatDate(r.vencimento)}</td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-sm whitespace-normal break-words">
                          {[...r.problemas, ...r.cobrancaProblemas].length > 0
                            ? [...r.problemas, ...r.cobrancaProblemas].join(" • ")
                            : "—"}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-end gap-1.5">
                            {r.pdfUrl && (
                              <a
                                href={r.pdfUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Abrir fatura PDF"
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md border hover:bg-muted transition-colors"
                              >
                                <Download className="h-3.5 w-3.5" />
                              </a>
                            )}
                            {r.syncableUcId ? (
                              <button
                                onClick={() => handleResync(r.syncableUcId!, r.ucId)}
                                disabled={isSyncing}
                                title="Re-sincronizar via Infosimples"
                                className="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs hover:bg-muted transition-colors disabled:opacity-50"
                              >
                                {isSyncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                                Sync
                              </button>
                            ) : (
                              <span title="Sem credencial cadastrada para sync">
                                <XCircle className="h-4 w-4 text-muted-foreground/40" />
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-3 py-8 text-center text-sm text-muted-foreground">
                        Nenhuma UC encontrada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}


function KpiCard({
  label,
  value,
  dotCls,
  sublabel,
}: {
  label: string;
  value: number | string;
  dotCls: string;
  sublabel?: string;
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <span className={`h-2.5 w-2.5 rounded-full ${dotCls}`} />
          {label}
        </div>
        <div className="mt-1 text-2xl font-bold">{value}</div>
        {sublabel && (
          <div className="mt-0.5 text-xs text-muted-foreground">{sublabel}</div>
        )}
      </CardContent>
    </Card>
  );
}

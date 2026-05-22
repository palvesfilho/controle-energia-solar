"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ClipboardCheck,
  ClipboardList,
  FileText,
  Loader2,
  Package,
  RefreshCw,
  Search,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type {
  GestaoObraRow,
  ObraStatus,
} from "@/app/api/admin/obra/gestao-obra/route";

const STATUS_UI: Record<
  ObraStatus,
  { label: string; cls: string }
> = {
  PLANEJAMENTO: {
    label: "Planejamento",
    cls: "bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300",
  },
  EM_EXECUCAO: {
    label: "Em execução",
    cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  },
  PAUSADA: {
    label: "Pausada",
    cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  },
  CONCLUIDA: {
    label: "Concluída",
    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  },
  CANCELADA: {
    label: "Cancelada",
    cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  },
};

type FinalizadaFiltro = "all" | "CONCLUIDA" | "CANCELADA";

const selectClass =
  "text-sm border rounded-lg px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all";

function formatPotencia(v: number | null): string {
  if (v == null) return "—";
  return `${v.toFixed(2)} kWp`;
}

function formatData(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function StatusBadge({ status }: { status: ObraStatus }) {
  const it = STATUS_UI[status] ?? STATUS_UI.PLANEJAMENTO;
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs ${it.cls}`}
    >
      {it.label}
    </span>
  );
}

interface ActionButtonProps {
  title: string;
  icon: React.ElementType;
  onClick?: () => void;
  href?: string;
  sameTab?: boolean;
  done?: boolean;
}

function ActionButton({
  title,
  icon: Icon,
  onClick,
  href,
  sameTab,
  done,
}: ActionButtonProps) {
  const cls = `inline-flex h-8 items-center justify-center gap-1 rounded-md border px-2 text-xs font-medium transition-colors ${
    done
      ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
      : "hover:bg-muted"
  }`;
  const content = <Icon className="h-3.5 w-3.5" />;
  if (href) {
    const targetProps = sameTab
      ? {}
      : { target: "_blank", rel: "noopener noreferrer" };
    return (
      <a
        href={href}
        {...targetProps}
        title={title}
        className={cls}
        onClick={onClick}
      >
        {content}
      </a>
    );
  }
  return (
    <button type="button" title={title} onClick={onClick} className={cls}>
      {content}
    </button>
  );
}

export default function ObrasFinalizadasPage() {
  const [rows, setRows] = useState<GestaoObraRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<FinalizadaFiltro>("all");
  const [search, setSearch] = useState("");

  const load = () => {
    setLoading(true);
    setError(null);
    fetch("/api/admin/obra/gestao-obra?apenasFinalizadas=true")
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error("Falha ao carregar")),
      )
      .then((data) => setRows(data.rows ?? []))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (statusFilter !== "all" && r.status !== statusFilter) return false;
        if (!term) return true;
        return (
          r.nome.toLowerCase().includes(term) ||
          (r.cliente ?? "").toLowerCase().includes(term) ||
          (r.proprietarioNome ?? "").toLowerCase().includes(term) ||
          (r.local ?? "").toLowerCase().includes(term) ||
          (r.responsavel ?? "").toLowerCase().includes(term)
        );
      })
      .sort((a, b) => {
        const da = a.dataFimReal ? new Date(a.dataFimReal).getTime() : 0;
        const db = b.dataFimReal ? new Date(b.dataFimReal).getTime() : 0;
        return db - da;
      });
  }, [rows, statusFilter, search]);

  const totals = useMemo(() => {
    let concluida = 0;
    let cancelada = 0;
    for (const r of rows) {
      if (r.status === "CONCLUIDA") concluida++;
      else if (r.status === "CANCELADA") cancelada++;
    }
    return { concluida, cancelada };
  }, [rows]);

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 text-white">
            <ClipboardCheck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Obras Finalizadas</h1>
            <p className="text-sm text-muted-foreground">
              Histórico de obras concluídas ou canceladas. Consulte documentos,
              materiais e conferências.
            </p>
          </div>
        </div>
        <Link
          href="/admin/obra/gestao-obra"
          className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <ClipboardList className="h-4 w-4" />
          <span className="hidden sm:inline">Gestão de Obras</span>
        </Link>
      </div>

      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as FinalizadaFiltro)
                }
                className={selectClass}
              >
                <option value="all">Todas</option>
                <option value="CONCLUIDA">Concluídas</option>
                <option value="CANCELADA">Canceladas</option>
              </select>
            </div>
            <div className="space-y-1.5 flex-1 min-w-[220px]">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Buscar
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nome, cliente, proprietário, local..."
                  className={`${selectClass} w-full pl-9`}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={load}
              className="h-9 inline-flex items-center gap-1 px-3 text-sm font-medium border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-2">
        <KpiCard
          label="Concluídas"
          value={totals.concluida}
          dotCls="bg-emerald-500"
        />
        <KpiCard
          label="Canceladas"
          value={totals.cancelada}
          dotCls="bg-red-500"
        />
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
                    <th className="px-3 py-2 text-left font-medium text-xs uppercase tracking-wide">
                      Cliente / Proprietário
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-xs uppercase tracking-wide">
                      Obra
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-xs uppercase tracking-wide">
                      Local
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-xs uppercase tracking-wide">
                      Potência
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-xs uppercase tracking-wide">
                      Status
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-xs uppercase tracking-wide">
                      Finalizada em
                    </th>
                    <th className="px-3 py-2 text-center font-medium text-xs uppercase tracking-wide">
                      Documento
                      <br />
                      de Obra
                    </th>
                    <th className="px-3 py-2 text-center font-medium text-xs uppercase tracking-wide">
                      Lista de
                      <br />
                      Materiais
                    </th>
                    <th className="px-3 py-2 text-center font-medium text-xs uppercase tracking-wide">
                      Conferência
                      <br />
                      de Obra
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-3 py-2.5">
                        <div className="font-medium">
                          {r.proprietarioNome ?? r.cliente ?? "—"}
                        </div>
                        {r.proprietarioNome &&
                          r.cliente &&
                          r.proprietarioNome !== r.cliente && (
                            <div className="text-xs text-muted-foreground">
                              {r.cliente}
                            </div>
                          )}
                      </td>
                      <td className="px-3 py-2.5">
                        <Link
                          href={`/admin/obra/cronograma/${r.id}`}
                          className="hover:underline"
                        >
                          {r.nome}
                        </Link>
                        {r.responsavel && (
                          <div className="text-xs text-muted-foreground">
                            Resp.: {r.responsavel}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {r.local ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {formatPotencia(r.potenciaKwp)}
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground tabular-nums">
                        {formatData(r.dataFimReal)}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <ActionButton
                          title={
                            r.documentoPdfGerado
                              ? "Documento de Obra (PDF) — clique para gerar novamente"
                              : "Gerar Documento de Obra (PDF)"
                          }
                          icon={FileText}
                          href={`/api/admin/obra/${r.id}/documento-pdf`}
                          done={r.documentoPdfGerado}
                          onClick={() => setTimeout(load, 1500)}
                        />
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <ActionButton
                          title={
                            r.listaMateriaisPdfGerado
                              ? "Lista de Materiais — PDF já gerado, clique para visualizar"
                              : "Lista de Materiais"
                          }
                          icon={Package}
                          href={`/admin/obra/${r.id}/lista-materiais`}
                          done={r.listaMateriaisPdfGerado}
                          sameTab
                        />
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <ActionButton
                          title={
                            r.conferenciaPdfGerado
                              ? "Conferência de Obra (PDF) — clique para gerar novamente"
                              : "Gerar Conferência de Obra (PDF)"
                          }
                          icon={ClipboardCheck}
                          href={`/api/admin/obra/${r.id}/conferencia-pdf`}
                          done={r.conferenciaPdfGerado}
                          onClick={() => setTimeout(load, 1500)}
                        />
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td
                        colSpan={9}
                        className="px-3 py-8 text-center text-sm text-muted-foreground"
                      >
                        Nenhuma obra finalizada encontrada.
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
}: {
  label: string;
  value: number;
  dotCls: string;
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <span className={`h-2.5 w-2.5 rounded-full ${dotCls}`} />
          {label}
        </div>
        <div className="mt-1 text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

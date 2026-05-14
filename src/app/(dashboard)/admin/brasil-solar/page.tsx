"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { StatsCards } from "@/components/brasil-solar/stats-cards";
import { ClientFilters } from "@/components/brasil-solar/client-filters";
import { MonitoringStatusBadge } from "@/components/brasil-solar/status-badge";
import { formatNumber } from "@/lib/formatters";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  AlertTriangle,
  Plus,
  RefreshCw,
  ArrowUpDown,
  Download,
  Loader2,
  CloudDownload,
  Zap,
  History,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

interface BrasilSolarClient {
  id: string;
  nome: string;
  cpfCnpj?: string | null;
  cidade?: string | null;
  uf?: string | null;
  potenciaInstalada?: number | null;
  plataformaMonitoramento?: string | null;
  statusMonitoramento: string;
  statusContrato?: string | null;
  ultimaGeracao?: number | null;
  ultimaLeitura?: string | null;
  geracaoMesAtual?: number | null;
  geracaoMediaEsperada?: number | null;
  performanceRatio?: number | null;
  inversorMarca?: string | null;
  concessionaria?: string | null;
  investimento?: number | null;
  proprietario?: { id: string; nome: string } | null;
  _count: { alerts: number };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface StatsData {
  totalClientes: number;
  statusDistribution: { online: number; offline: number; alerta: number; semDados: number };
  alertas: { abertos: number; criticos: number };
  geracao: { hoje: number; clientesComDadosHoje: number; mesAtual: number };
  distribuicao: {
    plataforma: { plataforma: string; count: number }[];
    uf: { uf: string; count: number }[];
    alertasPorTipo: { tipo: string; count: number }[];
  };
}

export default function BrasilSolarPage() {
  const [clients, setClients] = useState<BrasilSolarClient[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    search: "",
    status: "",
    plataforma: "",
    uf: "",
    contrato: "",
    proprietario: "",
  });
  const [sortBy, setSortBy] = useState("nome");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/brasil-solar/stats");
      if (res.ok) setStats(await res.json());
    } catch { /* silently fail stats */ }
  }, []);

  const fetchClients = useCallback(async (page: number = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "50",
        orderBy: sortBy,
        order: sortOrder,
      });
      if (filters.search) params.set("search", filters.search);
      if (filters.status) params.set("status", filters.status);
      if (filters.plataforma) params.set("plataforma", filters.plataforma);
      if (filters.uf) params.set("uf", filters.uf);
      if (filters.contrato) params.set("contrato", filters.contrato);
      if (filters.proprietario === "SEM_PROPRIETARIO") {
        params.set("semProprietario", "true");
      } else if (filters.proprietario) {
        params.set("proprietarioId", filters.proprietario);
      }

      const res = await fetch(`/api/brasil-solar?${params}`);
      if (res.ok) {
        const data = await res.json();
        setClients(data.clients);
        setPagination(data.pagination);
      }
    } finally {
      setLoading(false);
    }
  }, [filters, sortBy, sortOrder]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchClients(1);
    }, filters.search ? 400 : 0);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [fetchClients, filters.search]);

  function handleSort(field: string) {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
  }

  function SortHeader({ field, children }: { field: string; children: React.ReactNode }) {
    return (
      <th
        className="text-left py-2.5 px-3 font-medium cursor-pointer hover:text-foreground transition-colors select-none"
        onClick={() => handleSort(field)}
      >
        <span className="inline-flex items-center gap-1">
          {children}
          {sortBy === field && (
            <ArrowUpDown className="h-3 w-3" />
          )}
        </span>
      </th>
    );
  }

  function formatLastReading(dateStr?: string | null) {
    if (!dateStr) return "-";
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 1) return "Agora";
    if (diffHours < 24) return `${diffHours}h atras`;
    if (diffDays < 7) return `${diffDays}d atras`;
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(d);
  }

  const [syncing, setSyncing] = useState<string | null>(null);

  async function handleSync(endpoint: string, label: string) {
    setSyncing(endpoint);
    try {
      const res = await fetch(`/api/brasil-solar/${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await res.json();
      if (res.ok) {
        toast.success(`${label} concluido`, { description: JSON.stringify(data, null, 0).slice(0, 200) });
        fetchStats();
        fetchClients(1);
      } else {
        toast.error(data.error || `Erro ao ${label.toLowerCase()}`);
      }
    } catch {
      toast.error(`Falha na conexao ao ${label.toLowerCase()}`);
    } finally {
      setSyncing(null);
    }
  }

  function getPrColor(pr?: number | null) {
    if (pr == null) return "text-muted-foreground";
    if (pr >= 90) return "text-emerald-600";
    if (pr >= 70) return "text-amber-600";
    return "text-red-600";
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Usinas Brasil Solar</h1>
          <p className="text-sm text-muted-foreground">
            Monitoramento de geracao e acompanhamento pos-venda
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/brasil-solar/importar"
            className="flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg hover:bg-muted transition-colors"
          >
            <Download className="h-4 w-4" />
            Importar
          </Link>
          <Link
            href="/admin/brasil-solar/novo"
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Novo Cliente
          </Link>
        </div>
      </div>

      {/* Sync Controls */}
      <Card>
        <CardContent className="p-3 space-y-3">
          {/* Importar plantas (por marca) */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide mr-2 min-w-[120px]">Importar Plantas</span>
            <button
              onClick={() => handleSync("sync", "Importar plantas Fronius")}
              disabled={syncing !== null}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg hover:bg-muted disabled:opacity-50 transition-colors"
            >
              {syncing === "sync" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudDownload className="h-3.5 w-3.5" />}
              Fronius
            </button>
            <button
              onClick={() => handleSync("sync-huawei", "Importar plantas Huawei")}
              disabled={syncing !== null}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg hover:bg-muted disabled:opacity-50 transition-colors"
            >
              {syncing === "sync-huawei" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudDownload className="h-3.5 w-3.5" />}
              Huawei
            </button>
            <button
              onClick={() => handleSync("sync-sungrow", "Importar plantas Sungrow")}
              disabled={syncing !== null}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg hover:bg-muted disabled:opacity-50 transition-colors"
            >
              {syncing === "sync-sungrow" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudDownload className="h-3.5 w-3.5" />}
              Sungrow
            </button>
            <button
              onClick={() => handleSync("sync-solaredge", "Importar plantas SolarEdge")}
              disabled={syncing !== null}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg hover:bg-muted disabled:opacity-50 transition-colors"
            >
              {syncing === "sync-solaredge" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudDownload className="h-3.5 w-3.5" />}
              SolarEdge
            </button>
          </div>

          {/* Acoes globais */}
          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            <button
              onClick={() => handleSync("sync-all/refresh", "Atualizar geração e status (todas as marcas)")}
              disabled={syncing !== null}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-blue-300 bg-blue-50 text-blue-800 rounded-lg hover:bg-blue-100 disabled:opacity-50 transition-colors dark:bg-blue-950 dark:text-blue-200 dark:border-blue-800 dark:hover:bg-blue-900"
            >
              {syncing === "sync-all/refresh" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              Atualizar Geração + Status (Todas Marcas)
            </button>
            <button
              onClick={() => {
                if (confirm("Importar histórico completo de TODAS as marcas (Huawei, Sungrow, Fronius, SolarEdge)?\n\nEsta operação pode levar vários minutos.")) {
                  handleSync("sync-all/history", "Importar histórico (todas as marcas)");
                }
              }}
              disabled={syncing !== null}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-amber-300 bg-amber-50 text-amber-800 rounded-lg hover:bg-amber-100 disabled:opacity-50 transition-colors dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800 dark:hover:bg-amber-900"
            >
              {syncing === "sync-all/history" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <History className="h-3.5 w-3.5" />}
              Importar Histórico (Todas Marcas)
            </button>
            <button
              onClick={() => { fetchStats(); fetchClients(pagination.page); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg hover:bg-muted transition-colors ml-auto"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Recarregar
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      {stats && <StatsCards stats={stats} />}

      {/* Filters + Table */}
      <Card>
        <CardHeader className="pb-3">
          <ClientFilters
            filters={filters}
            onChange={setFilters}
            totalResults={pagination.total}
          />
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-xs">
                  <SortHeader field="nome">Cliente</SortHeader>
                  <th className="text-left py-2.5 px-3 font-medium">Proprietario</th>
                  <th className="text-left py-2.5 px-3 font-medium">Cidade/UF</th>
                  <SortHeader field="potenciaInstalada">kWp</SortHeader>
                  <SortHeader field="investimento">Investimento</SortHeader>
                  <th className="text-left py-2.5 px-3 font-medium">Plataforma</th>
                  <SortHeader field="statusMonitoramento">Status</SortHeader>
                  <th className="text-right py-2.5 px-3 font-medium">Ult. Geracao</th>
                  <th className="text-right py-2.5 px-3 font-medium">Mes Atual</th>
                  <th className="text-center py-2.5 px-3 font-medium">PR</th>
                  <th className="text-center py-2.5 px-3 font-medium">Ult. Leitura</th>
                  <th className="text-center py-2.5 px-3 font-medium">Alertas</th>
                  <th className="text-center py-2.5 px-3 font-medium w-10"></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {Array.from({ length: 13 }).map((_, j) => (
                        <td key={j} className="py-3 px-3">
                          <div className="h-4 bg-muted rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : clients.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="py-12 text-center text-muted-foreground">
                      Nenhum cliente encontrado
                    </td>
                  </tr>
                ) : (
                  clients.map((client) => (
                    <tr key={client.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-3">
                        <Link
                          href={`/admin/brasil-solar/${client.id}`}
                          className="font-medium text-foreground hover:text-primary transition-colors"
                        >
                          {client.nome}
                        </Link>
                        {client.cpfCnpj && (
                          <p className="text-[10px] text-muted-foreground">{client.cpfCnpj}</p>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        {client.proprietario ? (
                          <Link
                            href={`/admin/brasil-solar/proprietarios/${client.proprietario.id}`}
                            className="text-xs hover:text-primary transition-colors"
                          >
                            {client.proprietario.nome}
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground">
                        {[client.cidade, client.uf].filter(Boolean).join("/") || "-"}
                      </td>
                      <td className="py-2.5 px-3">
                        {client.potenciaInstalada ? formatNumber(client.potenciaInstalada) : "-"}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs">
                        {client.investimento != null ? `R$ ${formatNumber(client.investimento)}` : "-"}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="text-xs">{client.plataformaMonitoramento || "-"}</span>
                      </td>
                      <td className="py-2.5 px-3">
                        <MonitoringStatusBadge status={client.statusMonitoramento} />
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs">
                        {client.ultimaGeracao != null ? `${formatNumber(client.ultimaGeracao)} kWh` : "-"}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs">
                        {client.geracaoMesAtual != null ? `${formatNumber(client.geracaoMesAtual)} kWh` : "-"}
                      </td>
                      <td className={`py-2.5 px-3 text-center font-mono text-xs font-medium ${getPrColor(client.performanceRatio)}`}>
                        {client.performanceRatio != null ? `${formatNumber(client.performanceRatio)}%` : "-"}
                      </td>
                      <td className="py-2.5 px-3 text-center text-xs text-muted-foreground">
                        {formatLastReading(client.ultimaLeitura)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {client._count.alerts > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-medium">
                            <AlertTriangle className="h-3 w-3" />
                            {client._count.alerts}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <Link
                          href={`/admin/brasil-solar/${client.id}`}
                          className="text-muted-foreground hover:text-primary transition-colors"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-xs text-muted-foreground">
                Pagina {pagination.page} de {pagination.totalPages}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => fetchClients(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  className="p-1.5 rounded hover:bg-muted disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                  let pageNum: number;
                  if (pagination.totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (pagination.page <= 3) {
                    pageNum = i + 1;
                  } else if (pagination.page >= pagination.totalPages - 2) {
                    pageNum = pagination.totalPages - 4 + i;
                  } else {
                    pageNum = pagination.page - 2 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => fetchClients(pageNum)}
                      className={`px-2.5 py-1 text-xs rounded transition-colors ${
                        pageNum === pagination.page
                          ? "bg-primary text-white"
                          : "hover:bg-muted"
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                <button
                  onClick={() => fetchClients(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages}
                  className="p-1.5 rounded hover:bg-muted disabled:opacity-30 transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

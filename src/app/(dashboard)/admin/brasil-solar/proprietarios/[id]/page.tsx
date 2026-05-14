"use client";

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Pencil,
  Trash2,
  ExternalLink,
  User,
  Building2,
  Plus,
  X,
  Search,
  LinkIcon,
  Unlink,
  Loader2,
  Zap,
  TrendingUp,
  Activity,
  Sun,
  RefreshCw,
  Check,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MonitoringStatusBadge } from "@/components/brasil-solar/status-badge";
import { GenerationChart, MonthlyComparisonChart } from "@/components/brasil-solar/generation-chart";
import { formatNumber } from "@/lib/formatters";
import { toast } from "sonner";
import { UcCredentialsForm } from "@/components/consumer-units/uc-credentials-form";
import { UcBills } from "@/components/consumer-units/uc-bills";
import {
  MonitoringPlanModal,
  deriveStatus,
  type MonitoringPlanStatus,
} from "@/components/brasil-solar/monitoring-plan-modal";
import { ShieldCheck, ShieldAlert, ShieldOff } from "lucide-react";

interface Planta {
  id: string;
  nome: string;
  potenciaInstalada?: number | null;
  plataformaMonitoramento?: string | null;
  statusMonitoramento: string;
  geracaoMesAtual?: number | null;
  ultimaLeitura?: string | null;
  performanceRatio?: number | null;
  cidade?: string | null;
  uf?: string | null;
  _count: { alerts: number };
  monitoringPlans?: { id: string; dataInicio: string; dataFim: string }[];
}

interface Proprietario {
  id: string;
  nome: string;
  cpfCnpj?: string | null;
  email?: string | null;
  telefone?: string | null;
  endereco?: string | null;
  cidade?: string | null;
  uf?: string | null;
  observacoes?: string | null;
  createdAt: string;
  // Dados técnicos do Anexo F (ficam no proprietário, não na planta)
  latitude?: number | null;
  longitude?: number | null;
  codigoUc?: string | null;
  concessionaria?: string | null;
  potenciaInstalada?: number | null;
  modulosMarca?: string | null;
  modulosModelo?: string | null;
  modulosQuantidade?: number | null;
  inversorMarca?: string | null;
  inversorModelo?: string | null;
  inversorQuantidade?: number | null;
  inversorPotencia?: number | null;
  numeroFases?: string | null;
  tipoAtendimento?: string | null;
  plantas: Planta[];
}

interface ClienteDisponivel {
  id: string;
  nome: string;
  cidade?: string | null;
  uf?: string | null;
  potenciaInstalada?: number | null;
  plataformaMonitoramento?: string | null;
}

interface AggLog {
  id: string;
  data: string;
  geracaoDiaria: number;
  geracaoEsperada: number | null;
  picoMaximo: number | null;
  horasSol: number | null;
}

interface Metricas {
  plantasCount: number;
  potenciaTotal: number;
  geracaoMesAtual: number;
  geracaoMediaEsperada: number | null;
  performanceRatio: number | null;
  picoMaximo30d: number;
  mediaDiaria30d: number;
  onlineCount: number;
  monitoringLogs: AggLog[];
}

const SYNC_ROUTES: Record<string, string> = {
  FRONIUS: "fronius-sync",
  HUAWEI: "huawei-sync",
  SUNGROW: "sungrow-sync",
  SOLAREDGE: "solaredge-sync",
};

export default function ProprietarioDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [data, setData] = useState<Proprietario | null>(null);
  const [loading, setLoading] = useState(true);
  const [metricas, setMetricas] = useState<Metricas | null>(null);
  const [loadingMetricas, setLoadingMetricas] = useState(true);
  const [syncingAll, setSyncingAll] = useState(false);

  // Modal plano de monitoramento
  const [planoModal, setPlanoModal] = useState<{ clientId: string; nome: string } | null>(
    null,
  );

  // Modal vincular
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [availableClients, setAvailableClients] = useState<ClienteDisponivel[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [linking, setLinking] = useState<string | null>(null);
  const [unlinking, setUnlinking] = useState<string | null>(null);

  // Edição inline do código UC
  const [editingUc, setEditingUc] = useState(false);
  const [ucDraft, setUcDraft] = useState("");
  const [savingUc, setSavingUc] = useState(false);

  // ConsumerUnit vinculada via codigoUc (lookup por código)
  const [consumerUnit, setConsumerUnit] = useState<{ id: string; nome: string } | null>(null);
  const [consumerUnitChecked, setConsumerUnitChecked] = useState(false);
  const [creatingUc, setCreatingUc] = useState(false);
  const [billsRefreshKey, setBillsRefreshKey] = useState(0);

  const startEditUc = () => {
    setUcDraft(data?.codigoUc ?? "");
    setEditingUc(true);
  };

  const saveUc = async () => {
    setSavingUc(true);
    try {
      const res = await fetch(`/api/brasil-solar/proprietarios/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigoUc: ucDraft.trim() || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error("Erro ao salvar UC", { description: j.error });
        return;
      }
      toast.success("Código UC salvo");
      setEditingUc(false);
      // Reset lookup pra refazer com o novo código
      setConsumerUnit(null);
      setConsumerUnitChecked(false);
      await fetchData();
    } finally {
      setSavingUc(false);
    }
  };

  // Procura ConsumerUnit cadastrada com o mesmo codigoUc do proprietário.
  // Se achar, libera o card de credenciais + faturas. Se não, mostra atalho pra criar.
  useEffect(() => {
    if (!data?.codigoUc) {
      setConsumerUnit(null);
      setConsumerUnitChecked(true);
      return;
    }
    setConsumerUnitChecked(false);
    fetch(`/api/consumer-units?codigoUc=${encodeURIComponent(data.codigoUc)}`)
      .then((r) => r.json())
      .then((arr: { id: string; nome: string }[]) => {
        setConsumerUnit(Array.isArray(arr) && arr.length > 0 ? arr[0] : null);
      })
      .catch(() => setConsumerUnit(null))
      .finally(() => setConsumerUnitChecked(true));
  }, [data?.codigoUc]);

  const criarConsumerUnit = async () => {
    if (!data?.codigoUc) return;
    setCreatingUc(true);
    try {
      const res = await fetch("/api/consumer-units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: data.nome,
          codigoUc: data.codigoUc,
          cpfCnpj: data.cpfCnpj ?? null,
          distribuidora: data.concessionaria ?? null,
          cidade: data.cidade ?? null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Erro ao criar UC", { description: j.error });
        return;
      }
      toast.success("UC criada — agora você pode cadastrar credenciais e ver faturas.");
      setConsumerUnit({ id: j.id, nome: j.nome });
    } finally {
      setCreatingUc(false);
    }
  };

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/brasil-solar/proprietarios/${id}`);
      if (!res.ok) throw new Error();
      const result = await res.json();
      setData(result);
    } catch {
      toast.error("Erro ao carregar proprietario");
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchMetricas = useCallback(async () => {
    setLoadingMetricas(true);
    try {
      const res = await fetch(`/api/brasil-solar/proprietarios/${id}/metricas`);
      if (res.ok) setMetricas(await res.json());
    } catch {
      // silencioso — gráficos ficam vazios
    } finally {
      setLoadingMetricas(false);
    }
  }, [id]);

  const handleSyncAll = useCallback(async () => {
    if (!data) return;
    const sincronizaveis = data.plantas.filter(
      (p) => p.plataformaMonitoramento && SYNC_ROUTES[p.plataformaMonitoramento],
    );
    if (sincronizaveis.length === 0) {
      toast.info("Nenhuma usina com plataforma de monitoramento suportada.");
      return;
    }
    if (
      !confirm(
        `Sincronizar ${sincronizaveis.length} usina(s)? Isso pode levar alguns minutos.`,
      )
    ) {
      return;
    }
    setSyncingAll(true);
    let ok = 0;
    let fail = 0;
    for (const p of sincronizaveis) {
      const route = SYNC_ROUTES[p.plataformaMonitoramento!];
      try {
        const res = await fetch(`/api/brasil-solar/${p.id}/${route}`, { method: "POST" });
        if (res.ok) ok++;
        else fail++;
      } catch {
        fail++;
      }
    }
    setSyncingAll(false);
    toast.success(`Sincronização concluída: ${ok} ok, ${fail} falha(s).`);
    await Promise.all([fetchData(), fetchMetricas()]);
  }, [data, fetchData, fetchMetricas]);

  useEffect(() => {
    fetchData();
    fetchMetricas();
  }, [fetchData, fetchMetricas]);

  // Buscar clientes sem proprietário para o modal
  const fetchAvailableClients = useCallback(async () => {
    setLoadingClients(true);
    try {
      const params = new URLSearchParams({
        semProprietario: "true",
        limit: "200",
      });
      if (searchTerm) params.set("search", searchTerm);

      const res = await fetch(`/api/brasil-solar?${params}`);
      if (res.ok) {
        const result = await res.json();
        setAvailableClients(result.clients || []);
      }
    } catch {
      toast.error("Erro ao buscar clientes");
    } finally {
      setLoadingClients(false);
    }
  }, [searchTerm]);

  useEffect(() => {
    if (showLinkModal) {
      const timeout = setTimeout(() => fetchAvailableClients(), searchTerm ? 300 : 0);
      return () => clearTimeout(timeout);
    }
  }, [showLinkModal, fetchAvailableClients, searchTerm]);

  async function handleLink(clientId: string) {
    setLinking(clientId);
    try {
      const res = await fetch(`/api/brasil-solar/${clientId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proprietarioId: id }),
      });
      if (res.ok) {
        toast.success("Usina vinculada com sucesso");
        setAvailableClients((prev) => prev.filter((c) => c.id !== clientId));
        await fetchData();
      } else {
        toast.error("Erro ao vincular usina");
      }
    } catch {
      toast.error("Falha na conexao");
    } finally {
      setLinking(null);
    }
  }

  async function handleUnlink(clientId: string, clientName: string) {
    if (!confirm(`Desvincular "${clientName}" deste proprietario?`)) return;
    setUnlinking(clientId);
    try {
      const res = await fetch(`/api/brasil-solar/${clientId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proprietarioId: null }),
      });
      if (res.ok) {
        toast.success(`"${clientName}" desvinculada`);
        await fetchData();
      } else {
        toast.error("Erro ao desvincular");
      }
    } catch {
      toast.error("Falha na conexao");
    } finally {
      setUnlinking(null);
    }
  }

  async function handleDelete() {
    if (!confirm("Tem certeza que deseja desativar este proprietario? As usinas serao desvinculadas.")) return;
    const res = await fetch(`/api/brasil-solar/proprietarios/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Proprietario desativado");
      router.push("/admin/brasil-solar/proprietarios");
    } else {
      toast.error("Erro ao desativar");
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 bg-muted rounded animate-pulse" />
        <div className="h-48 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Proprietario nao encontrado
      </div>
    );
  }

  const totalKwp = metricas?.potenciaTotal ?? data.plantas.reduce((sum, p) => sum + (p.potenciaInstalada || 0), 0);
  const totalGeracaoMes = metricas?.geracaoMesAtual ?? data.plantas.reduce((sum, p) => sum + (p.geracaoMesAtual || 0), 0);
  const onlineCount = metricas?.onlineCount ?? data.plantas.filter((p) => p.statusMonitoramento === "ONLINE").length;
  const pr = metricas?.performanceRatio ?? null;
  const mediaDiaria = metricas?.mediaDiaria30d ?? 0;
  const picoMaximo = metricas?.picoMaximo30d ?? 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/brasil-solar/proprietarios"
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{data.nome}</h1>
            {data.cpfCnpj && (
              <p className="text-sm text-muted-foreground font-mono">{data.cpfCnpj}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSyncAll}
            disabled={syncingAll || data.plantas.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg hover:bg-muted disabled:opacity-50 transition-colors"
          >
            {syncingAll ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {syncingAll ? "Sincronizando..." : "Sincronizar todas"}
          </button>
          <Link
            href={`/admin/brasil-solar/proprietarios/${id}/editar`}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg hover:bg-muted transition-colors"
          >
            <Pencil className="h-4 w-4" />
            Editar
          </Link>
          <button
            onClick={handleDelete}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            Desativar
          </button>
        </div>
      </div>

      {/* Resumo da carteira */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Usinas</p>
            <p className="text-2xl font-bold">
              {onlineCount}/{data.plantas.length}
            </p>
            <p className="text-[10px] text-muted-foreground">online / total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Potencia Total</p>
            <p className="text-2xl font-bold">{formatNumber(totalKwp)} kWp</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Geracao Mes</p>
            <p className="text-2xl font-bold">{formatNumber(totalGeracaoMes)} kWh</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="h-4 w-4 text-amber-600" />
              <span className="text-xs text-muted-foreground">Performance Ratio</span>
            </div>
            <p
              className={`text-2xl font-bold ${
                pr != null
                  ? pr >= 90
                    ? "text-emerald-600"
                    : pr >= 70
                    ? "text-amber-600"
                    : "text-red-600"
                  : ""
              }`}
            >
              {pr != null ? `${formatNumber(pr)}%` : "-"}
            </p>
            <p className="text-[10px] text-muted-foreground">ponderado por kWp</p>
          </CardContent>
        </Card>
      </div>

      {/* KPIs 30 dias */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-cyan-600" />
              <span className="text-[10px] text-muted-foreground uppercase">Media Diaria 30d</span>
            </div>
            <p className="text-lg font-bold">
              {mediaDiaria > 0 ? `${formatNumber(mediaDiaria)} kWh` : "-"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Sun className="h-4 w-4 text-orange-500" />
              <span className="text-[10px] text-muted-foreground uppercase">Pico Maximo 30d</span>
            </div>
            <p className="text-lg font-bold">
              {picoMaximo > 0 ? `${formatNumber(picoMaximo)} kWh` : "-"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="h-4 w-4 text-green-600" />
              <span className="text-[10px] text-muted-foreground uppercase">Dias com Leitura</span>
            </div>
            <p className="text-lg font-bold">
              {metricas?.monitoringLogs?.length ?? 0}
            </p>
            <p className="text-[10px] text-muted-foreground">últimos 12 meses</p>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos agregados */}
      {loadingMetricas ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground text-sm">
            Carregando gráficos...
          </CardContent>
        </Card>
      ) : metricas && metricas.monitoringLogs.length > 0 ? (
        <div className="space-y-4">
          <GenerationChart
            logs={metricas.monitoringLogs}
            geracaoMediaEsperada={
              metricas.geracaoMediaEsperada != null
                ? metricas.geracaoMediaEsperada / 30
                : undefined
            }
          />
          <MonthlyComparisonChart logs={metricas.monitoringLogs} />
        </div>
      ) : (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground text-sm">
            Sem dados de geração nos últimos 12 meses. Clique em{" "}
            <span className="font-medium">Sincronizar todas</span> para buscar.
          </CardContent>
        </Card>
      )}

      {/* Dados do Proprietario */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <User className="h-4 w-4" /> Dados Pessoais
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {data.email && <div><span className="text-muted-foreground">Email:</span> {data.email}</div>}
            {data.telefone && <div><span className="text-muted-foreground">Telefone:</span> {data.telefone}</div>}
            {data.endereco && <div><span className="text-muted-foreground">Endereco:</span> {data.endereco}</div>}
            {(data.cidade || data.uf) && (
              <div><span className="text-muted-foreground">Cidade/UF:</span> {[data.cidade, data.uf].filter(Boolean).join("/")}</div>
            )}
            {data.observacoes && <div className="pt-2 border-t"><span className="text-muted-foreground">Obs:</span> {data.observacoes}</div>}
            {!data.email && !data.telefone && !data.endereco && !data.cidade && (
              <p className="text-muted-foreground">Nenhum dado adicional informado</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dados Técnicos (Anexo F) — ficam no proprietário, persistem
          independente da usina sincronizada por API. Sempre exibido
          (mesmo sem dados) pra permitir edição inline do código UC,
          que é pré-requisito do relatório Brasil Solar. */}
      <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <Zap className="h-4 w-4" /> Dados Técnicos (Anexo F)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 text-xs">
              <div className="col-span-2 md:col-span-3">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">UC (concessionária):</span>
                  {editingUc ? (
                    <>
                      <input
                        type="text"
                        autoFocus
                        value={ucDraft}
                        onChange={(e) => setUcDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveUc();
                          if (e.key === "Escape") setEditingUc(false);
                        }}
                        placeholder="Ex.: 3095464357"
                        disabled={savingUc}
                        className="font-mono text-xs border rounded px-2 py-1 bg-background w-44"
                      />
                      <button
                        type="button"
                        onClick={saveUc}
                        disabled={savingUc}
                        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {savingUc ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                        Salvar
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingUc(false)}
                        disabled={savingUc}
                        className="text-xs px-2 py-1 rounded border hover:bg-muted disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      {data.codigoUc ? (
                        <span className="font-mono">{data.codigoUc}</span>
                      ) : (
                        <span className="italic text-muted-foreground">não informado</span>
                      )}
                      <button
                        type="button"
                        onClick={startEditUc}
                        title={data.codigoUc ? "Editar código UC" : "Adicionar código UC"}
                        className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                      >
                        <Pencil className="h-3 w-3" />
                        {data.codigoUc ? "Editar" : "Adicionar"}
                      </button>
                    </>
                  )}
                </div>
                {!data.codigoUc && !editingUc && (
                  <p className="text-xs text-amber-700 mt-1">
                    Cadastre o código UC para liberar o relatório Brasil Solar deste cliente.
                  </p>
                )}
              </div>
              {data.concessionaria && (
                <div>
                  <span className="text-muted-foreground">Concessionária:</span>{" "}
                  {data.concessionaria}
                </div>
              )}
              {data.latitude != null && data.longitude != null && (
                <div>
                  <span className="text-muted-foreground">Localização:</span>{" "}
                  <span className="font-mono">
                    {data.latitude.toFixed(5)}, {data.longitude.toFixed(5)}
                  </span>
                </div>
              )}
              {data.potenciaInstalada != null && (
                <div>
                  <span className="text-muted-foreground">Potência instalada:</span>{" "}
                  {formatNumber(data.potenciaInstalada)} kWp
                </div>
              )}
              {data.inversorPotencia != null && (
                <div>
                  <span className="text-muted-foreground">Pot. Inversor:</span>{" "}
                  {formatNumber(data.inversorPotencia)} kW
                </div>
              )}
              {data.numeroFases && (
                <div>
                  <span className="text-muted-foreground">Fases:</span>{" "}
                  {data.numeroFases}
                </div>
              )}
              {data.tipoAtendimento && (
                <div>
                  <span className="text-muted-foreground">Atendimento:</span>{" "}
                  {data.tipoAtendimento}
                </div>
              )}
              {(data.modulosMarca || data.modulosModelo) && (
                <div className="md:col-span-2">
                  <span className="text-muted-foreground">Módulo:</span>{" "}
                  {[data.modulosMarca, data.modulosModelo].filter(Boolean).join(" ")}
                </div>
              )}
              {data.modulosQuantidade != null && (
                <div>
                  <span className="text-muted-foreground">Qtd módulos:</span>{" "}
                  {data.modulosQuantidade}
                </div>
              )}
              {(data.inversorMarca || data.inversorModelo) && (
                <div className="md:col-span-2">
                  <span className="text-muted-foreground">Inversor:</span>{" "}
                  {[data.inversorMarca, data.inversorModelo].filter(Boolean).join(" ")}
                </div>
              )}
              {data.inversorQuantidade != null && (
                <div>
                  <span className="text-muted-foreground">Qtd inversores:</span>{" "}
                  {data.inversorQuantidade}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

      {/* Acesso à distribuidora + Faturas de energia.
          Só renderiza quando o codigoUc do proprietário foi cadastrado.
          Procura uma ConsumerUnit com mesmo código; se não existir, oferece atalho. */}
      {data.codigoUc && consumerUnitChecked && !consumerUnit && (
        <Card className="border-amber-200 dark:border-amber-900 bg-amber-50/40 dark:bg-amber-950/20">
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">
                UC <span className="font-mono">{data.codigoUc}</span> ainda não está cadastrada como Unidade Consumidora.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Cadastre a UC pra liberar acesso à distribuidora (Infosimples) e ver as faturas.
              </p>
            </div>
            <button
              type="button"
              onClick={criarConsumerUnit}
              disabled={creatingUc}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
            >
              {creatingUc ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Criar UC com este código
            </button>
          </CardContent>
        </Card>
      )}

      {consumerUnit && (
        <>
          <UcCredentialsForm
            consumerUnitId={consumerUnit.id}
            defaultInstalacao={data.codigoUc ?? ""}
            onSyncComplete={() => setBillsRefreshKey((k) => k + 1)}
          />
          <UcBills
            consumerUnitId={consumerUnit.id}
            refreshKey={billsRefreshKey}
          />
        </>
      )}

      {/* Usinas vinculadas */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <Building2 className="h-4 w-4" /> Usinas Vinculadas ({data.plantas.length})
            </CardTitle>
            <button
              onClick={() => { setShowLinkModal(true); setSearchTerm(""); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Vincular Usina
            </button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {data.plantas.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              Nenhuma usina vinculada a este proprietario
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="text-left py-2 px-3 font-medium">Nome</th>
                    <th className="text-left py-2 px-3 font-medium">Cidade/UF</th>
                    <th className="text-center py-2 px-3 font-medium">kWp</th>
                    <th className="text-center py-2 px-3 font-medium">Status</th>
                    <th className="text-right py-2 px-3 font-medium">Mes Atual</th>
                    <th className="text-center py-2 px-3 font-medium">PR</th>
                    <th className="text-center py-2 px-3 font-medium">Plano</th>
                    <th className="text-center py-2 px-3 font-medium w-20">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {data.plantas.map((p) => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="py-2 px-3">
                        <Link
                          href={`/admin/brasil-solar/${p.id}`}
                          className="font-medium hover:text-primary transition-colors"
                        >
                          {p.nome}
                        </Link>
                      </td>
                      <td className="py-2 px-3 text-muted-foreground">
                        {[p.cidade, p.uf].filter(Boolean).join("/") || "-"}
                      </td>
                      <td className="py-2 px-3 text-center">
                        {p.potenciaInstalada ? formatNumber(p.potenciaInstalada) : "-"}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <MonitoringStatusBadge status={p.statusMonitoramento} />
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-xs">
                        {p.geracaoMesAtual != null ? `${formatNumber(p.geracaoMesAtual)} kWh` : "-"}
                      </td>
                      <td className="py-2 px-3 text-center font-mono text-xs">
                        {p.performanceRatio != null ? `${formatNumber(p.performanceRatio)}%` : "-"}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <PlanoBadge
                          plans={p.monitoringPlans ?? []}
                          onClick={() => setPlanoModal({ clientId: p.id, nome: p.nome })}
                        />
                      </td>
                      <td className="py-2 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Link
                            href={`/admin/brasil-solar/${p.id}`}
                            className="p-1 text-muted-foreground hover:text-primary transition-colors rounded"
                            title="Ver detalhes"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                          <button
                            onClick={() => handleUnlink(p.id, p.nome)}
                            disabled={unlinking === p.id}
                            className="p-1 text-muted-foreground hover:text-red-600 transition-colors rounded disabled:opacity-50"
                            title="Desvincular usina"
                          >
                            {unlinking === p.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Unlink className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal Vincular Usina */}
      {showLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowLinkModal(false)}>
          <div
            className="bg-background rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <LinkIcon className="h-4 w-4 text-primary" />
                <h3 className="font-semibold">Vincular Usina</h3>
              </div>
              <button
                onClick={() => setShowLinkModal(false)}
                className="p-1 hover:bg-muted rounded transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Search */}
            <div className="p-4 border-b">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar cliente sem proprietario..."
                  className="w-full pl-9 pr-4 py-2 text-sm border rounded-lg bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                  autoFocus
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Mostrando clientes sem proprietario vinculado
              </p>
            </div>

            {/* Client List */}
            <div className="flex-1 overflow-y-auto p-2">
              {loadingClients ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : availableClients.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-sm">
                  {searchTerm
                    ? "Nenhum cliente encontrado para essa busca"
                    : "Todos os clientes ja possuem proprietario"}
                </div>
              ) : (
                <div className="space-y-1">
                  {availableClients.map((client) => (
                    <div
                      key={client.id}
                      className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{client.nome}</p>
                        <p className="text-xs text-muted-foreground">
                          {[
                            client.cidade && client.uf ? `${client.cidade}/${client.uf}` : client.cidade || client.uf,
                            client.potenciaInstalada ? `${formatNumber(client.potenciaInstalada)} kWp` : null,
                            client.plataformaMonitoramento,
                          ].filter(Boolean).join(" - ") || "Sem dados adicionais"}
                        </p>
                      </div>
                      <button
                        onClick={() => handleLink(client.id)}
                        disabled={linking === client.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-white rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 shrink-0 ml-3"
                      >
                        {linking === client.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <LinkIcon className="h-3 w-3" />
                        )}
                        Vincular
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t">
              <button
                onClick={() => setShowLinkModal(false)}
                className="w-full px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {planoModal && (
        <MonitoringPlanModal
          clientId={planoModal.clientId}
          clientNome={planoModal.nome}
          open={true}
          onClose={() => setPlanoModal(null)}
          onChanged={() => fetchData()}
        />
      )}
    </div>
  );
}

function PlanoBadge({
  plans,
  onClick,
}: {
  plans: { dataInicio: string; dataFim: string }[];
  onClick: () => void;
}) {
  const { status, ativo } = deriveStatus(plans);
  const meta: Record<MonitoringPlanStatus, { label: string; cls: string; Icon: React.ElementType }> = {
    VIGENTE: {
      label: "Vigente",
      cls: "bg-emerald-100 text-emerald-700 border-emerald-300 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300",
      Icon: ShieldCheck,
    },
    FUTURO: {
      label: "Futuro",
      cls: "bg-blue-100 text-blue-700 border-blue-300 hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-300",
      Icon: ShieldCheck,
    },
    VENCIDO: {
      label: "Vencido",
      cls: "bg-red-100 text-red-700 border-red-300 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300",
      Icon: ShieldAlert,
    },
    SEM_PLANO: {
      label: "Sem plano",
      cls: "bg-muted text-muted-foreground border-muted-foreground/30 hover:bg-muted/80",
      Icon: ShieldOff,
    },
  };
  const m = meta[status];
  const tooltip = ativo
    ? `${new Date(ativo.dataInicio).toLocaleDateString("pt-BR")} → ${new Date(ativo.dataFim).toLocaleDateString("pt-BR")}`
    : "Clique pra contratar";
  return (
    <button
      type="button"
      onClick={onClick}
      title={tooltip}
      className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium transition-colors ${m.cls}`}
    >
      <m.Icon className="h-3 w-3" />
      {m.label}
    </button>
  );
}

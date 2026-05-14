"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MonitoringStatusBadge } from "@/components/brasil-solar/status-badge";
import { GenerationChart, MonthlyComparisonChart } from "@/components/brasil-solar/generation-chart";
import { IntraDayChart } from "@/components/brasil-solar/intra-day-chart";
import { AlertPanel, CreateAlertForm } from "@/components/brasil-solar/alert-panel";
import { formatNumber } from "@/lib/formatters";
import {
  ArrowLeft,
  Sun,
  Cpu,
  MapPin,
  Phone,
  Mail,
  FileText,
  Calendar,
  Zap,
  TrendingUp,
  Activity,
  Settings,
  Edit,
  Wifi,
  Monitor,
  Eye,
  EyeOff,
  ExternalLink,
  Copy,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

interface MonitoringLog {
  id: string;
  data: string;
  geracaoDiaria: number;
  geracaoEsperada?: number | null;
  picoMaximo?: number | null;
  horasSol?: number | null;
}

interface Alert {
  id: string;
  tipo: string;
  severidade: string;
  titulo: string;
  descricao?: string | null;
  status: string;
  resolvidoPor?: string | null;
  resolvidoEm?: string | null;
  observacaoResolucao?: string | null;
  notificadoCliente: boolean;
  notificadoEngenharia: boolean;
  createdAt: string;
}

interface ClientDetail {
  id: string;
  nome: string;
  cpfCnpj?: string | null;
  email?: string | null;
  telefone?: string | null;
  endereco?: string | null;
  cidade?: string | null;
  uf?: string | null;
  bairro?: string | null;
  cep?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  potenciaInstalada?: number | null;
  dataInstalacao?: string | null;
  modulosMarca?: string | null;
  modulosModelo?: string | null;
  modulosQuantidade?: number | null;
  inversorMarca?: string | null;
  inversorModelo?: string | null;
  inversorQuantidade?: number | null;
  inversorPotencia?: number | null;
  plataformaMonitoramento?: string | null;
  monitoramentoLogin?: string | null;
  monitoramentoSenha?: string | null;
  monitoramentoUrl?: string | null;
  monitoramentoPlantId?: string | null;
  concessionaria?: string | null;
  codigoUc?: string | null;
  statusContrato?: string | null;
  dataContrato?: string | null;
  consultor?: string | null;
  garantiaAte?: string | null;
  geracaoMediaEsperada?: number | null;
  geracaoAnualEsperada?: number | null;
  geracaoContrato?: number | null;
  investimento?: number | null;
  statusMonitoramento: string;
  ultimaGeracao?: number | null;
  ultimaLeitura?: string | null;
  geracaoMesAtual?: number | null;
  performanceRatio?: number | null;
  observacoesInternas?: string | null;
  proprietario?: { id: string; nome: string; cpfCnpj?: string | null } | null;
  monitoringLogs: MonitoringLog[];
  alerts: Alert[];
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string | null }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-sm truncate">{value || "-"}</p>
      </div>
    </div>
  );
}

function formatDate(dateStr?: string | null) {
  if (!dateStr) return "-";
  return new Intl.DateTimeFormat("pt-BR").format(new Date(dateStr));
}

const contratoColors: Record<string, string> = {
  ATIVO: "bg-emerald-500",
  SUSPENSO: "bg-amber-500",
  CANCELADO: "bg-red-500",
  GARANTIA: "bg-blue-500",
};

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"geracao" | "intra-dia" | "alertas" | "info">("geracao");
  const [showSenha, setShowSenha] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const fetchClient = useCallback(async () => {
    try {
      const res = await fetch(`/api/brasil-solar/${id}`);
      if (res.ok) {
        const data = await res.json();
        setClient(data);
        return data as ClientDetail;
      } else {
        toast.error("Cliente nao encontrado");
        router.push("/admin/brasil-solar");
        return null;
      }
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  const syncMonitoring = useCallback(async (opts?: { fullHistory?: boolean }) => {
    if (!client) return;
    const platform = client.plataformaMonitoramento;
    const syncUrlMap: Record<string, string> = {
      FRONIUS: `/api/brasil-solar/${id}/fronius-sync`,
      HUAWEI: `/api/brasil-solar/${id}/huawei-sync`,
      SUNGROW: `/api/brasil-solar/${id}/sungrow-sync`,
      SOLAREDGE: `/api/brasil-solar/${id}/solaredge-sync`,
    };
    let syncUrl = platform ? syncUrlMap[platform] ?? null : null;
    if (syncUrl && opts?.fullHistory && platform === "SUNGROW") {
      syncUrl += "?fromInstall=1";
    }

    if (!syncUrl) return;

    setSyncing(true);
    try {
      const res = await fetch(syncUrl, { method: "POST" });
      if (res.ok) {
        const result = await res.json();
        setLastSync(new Date().toISOString());
        toast.success(`Dados atualizados: ${result.logsUpserted} registros`);
        await fetchClient();
      } else {
        const err = await res.json();
        if (!err.error?.includes("nao possui monitoramento")) {
          toast.error(err.error || "Erro ao sincronizar");
        }
      }
    } catch {
      toast.error(`Falha na conexao com ${platform}`);
    } finally {
      setSyncing(false);
    }
  }, [id, client, fetchClient]);

  const supportedPlatforms = ["FRONIUS", "HUAWEI", "SUNGROW", "SOLAREDGE"];

  useEffect(() => {
    fetchClient().then((data) => {
      if (!data) return;
      // Auto-sync se plataforma suportada e dados estão vazios ou desatualizados (>12h)
      if (data.plataformaMonitoramento && supportedPlatforms.includes(data.plataformaMonitoramento) && data.monitoramentoPlantId) {
        const hasData = data.monitoringLogs.length > 0;
        const isStale = data.ultimaLeitura
          ? (Date.now() - new Date(data.ultimaLeitura).getTime()) > 12 * 60 * 60 * 1000
          : true;
        if (!hasData || isStale) {
          // Defer sync to after client state is set
          setTimeout(() => syncMonitoring(), 100);
        }
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 bg-muted rounded animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-48 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!client) return null;

  const last30Days = client.monitoringLogs.filter((log) => {
    const d = new Date(log.data);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return d >= thirtyDaysAgo;
  });

  const avgDaily = last30Days.length > 0
    ? last30Days.reduce((s, l) => s + l.geracaoDiaria, 0) / last30Days.length
    : 0;

  const maxDaily = last30Days.length > 0
    ? Math.max(...last30Days.map((l) => l.geracaoDiaria))
    : 0;

  const openAlerts = client.alerts.filter((a) => a.status === "ABERTO" || a.status === "EM_ANDAMENTO").length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/brasil-solar"
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">{client.nome}</h1>
              <MonitoringStatusBadge status={client.statusMonitoramento} />
              {client.statusContrato && (
                <Badge className={contratoColors[client.statusContrato] || "bg-gray-500"}>
                  {client.statusContrato}
                </Badge>
              )}
            </div>
            {client.proprietario && (
              <p className="text-xs">
                <span className="text-muted-foreground">Proprietario: </span>
                <Link
                  href={`/admin/brasil-solar/proprietarios/${client.proprietario.id}`}
                  className="text-primary hover:underline"
                >
                  {client.proprietario.nome}
                </Link>
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              {[client.cidade, client.uf].filter(Boolean).join("/")}
              {client.potenciaInstalada && ` - ${formatNumber(client.potenciaInstalada)} kWp`}
              {client.plataformaMonitoramento && ` - ${client.plataformaMonitoramento}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {client.plataformaMonitoramento && supportedPlatforms.includes(client.plataformaMonitoramento) && (
            <>
              <button
                onClick={() => syncMonitoring()}
                disabled={syncing}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg hover:bg-muted disabled:opacity-50 transition-colors"
              >
                {syncing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                {syncing ? "Sincronizando..." : `Atualizar ${client.plataformaMonitoramento} (3 meses)`}
              </button>
              {client.plataformaMonitoramento === "SUNGROW" && (
                <button
                  onClick={() => {
                    if (confirm("Importar histórico completo desde a instalação?\n\nIsso pode levar 10+ minutos dependendo do tempo de operação. Mantenha essa aba aberta.")) {
                      syncMonitoring({ fullHistory: true });
                    }
                  }}
                  disabled={syncing}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg hover:bg-muted disabled:opacity-50 transition-colors"
                  title="Puxa todo histórico de geração desde a data de instalação"
                >
                  <Calendar className="h-3.5 w-3.5" />
                  Histórico completo
                </button>
              )}
            </>
          )}
          <Link
            href={`/admin/brasil-solar/${id}/editar`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg hover:bg-muted transition-colors"
          >
            <Edit className="h-3.5 w-3.5" />
            Editar
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="h-4 w-4 text-green-600" />
              <span className="text-[10px] text-muted-foreground uppercase">Geracao Mes</span>
            </div>
            <p className="text-lg font-bold">
              {client.geracaoMesAtual != null ? `${formatNumber(client.geracaoMesAtual)} kWh` : "-"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-cyan-600" />
              <span className="text-[10px] text-muted-foreground uppercase">Media Diaria 30d</span>
            </div>
            <p className="text-lg font-bold">
              {avgDaily > 0 ? `${formatNumber(avgDaily)} kWh` : "-"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="h-4 w-4 text-amber-600" />
              <span className="text-[10px] text-muted-foreground uppercase">Performance Ratio</span>
            </div>
            <p className={`text-lg font-bold ${
              client.performanceRatio != null
                ? client.performanceRatio >= 90 ? "text-emerald-600" : client.performanceRatio >= 70 ? "text-amber-600" : "text-red-600"
                : ""
            }`}>
              {client.performanceRatio != null ? `${formatNumber(client.performanceRatio)}%` : "-"}
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
              {maxDaily > 0 ? `${formatNumber(maxDaily)} kWh` : "-"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {[
          { key: "geracao", label: "Geração", icon: Zap },
          { key: "intra-dia", label: "Curva diária", icon: Sun },
          { key: "alertas", label: `Alertas${openAlerts > 0 ? ` (${openAlerts})` : ""}`, icon: Activity },
          { key: "info", label: "Informações", icon: Settings },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key as typeof activeTab)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "geracao" && (
        <div className="space-y-4">
          {syncing && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg px-4 py-2.5">
              <Loader2 className="h-4 w-4 animate-spin" />
              Buscando dados de geracao via {client.plataformaMonitoramento} (ultimos 3 meses)...
            </div>
          )}
          <GenerationChart
            logs={client.monitoringLogs}
            geracaoMediaEsperada={client.geracaoMediaEsperada}
          />
          <MonthlyComparisonChart logs={client.monitoringLogs} />
        </div>
      )}

      {activeTab === "intra-dia" && (
        <div className="space-y-4">
          {client.plataformaMonitoramento === "SUNGROW" ? (
            <IntraDayChart clientId={client.id} />
          ) : (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                Curva intra-diária disponível apenas para clientes com monitoramento Sungrow.
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === "alertas" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <AlertPanel
              alerts={client.alerts}
              clientId={client.id}
              onUpdate={fetchClient}
            />
          </div>
          <div>
            <CreateAlertForm clientId={client.id} onCreated={fetchClient} />
          </div>
        </div>
      )}

      {activeTab === "info" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Dados Pessoais */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Dados do Cliente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <InfoRow icon={FileText} label="CPF/CNPJ" value={client.cpfCnpj} />
              <InfoRow icon={Mail} label="Email" value={client.email} />
              <InfoRow icon={Phone} label="Telefone" value={client.telefone} />
              <InfoRow icon={MapPin} label="Endereco" value={client.endereco} />
              <InfoRow icon={MapPin} label="Bairro" value={client.bairro} />
              <InfoRow icon={MapPin} label="CEP" value={client.cep} />
              <InfoRow icon={MapPin} label="Cidade/UF" value={[client.cidade, client.uf].filter(Boolean).join("/")} />
              <InfoRow icon={MapPin} label="Latitude" value={client.latitude != null ? client.latitude.toString() : null} />
              <InfoRow icon={MapPin} label="Longitude" value={client.longitude != null ? client.longitude.toString() : null} />
            </CardContent>
          </Card>

          {/* Instalacao */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Instalacao</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <InfoRow icon={Sun} label="Potencia Instalada" value={client.potenciaInstalada ? `${formatNumber(client.potenciaInstalada)} kWp` : null} />
              <InfoRow icon={Calendar} label="Data Instalacao" value={formatDate(client.dataInstalacao)} />
              <InfoRow icon={Sun} label="Modulos" value={
                client.modulosMarca
                  ? `${client.modulosMarca} ${client.modulosModelo || ""} (${client.modulosQuantidade || "?"} un)`
                  : null
              } />
              <InfoRow icon={Cpu} label="Inversor" value={
                client.inversorMarca
                  ? `${client.inversorMarca} ${client.inversorModelo || ""} (${client.inversorQuantidade || "?"} un)`
                  : null
              } />
              <InfoRow icon={Zap} label="Pot. Inversor" value={client.inversorPotencia ? `${formatNumber(client.inversorPotencia)} kW` : null} />
              <InfoRow icon={TrendingUp} label="Geracao Esperada" value={client.geracaoMediaEsperada ? `${formatNumber(client.geracaoMediaEsperada)} kWh/mes` : null} />
              <InfoRow icon={TrendingUp} label="Geracao Anual Esperada" value={client.geracaoAnualEsperada ? `${formatNumber(client.geracaoAnualEsperada)} kWh/ano` : null} />
              <InfoRow icon={FileText} label="Geracao de Contrato" value={client.geracaoContrato ? `${formatNumber(client.geracaoContrato)} kWh` : null} />
              <InfoRow icon={Zap} label="Investimento" value={client.investimento ? `R$ ${formatNumber(client.investimento)}` : null} />
            </CardContent>
          </Card>

          {/* Monitoramento e Concessionaria */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Monitoramento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <InfoRow icon={Wifi} label="Plataforma" value={client.plataformaMonitoramento} />
              {client.monitoramentoUrl && (
                <div className="flex items-start gap-2 py-1.5">
                  <Settings className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Portal</p>
                    <a
                      href={client.monitoramentoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline"
                    >
                      Abrir portal
                    </a>
                  </div>
                </div>
              )}
              <InfoRow icon={FileText} label="Concessionaria" value={client.concessionaria} />
              <InfoRow icon={FileText} label="Codigo UC" value={client.codigoUc} />
              <InfoRow icon={Calendar} label="Contrato" value={formatDate(client.dataContrato)} />
              <InfoRow icon={FileText} label="Consultor" value={client.consultor} />
              <InfoRow icon={Calendar} label="Garantia ate" value={formatDate(client.garantiaAte)} />
            </CardContent>
          </Card>

          {/* Observacoes */}
          {client.observacoesInternas && (
            <Card className="md:col-span-2 lg:col-span-3">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Observacoes Internas</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{client.observacoesInternas}</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Acesso ao Monitoramento - sempre visivel na parte inferior */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Monitor className="h-4 w-4 text-blue-600" />
            Acesso ao Monitoramento
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 text-sm">
            <div className="flex flex-col gap-0.5">
              <span className="text-muted-foreground">Plataforma</span>
              <span className="font-semibold">{client.plataformaMonitoramento ?? "-"}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-muted-foreground">Login</span>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{client.monitoramentoLogin ?? "-"}</span>
                {client.monitoramentoLogin && (
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      navigator.clipboard.writeText(client.monitoramentoLogin!);
                      toast.success("Login copiado");
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-muted-foreground">Senha</span>
              <div className="flex items-center gap-2">
                <span className="font-semibold">
                  {client.monitoramentoSenha
                    ? showSenha ? client.monitoramentoSenha : "••••••••"
                    : "-"}
                </span>
                {client.monitoramentoSenha && (
                  <>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => setShowSenha(!showSenha)}
                    >
                      {showSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        navigator.clipboard.writeText(client.monitoramentoSenha!);
                        toast.success("Senha copiada");
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-muted-foreground">Plant ID</span>
              <span className="font-semibold">{client.monitoramentoPlantId ?? "-"}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-muted-foreground">URL do Portal</span>
              {client.monitoramentoUrl ? (
                <a
                  href={client.monitoramentoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-blue-600 hover:underline flex items-center gap-1"
                >
                  Acessar <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <span className="font-semibold">-</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

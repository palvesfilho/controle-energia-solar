"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  MapPin,
  Loader2,
  Users,
  Zap,
  Wifi,
  WifiOff,
  AlertTriangle,
  CircleOff,
  HelpCircle,
  Clock,
  ShieldAlert,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { formatNumber } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { MapaMarker } from "@/components/brasil-solar/mapa-leaflet";

const MapaLeaflet = dynamic(
  () => import("@/components/brasil-solar/mapa-leaflet").then((m) => m.MapaLeaflet),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Carregando mapa...
      </div>
    ),
  }
);

interface Stats {
  totalClientes: number;
  statusDistribution: {
    online: number;
    offline: number;
    alerta: number;
    semDados: number;
  };
  geracao: {
    mesAtual: number;
    hoje: number;
  };
}

interface UsinaComErro {
  id: string;
  nome: string;
  cidade: string | null;
  uf: string | null;
  statusMonitoramento: string;
  potenciaInstalada: number | null;
  ultimaLeitura: string | null;
  latitude: number | null;
  longitude: number | null;
}

type StatusFilter = "TODOS" | "OFFLINE" | "ALERTA" | "SEM_DADOS";

const STATUS_META: Record<
  string,
  { label: string; dot: string; icon: React.ElementType; border: string }
> = {
  OFFLINE: {
    label: "Offline",
    dot: "bg-red-500",
    icon: CircleOff,
    border: "border-l-red-500",
  },
  ALERTA: {
    label: "Alerta",
    dot: "bg-amber-500",
    icon: AlertTriangle,
    border: "border-l-amber-500",
  },
  SEM_DADOS: {
    label: "Sem dados",
    dot: "bg-gray-400",
    icon: HelpCircle,
    border: "border-l-gray-400",
  },
};

function KpiCard({
  icon: Icon,
  label,
  value,
  iconClass,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  iconClass: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1.5">
          <Icon className={`h-4 w-4 ${iconClass}`} />
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
            {label}
          </span>
        </div>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function timeAgo(iso: string | null): string {
  if (!iso) return "sem leituras";
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  if (diff < 0) return "agora";
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `há ${d}d`;
  const mo = Math.floor(d / 30);
  return `há ${mo} mês${mo > 1 ? "es" : ""}`;
}

function ErrorListItem({
  usina,
  selected,
  onClick,
}: {
  usina: UsinaComErro;
  selected: boolean;
  onClick: () => void;
}) {
  const meta = STATUS_META[usina.statusMonitoramento] ?? STATUS_META.SEM_DADOS;
  const Icon = meta.icon;
  const hasCoords = usina.latitude != null && usina.longitude != null;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!hasCoords}
      className={cn(
        "w-full text-left border-l-4 border border-border rounded-md p-3 transition-colors",
        meta.border,
        selected
          ? "bg-accent"
          : "bg-card hover:bg-accent/50",
        !hasCoords && "opacity-60 cursor-not-allowed"
      )}
      title={hasCoords ? "Clique para focar no mapa" : "Usina sem coordenadas cadastradas"}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm truncate">{usina.nome}</div>
          {(usina.cidade || usina.uf) && (
            <div className="text-xs text-muted-foreground truncate">
              {usina.cidade}
              {usina.cidade && usina.uf ? " / " : ""}
              {usina.uf}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs font-medium shrink-0">
          <Icon className="h-3.5 w-3.5" />
          {meta.label}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {timeAgo(usina.ultimaLeitura)}
        </span>
        {usina.potenciaInstalada != null && (
          <span>{usina.potenciaInstalada} kWp</span>
        )}
      </div>
    </button>
  );
}

export default function MapaUsinasPage() {
  const searchParams = useSearchParams();
  const focusId = searchParams.get("focus");
  const [markers, setMarkers] = useState<MapaMarker[]>([]);
  const [plantasComErro, setPlantasComErro] = useState<UsinaComErro[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(focusId);
  const [filter, setFilter] = useState<StatusFilter>("TODOS");
  const [alertasCount, setAlertasCount] = useState<{
    total: number;
    critica: number;
  } | null>(null);

  // Sincroniza selectedId quando o usuário chega via /mapa?focus=usinaId.
  useEffect(() => {
    if (focusId) setSelectedId(focusId);
  }, [focusId]);

  useEffect(() => {
    Promise.all([
      fetch("/api/brasil-solar/mapa").then((r) =>
        r.ok ? r.json() : Promise.reject(new Error("Falha no mapa"))
      ),
      fetch("/api/brasil-solar/stats").then((r) =>
        r.ok ? r.json() : Promise.reject(new Error("Falha nos stats"))
      ),
    ])
      .then(([mapaData, statsData]) => {
        setMarkers(mapaData.clients ?? []);
        setPlantasComErro(mapaData.plantasComErro ?? []);
        setStats(statsData);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));

    fetch("/api/brasil-solar/alertas-usinas")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setAlertasCount({
            total: d.total ?? 0,
            critica: d.counts?.CRITICA ?? 0,
          });
        }
      })
      .catch(() => {});
  }, []);

  const filteredErros = useMemo(
    () =>
      filter === "TODOS"
        ? plantasComErro
        : plantasComErro.filter((p) => p.statusMonitoramento === filter),
    [plantasComErro, filter]
  );

  const counts = useMemo(() => {
    const c = { OFFLINE: 0, ALERTA: 0, SEM_DADOS: 0 };
    for (const p of plantasComErro) {
      if (p.statusMonitoramento in c) {
        c[p.statusMonitoramento as keyof typeof c]++;
      }
    }
    return c;
  }, [plantasComErro]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <MapPin className="h-6 w-6 text-green-600" />
        <div>
          <h1 className="text-2xl font-bold">Mapa de Usinas</h1>
          <p className="text-muted-foreground">
            Localização geográfica e status das usinas Brasil Solar
          </p>
        </div>
      </div>

      <Link
        href="/admin/brasil-solar/erros-usinas"
        className={cn(
          buttonVariants({ variant: "outline" }),
          "w-full h-auto justify-between gap-3 py-3 px-4 text-left",
          alertasCount && alertasCount.critica > 0
            ? "border-red-300 bg-red-50 hover:bg-red-100 text-red-900 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-100 dark:hover:bg-red-900/30"
            : alertasCount && alertasCount.total > 0
              ? "border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-100 dark:hover:bg-amber-900/30"
              : ""
        )}
      >
        <span className="flex items-center gap-3">
          <ShieldAlert className="h-5 w-5" />
          <span className="flex flex-col items-start">
            <span className="text-sm font-semibold uppercase tracking-wide">
              Visualizar erros em usinas
            </span>
            <span className="text-xs text-muted-foreground font-normal">
              {alertasCount
                ? alertasCount.total === 0
                  ? "Nenhum alerta em aberto"
                  : `${alertasCount.total} ${alertasCount.total === 1 ? "alerta" : "alertas"} em aberto${
                      alertasCount.critica > 0
                        ? ` — ${alertasCount.critica} crítico${alertasCount.critica > 1 ? "s" : ""}`
                        : ""
                    }`
                : "Carregando..."}
            </span>
          </span>
        </span>
        <span className="flex items-center gap-2">
          {alertasCount && alertasCount.critica > 0 && (
            <span className="rounded-full bg-red-500 text-white text-xs font-bold px-2 py-0.5">
              {alertasCount.critica}
            </span>
          )}
          <span className="text-xs font-medium">Abrir página</span>
          <ChevronRight className="h-4 w-4" />
        </span>
      </Link>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard
          icon={Users}
          label="Clientes"
          value={stats ? formatNumber(stats.totalClientes) : "-"}
          iconClass="text-blue-600"
        />
        <KpiCard
          icon={Zap}
          label="Energia Gerada (mês)"
          value={stats ? `${formatNumber(stats.geracao.mesAtual)} kWh` : "-"}
          iconClass="text-amber-600"
        />
        <KpiCard
          icon={Wifi}
          label="Usinas Online"
          value={stats ? formatNumber(stats.statusDistribution.online) : "-"}
          iconClass="text-emerald-600"
        />
        <KpiCard
          icon={WifiOff}
          label="Usinas Offline"
          value={stats ? formatNumber(stats.statusDistribution.offline) : "-"}
          iconClass="text-red-600"
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-100">
          Erro ao carregar mapa: {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card className="flex flex-col h-[600px]">
          <div className="p-3 border-b">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <h2 className="font-semibold text-sm">Usinas com erro</h2>
              <span className="ml-auto text-xs text-muted-foreground">
                {filteredErros.length}
              </span>
            </div>
            <div className="flex gap-1 flex-wrap">
              {(
                [
                  { key: "TODOS", label: `Todos (${plantasComErro.length})` },
                  { key: "OFFLINE", label: `Offline (${counts.OFFLINE})` },
                  { key: "ALERTA", label: `Alerta (${counts.ALERTA})` },
                  { key: "SEM_DADOS", label: `Sem dados (${counts.SEM_DADOS})` },
                ] as { key: StatusFilter; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setFilter(opt.key)}
                  className={cn(
                    "text-xs px-2 py-1 rounded-full border transition-colors",
                    filter === opt.key
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background hover:bg-accent"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {loading && (
              <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Carregando...
              </div>
            )}
            {!loading && filteredErros.length === 0 && (
              <div className="text-center py-8 text-sm text-muted-foreground">
                {plantasComErro.length === 0
                  ? "Nenhuma usina com erro no momento."
                  : "Nenhuma usina corresponde ao filtro."}
              </div>
            )}
            {filteredErros.map((u) => (
              <ErrorListItem
                key={u.id}
                usina={u}
                selected={selectedId === u.id}
                onClick={() => setSelectedId(u.id)}
              />
            ))}
          </div>
        </Card>

        <div className="h-[600px] overflow-hidden rounded-lg border">
          {!loading && markers.length === 0 && !error ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
              Nenhuma usina com coordenadas (latitude/longitude) cadastrada.
              Edite o cadastro de uma usina e informe latitude/longitude para ver o pin aqui.
            </div>
          ) : (
            <MapaLeaflet markers={markers} selectedId={selectedId} />
          )}
        </div>
      </div>

    </div>
  );
}

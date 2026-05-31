"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Battery,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  FileWarning,
  Filter,
  Gauge,
  History,
  Hourglass,
  Loader2,
  Minus,
  PlugZap,
  RefreshCw,
  Lightbulb,
  Timer,
  Undo2,
  Upload,
  X,
  Zap,
} from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RcTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { formatBRL, formatKWh } from "@/lib/formatters";
import type {
  AcaoRecomendada,
  AcaoTipo,
  AnaliseCreditosResult,
  PlantHealthRow,
  Severidade,
  TrendValue,
} from "@/lib/analise-creditos";
import type { AcaoPersistida } from "@/lib/acoes-persistencia";
import type { Sugestao } from "@/lib/sugestoes-acoes";

type AcaoAny = AcaoRecomendada | AcaoPersistida;
function isPersistida(a: AcaoAny): a is AcaoPersistida {
  return "id" in a && "status" in a && "fingerprint" in a;
}

type StatusAcao = AcaoPersistida["status"];
const STATUS_BADGE: Record<StatusAcao, string> = {
  ABERTA: "bg-slate-100 text-slate-700 border-slate-200",
  FEITA: "bg-emerald-100 text-emerald-800 border-emerald-200",
  DISPENSADA: "bg-zinc-100 text-zinc-600 border-zinc-200",
  AUTO_FECHADA: "bg-zinc-100 text-zinc-600 border-zinc-200",
};
const STATUS_LABEL: Record<StatusAcao, string> = {
  ABERTA: "Aberta",
  FEITA: "Feita",
  DISPENSADA: "Dispensada",
  AUTO_FECHADA: "Auto-fechada",
};

interface UserAtribuivel {
  id: string;
  name: string;
  role: string;
}

interface PlantOption {
  id: string;
  name: string;
}
interface InvestorOption {
  id: string;
  name: string;
}

const SEVERIDADE_BADGE: Record<Severidade, string> = {
  critico: "bg-red-100 text-red-800 border-red-200",
  atencao: "bg-amber-100 text-amber-800 border-amber-200",
  info: "bg-blue-100 text-blue-800 border-blue-200",
};
const SEVERIDADE_LABEL: Record<Severidade, string> = {
  critico: "Crítico",
  atencao: "Atenção",
  info: "Informativo",
};
const SEVERIDADE_BAR: Record<Severidade, string> = {
  critico: "bg-red-500",
  atencao: "bg-amber-500",
  info: "bg-blue-500",
};
const STATUS_DOT: Record<PlantHealthRow["status"], string> = {
  critico: "bg-red-500",
  atencao: "bg-amber-500",
  ok: "bg-emerald-500",
};

const TIPO_LABEL: Record<AcaoTipo, string> = {
  CREDITOS_VENCENDO_30D: "Créditos vencendo",
  USINA_SUBPERFORMANDO: "Usina subperformando",
  UC_SEM_FATURA_MES: "Sem fatura do mês",
  USINA_SEM_RATEIO_VIGENTE: "Sem rateio vigente",
  USINA_OFFLINE_30D: "Monitoramento offline",
  CONSUMO_ANOMALO: "Consumo anômalo",
  OPORTUNIDADE_CAPTACAO: "Oportunidade de captação",
};

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function formatHora(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function formatPct(p: number | null, digits = 0): string {
  if (p == null) return "—";
  return `${(p * 100).toFixed(digits)}%`;
}
function formatDeltaPct(p: number | null): string {
  if (p == null) return "—";
  const sign = p > 0 ? "+" : "";
  return `${sign}${(p * 100).toFixed(0)}%`;
}

function TrendBadge({ trend, invert = false }: { trend: TrendValue; invert?: boolean }) {
  // invert=true quando "subir" é ruim (ex.: vencendo, ações abertas)
  const { direcao, deltaPct } = trend;
  if (direcao === "na") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
        sem comparativo
      </span>
    );
  }
  const goodDir = invert ? "down" : "up";
  const cls =
    direcao === "flat"
      ? "text-slate-500"
      : direcao === goodDir
        ? "text-emerald-600"
        : "text-red-600";
  const Icon =
    direcao === "up"
      ? ArrowUpRight
      : direcao === "down"
        ? ArrowDownRight
        : Minus;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${cls}`}>
      <Icon className="h-3 w-3" />
      {formatDeltaPct(deltaPct)} vs mês anterior
    </span>
  );
}

function Sparkline({
  data,
  color = "#10b981",
  width = 80,
  height = 28,
}: {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const step = data.length > 1 ? width / (data.length - 1) : 0;
  const points = data
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const last = data[data.length - 1];
  const lastX = (data.length - 1) * step;
  const lastY = height - ((last - min) / range) * height;
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
      <circle cx={lastX} cy={lastY} r="2" fill={color} />
    </svg>
  );
}

function CardKpiRico({
  label,
  icon: Icon,
  tone,
  valuePrimary,
  valueSecondary,
  sub,
  trend,
  trendInvert,
  sparkline,
  sparklineColor,
  rightExtra,
  loading,
  cta,
}: {
  label: string;
  icon: React.ElementType;
  tone: "neutral" | "info" | "warn" | "danger" | "success";
  valuePrimary?: string;
  valueSecondary?: string;
  sub?: string;
  trend?: TrendValue;
  trendInvert?: boolean;
  sparkline?: number[];
  sparklineColor?: string;
  rightExtra?: React.ReactNode;
  loading?: boolean;
  cta?: { href: string; label: string };
}) {
  const bar = {
    neutral: "bg-slate-400",
    info: "bg-blue-500",
    warn: "bg-amber-500",
    danger: "bg-red-500",
    success: "bg-emerald-500",
  }[tone];
  return (
    <Card className="relative overflow-hidden">
      <span className={`absolute inset-y-0 left-0 w-1 ${bar}`} aria-hidden />
      <CardContent className="p-4 pl-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <Icon className="h-3.5 w-3.5" />
            {label}
          </div>
          {sparkline && sparkline.length > 1 && (
            <Sparkline data={sparkline} color={sparklineColor} />
          )}
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <div className="text-2xl font-bold tabular-nums">
            {loading ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : (
              (valuePrimary ?? "—")
            )}
          </div>
          {valueSecondary && !loading && (
            <div className="text-sm text-muted-foreground tabular-nums">
              {valueSecondary}
            </div>
          )}
        </div>
        {sub && !loading && (
          <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
        )}
        {trend && !loading && (
          <div className="mt-1.5">
            <TrendBadge trend={trend} invert={trendInvert} />
          </div>
        )}
        {rightExtra && !loading && <div className="mt-2">{rightExtra}</div>}
        {cta && !loading && (
          <Link
            href={cta.href}
            className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
          >
            {cta.label}
            <ChevronRight className="h-3 w-3" />
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

export default function AnaliseCreditosPage() {
  const now = useMemo(() => new Date(), []);
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [ano, setAno] = useState(now.getFullYear());
  const [data, setData] = useState<AnaliseCreditosResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [plantId, setPlantId] = useState<string>("");
  const [investorId, setInvestorId] = useState<string>("");
  const [plants, setPlants] = useState<PlantOption[]>([]);
  const [investors, setInvestors] = useState<InvestorOption[]>([]);
  const [showFaltantes, setShowFaltantes] = useState(false);
  const [filtroTipo, setFiltroTipo] = useState<AcaoTipo | "">("");
  const [filtroSev, setFiltroSev] = useState<Severidade | "">("");
  const [filtroStatus, setFiltroStatus] = useState<StatusAcao | "">("ABERTA");
  const [showSaude, setShowSaude] = useState(true);
  const [users, setUsers] = useState<UserAtribuivel[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [view, setView] = useState<"atual" | "historico">("atual");

  useEffect(() => {
    fetch("/api/plants")
      .then((r) => (r.ok ? r.json() : []))
      .then((arr) => {
        if (Array.isArray(arr)) {
          setPlants(
            arr.map((p: { id: string; name: string }) => ({
              id: p.id,
              name: p.name,
            })),
          );
        }
      })
      .catch(() => {});
    fetch("/api/investors")
      .then((r) => (r.ok ? r.json() : []))
      .then((arr) => {
        if (Array.isArray(arr)) {
          setInvestors(
            arr
              .map(
                (i: {
                  id: string;
                  nomeEmpresa?: string | null;
                  user?: { name?: string | null } | null;
                }) => ({
                  id: i.id,
                  name: i.nomeEmpresa || i.user?.name || "(sem nome)",
                }),
              )
              .sort((a: InvestorOption, b: InvestorOption) =>
                a.name.localeCompare(b.name),
              ),
          );
        }
      })
      .catch(() => {});
    fetch("/api/admin/gestao-creditos/users-atribuiveis")
      .then((r) => (r.ok ? r.json() : []))
      .then((arr) => {
        if (Array.isArray(arr)) setUsers(arr as UserAtribuivel[]);
      })
      .catch(() => {});
  }, []);

  const updateAcao = async (
    id: string,
    body: { status?: StatusAcao; responsavelUserId?: string | null; observacaoResolucao?: string | null },
  ) => {
    setSavingId(id);
    try {
      const res = await fetch(`/api/admin/gestao-creditos/acoes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || `HTTP ${res.status}`);
      }
      // Recarrega análise pra trazer ações com estado atualizado
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingId(null);
    }
  };

  const load = () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ mes: String(mes), ano: String(ano) });
    if (plantId) params.set("plantId", plantId);
    if (investorId) params.set("investorId", investorId);
    fetch(`/api/admin/gestao-creditos/analise?${params.toString()}`)
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)),
      )
      .then((payload: AnaliseCreditosResult) => setData(payload))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [plantId, investorId, mes, ano]);

  useEffect(() => {
    setShowFaltantes(false);
  }, [mes, ano, plantId, investorId]);

  const cards = data?.cards;
  const completude = data?.completude;

  const saldoTone =
    cards && cards.creditosDisponiveis.kwh > 0 ? "success" : "neutral";
  const vencendoTone =
    cards && cards.vencendo30d.kwh >= 500
      ? "danger"
      : cards && cards.vencendo30d.kwh > 0
        ? "warn"
        : "neutral";
  const efTone =
    cards?.eficienciaMedia.pct == null
      ? "neutral"
      : cards.eficienciaMedia.pct < 0.7
        ? "danger"
        : cards.eficienciaMedia.pct < 0.8
          ? "warn"
          : "success";
  const semCobTone =
    cards && cards.ucsSemCobertura.count > 0 ? "warn" : "success";

  const acoesFiltradas = useMemo<AcaoAny[]>(() => {
    let lista: AcaoAny[] = (data?.acoes ?? []).filter(
      (a) => a.tipo !== "UC_SEM_FATURA_MES",
    );
    if (filtroTipo) lista = lista.filter((a) => a.tipo === filtroTipo);
    if (filtroSev) lista = lista.filter((a) => a.severidade === filtroSev);
    if (filtroStatus) {
      lista = lista.filter((a) =>
        isPersistida(a) ? a.status === filtroStatus : filtroStatus === "ABERTA",
      );
    }
    return lista;
  }, [data, filtroTipo, filtroSev, filtroStatus]);

  const acoesAgrupadas = useMemo(() => {
    const grupos: Record<30 | 60 | 90, AcaoAny[]> = { 30: [], 60: [], 90: [] };
    for (const a of acoesFiltradas) grupos[a.prazoDias].push(a);
    return grupos;
  }, [acoesFiltradas]);

  const contagemPorStatus = useMemo(() => {
    const cont: Record<StatusAcao, number> = {
      ABERTA: 0,
      FEITA: 0,
      DISPENSADA: 0,
      AUTO_FECHADA: 0,
    };
    for (const a of data?.acoes ?? []) {
      if (a.tipo === "UC_SEM_FATURA_MES") continue;
      if (isPersistida(a)) cont[a.status]++;
      else cont.ABERTA++; // fallback quando vem on-the-fly (com filtro de escopo)
    }
    return cont;
  }, [data]);

  const exportCsv = () => {
    if (!data) return;
    const rows = [
      [
        "tipo",
        "severidade",
        "prazoDias",
        "titulo",
        "descricao",
        "plantName",
        "consumerUnitCodigo",
        "metricaValor",
        "metricaLabel",
      ],
      ...data.acoes.map((a) => [
        a.tipo,
        a.severidade,
        String(a.prazoDias),
        a.titulo,
        a.descricao,
        a.plantName ?? "",
        a.consumerUnitCodigo ?? "",
        a.metricaValor != null ? String(a.metricaValor.toFixed(2)) : "",
        a.metricaLabel ?? "",
      ]),
    ];
    const csv = rows
      .map((r) =>
        r
          .map((c) => {
            const s = String(c).replace(/"/g, '""');
            return /[",\n;]/.test(s) ? `"${s}"` : s;
          })
          .join(";"),
      )
      .join("\n");
    const blob = new Blob(["﻿" + csv], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `analise-creditos-${ano}-${String(mes).padStart(2, "0")}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (view === "historico") {
    return (
      <HistoricoView
        onVoltar={() => setView("atual")}
        onSelectMes={(m, a) => {
          setMes(m);
          setAno(a);
          setView("atual");
        }}
      />
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 text-white">
            <Activity className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Análise de Créditos</h1>
            <p className="text-sm text-muted-foreground">
              Indicadores, tendência e ações pros próximos 90 dias.
              {data && (
                <span className="ml-2 text-xs">
                  Atualizado às {formatHora(data.geradoEm)} · R${" "}
                  {data.precoMedioKwhReais.toFixed(2)}/kWh (referência)
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {[
            { v: mes, set: setMes, opts: MESES.map((m, i) => ({ v: i + 1, l: m })) },
            { v: ano, set: setAno, opts: [ano - 2, ano - 1, ano, ano + 1].map((y) => ({ v: y, l: String(y) })) },
          ].map((sel, idx) => (
            <div key={idx} className="relative">
              <select
                value={sel.v}
                onChange={(e) => sel.set(Number(e.target.value))}
                className="appearance-none text-sm border rounded-lg pl-3 pr-8 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
              >
                {sel.opts.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.l}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          ))}
          <div className="relative">
            <select
              value={plantId}
              onChange={(e) => setPlantId(e.target.value)}
              className="appearance-none text-sm border rounded-lg pl-3 pr-8 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            >
              <option value="">Todas as usinas</option>
              {plants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>
          <div className="relative">
            <select
              value={investorId}
              onChange={(e) => setInvestorId(e.target.value)}
              className="appearance-none text-sm border rounded-lg pl-3 pr-8 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            >
              <option value="">Todos os investidores</option>
              {investors.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium hover:bg-muted/50 transition-colors disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Atualizar
          </button>
          <button
            type="button"
            onClick={() => setView("historico")}
            className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium hover:bg-muted/50 transition-colors"
            title="Ver histórico mês a mês"
          >
            <History className="h-4 w-4" />
            Histórico
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          Falha ao carregar análise: {error}
        </div>
      )}

      {completude && (
        <BannerCompletude
          completude={completude}
          showFaltantes={showFaltantes}
          onToggle={() => setShowFaltantes((v) => !v)}
        />
      )}

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Indicadores — {MESES[mes - 1]} de {ano}
            {completude && !completude.completo && (
              <span className="ml-2 text-amber-700 normal-case">
                · prévia parcial
              </span>
            )}
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <CardKpiRico
            label="Créditos disponíveis"
            icon={Battery}
            tone={saldoTone}
            loading={loading && !data}
            valuePrimary={
              cards ? formatKWh(cards.creditosDisponiveis.kwh) : undefined
            }
            valueSecondary={
              cards ? `≈ ${formatBRL(cards.creditosDisponiveis.reais)}` : undefined
            }
            sub={
              cards
                ? `${cards.creditosDisponiveis.ucs} UC(s) · ${cards.creditosDisponiveis.usinas} usina(s)`
                : undefined
            }
            trend={cards?.creditosDisponiveis.trend}
            sparkline={cards?.creditosDisponiveis.sparkline}
            sparklineColor="#10b981"
            cta={{
              href: "/admin/gestao-creditos/balanco-mensal",
              label: "Ver balanço por UC",
            }}
          />
          <CardKpiRico
            label="A vencer ≤ 30 dias"
            icon={Hourglass}
            tone={vencendoTone}
            loading={loading && !data}
            valuePrimary={cards ? formatKWh(cards.vencendo30d.kwh) : undefined}
            valueSecondary={
              cards ? `≈ ${formatBRL(cards.vencendo30d.reais)}` : undefined
            }
            sub={
              cards
                ? `${cards.vencendo30d.ucs} UC(s)${
                    cards.vencendo30d.pctDoSaldo != null
                      ? ` · ${formatPct(cards.vencendo30d.pctDoSaldo)} do saldo`
                      : ""
                  }`
                : undefined
            }
            trend={cards?.vencendo30d.trend}
            trendInvert
            sparkline={cards?.vencendo30d.sparkline}
            sparklineColor="#f59e0b"
            rightExtra={
              cards && cards.vencendo30d.topPlants.length > 0 ? (
                <div className="space-y-0.5 text-[11px]">
                  <div className="text-muted-foreground">Top contribuidores:</div>
                  {cards.vencendo30d.topPlants.map((p) => (
                    <div
                      key={p.plantId}
                      className="flex items-center justify-between gap-2 tabular-nums"
                    >
                      <span className="truncate">{p.plantName}</span>
                      <span className="shrink-0 font-medium">
                        {p.kwh.toFixed(0)} kWh ({formatPct(p.pctDoTotal)})
                      </span>
                    </div>
                  ))}
                </div>
              ) : undefined
            }
          />
          <CardKpiRico
            label={`Eficiência (90d até ${MESES[mes - 1].slice(0, 3)}/${String(ano).slice(-2)})`}
            icon={Zap}
            tone={efTone}
            loading={loading && !data}
            valuePrimary={cards ? formatPct(cards.eficienciaMedia.pct) : undefined}
            sub={
              cards
                ? `${cards.eficienciaMedia.usinasMonitoradas} usina(s) monitorada(s)`
                : undefined
            }
            trend={cards?.eficienciaMedia.trend}
            rightExtra={
              cards?.eficienciaMedia.piorUsina ? (
                <div className="text-[11px]">
                  <span className="text-muted-foreground">Pior:</span>{" "}
                  <span className="font-medium">
                    {cards.eficienciaMedia.piorUsina.plantName}
                  </span>{" "}
                  <span className="text-red-600 tabular-nums">
                    ({formatPct(cards.eficienciaMedia.piorUsina.pct)})
                  </span>
                </div>
              ) : undefined
            }
          />
          <CardKpiRico
            label="UCs sem rateio vigente"
            icon={PlugZap}
            tone={semCobTone}
            loading={loading && !data}
            valuePrimary={cards ? String(cards.ucsSemCobertura.count) : undefined}
            sub={
              cards
                ? `${cards.ucsSemCobertura.plantsSemRateio} usina(s) sem rateio`
                : undefined
            }
            cta={{
              href: "/admin/gestao-creditos/rateios",
              label: "Gerenciar rateios",
            }}
          />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowSaude((v) => !v)}
            className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform ${showSaude ? "rotate-0" : "-rotate-90"}`}
            />
            Saúde por usina ({data?.saudePorUsina.length ?? 0})
          </button>
          {data && data.saudePorUsina.length > 0 && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                {data.saudePorUsina.filter((s) => s.status === "critico").length}{" "}
                crítica(s)
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                {data.saudePorUsina.filter((s) => s.status === "atencao").length}{" "}
                atenção
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                {data.saudePorUsina.filter((s) => s.status === "ok").length} ok
              </span>
            </div>
          )}
        </div>
        {showSaude && data && data.saudePorUsina.length > 0 && (
          <div className="rounded-lg border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-muted-foreground uppercase tracking-wide">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Usina</th>
                    <th className="px-3 py-2 text-right font-medium">UCs</th>
                    <th className="px-3 py-2 text-right font-medium">
                      Faltam mês
                    </th>
                    <th className="px-3 py-2 text-right font-medium">Saldo</th>
                    <th className="px-3 py-2 text-right font-medium">
                      Vencendo
                    </th>
                    <th className="px-3 py-2 text-right font-medium">PR 90d</th>
                    <th className="px-3 py-2 text-center font-medium">
                      Rateio
                    </th>
                    <th className="px-3 py-2 text-right font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {data.saudePorUsina.map((s) => (
                    <tr
                      key={s.plantId}
                      className="border-t hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-2 w-2 rounded-full ${STATUS_DOT[s.status]}`}
                            aria-hidden
                          />
                          <span className="font-medium">{s.plantName}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {s.ucsCount}
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums ${s.ucsFaltantesMes > 0 ? "text-amber-700 font-medium" : ""}`}
                      >
                        {s.ucsFaltantesMes}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <div>{formatKWh(s.saldoKwh)}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {formatBRL(s.saldoReais)}
                        </div>
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums ${s.vencendoKwh >= 500 ? "text-red-600 font-medium" : s.vencendoKwh > 0 ? "text-amber-700" : ""}`}
                      >
                        <div>{formatKWh(s.vencendoKwh)}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {formatBRL(s.vencendoReais)}
                        </div>
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums ${
                          s.prPct == null
                            ? "text-muted-foreground"
                            : s.prPct < 0.7
                              ? "text-red-600 font-medium"
                              : s.prPct < 0.8
                                ? "text-amber-700"
                                : "text-emerald-700"
                        }`}
                      >
                        {s.prPct == null ? "—" : formatPct(s.prPct)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {s.temRateioVigente ? (
                          <CheckCircle2 className="inline h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <AlertTriangle className="inline h-3.5 w-3.5 text-red-600" />
                        )}
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums ${s.acoesAbertas > 0 ? "font-medium" : "text-muted-foreground"}`}
                      >
                        {s.acoesAbertas}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Ações recomendadas — próximos 90 dias
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Filter className="h-3.5 w-3.5" />
            </div>
            <div className="relative">
              <select
                value={filtroTipo}
                onChange={(e) =>
                  setFiltroTipo((e.target.value as AcaoTipo) || "")
                }
                className="appearance-none text-xs border rounded-lg pl-2 pr-7 py-1 bg-background"
              >
                <option value="">Todos os tipos</option>
                {Object.entries(TIPO_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            </div>
            <div className="relative">
              <select
                value={filtroSev}
                onChange={(e) =>
                  setFiltroSev((e.target.value as Severidade) || "")
                }
                className="appearance-none text-xs border rounded-lg pl-2 pr-7 py-1 bg-background"
              >
                <option value="">Todas severidades</option>
                <option value="critico">Crítico</option>
                <option value="atencao">Atenção</option>
                <option value="info">Informativo</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            </div>
            <div className="relative">
              <select
                value={filtroStatus}
                onChange={(e) =>
                  setFiltroStatus((e.target.value as StatusAcao) || "")
                }
                className="appearance-none text-xs border rounded-lg pl-2 pr-7 py-1 bg-background"
              >
                <option value="ABERTA">
                  Abertas ({contagemPorStatus.ABERTA})
                </option>
                <option value="FEITA">
                  Feitas ({contagemPorStatus.FEITA})
                </option>
                <option value="DISPENSADA">
                  Dispensadas ({contagemPorStatus.DISPENSADA})
                </option>
                <option value="">Todas</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            </div>
            <button
              type="button"
              onClick={exportCsv}
              disabled={!data || data.acoes.length === 0}
              className="inline-flex h-7 items-center gap-1 rounded-lg border px-2 text-xs font-medium hover:bg-muted/50 disabled:opacity-40"
              title="Exportar todas as ações (sem aplicar filtros)"
            >
              <Download className="h-3.5 w-3.5" />
              CSV
            </button>
            {data && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  {data.totaisPorSeveridade.critico}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  {data.totaisPorSeveridade.atencao}
                </span>
              </div>
            )}
          </div>
        </div>

        {loading && !data && (
          <div className="rounded-lg border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
            Calculando ações…
          </div>
        )}

        {data && acoesFiltradas.length === 0 && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
            <Gauge className="mx-auto mb-2 h-6 w-6" />
            {filtroTipo || filtroSev
              ? "Nenhuma ação com esses filtros."
              : "Nenhuma ação recomendada além das faturas pendentes. Carteira saudável."}
          </div>
        )}

        {data && acoesFiltradas.length > 0 && (
          <div className="space-y-4">
            {[30, 60, 90].map((prazo) => {
              const lista = acoesAgrupadas[prazo as 30 | 60 | 90];
              if (lista.length === 0) return null;
              return (
                <div key={prazo} className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <CalendarClock className="h-3.5 w-3.5" />
                    Até {prazo} dias ({lista.length})
                  </div>
                  <div className="space-y-2">
                    {lista.map((a, idx) => (
                      <AcaoCardComp
                        key={
                          isPersistida(a)
                            ? a.id
                            : `${a.tipo}-${a.plantId ?? a.consumerUnitId ?? idx}`
                        }
                        acao={a}
                        users={users}
                        saving={isPersistida(a) && savingId === a.id}
                        onUpdate={updateAcao}
                        onReload={load}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-1 text-[11px] text-muted-foreground">
        <div>
          R$/kWh derivado da média Σ valor / Σ consumo das faturas do mês no
          escopo (fallback R$ 0,75 quando não há fatura).
        </div>
        <div>
          Limitações: vencimento 60/90d depende de tracking por lote/mês de
          origem (Fase 2 — snapshot mensal). Ações ainda não persistem status.
        </div>
      </section>
    </div>
  );
}

function AcaoCardComp({
  acao,
  users,
  saving,
  onUpdate,
  onReload,
}: {
  acao: AcaoAny;
  users: UserAtribuivel[];
  saving: boolean;
  onUpdate: (
    id: string,
    body: {
      status?: StatusAcao;
      responsavelUserId?: string | null;
      observacaoResolucao?: string | null;
    },
  ) => void;
  onReload: () => void;
}) {
  const persistida = isPersistida(acao) ? acao : null;
  const status: StatusAcao = persistida?.status ?? "ABERTA";
  const isResolvida = status === "FEITA" || status === "DISPENSADA";
  const opacityCls = isResolvida ? "opacity-70" : "";

  return (
    <Card className={`relative overflow-hidden ${opacityCls}`}>
      <span
        className={`absolute inset-y-0 left-0 w-1 ${SEVERIDADE_BAR[acao.severidade]}`}
        aria-hidden
      />
      <CardContent className="p-3 pl-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1 flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${SEVERIDADE_BADGE[acao.severidade]}`}
              >
                {SEVERIDADE_LABEL[acao.severidade]}
              </span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {TIPO_LABEL[acao.tipo]}
              </span>
              {persistida && (
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[status]}`}
                >
                  {STATUS_LABEL[status]}
                </span>
              )}
              {persistida && persistida.atrasada && status === "ABERTA" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 border border-red-200 px-2 py-0.5 text-[10px] font-medium text-red-700">
                  <Timer className="h-2.5 w-2.5" />
                  Atrasada {Math.abs(persistida.diasRestantes)}d
                </span>
              )}
              {persistida &&
                !persistida.atrasada &&
                status === "ABERTA" &&
                persistida.diasRestantes <= 7 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-200 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                    <Timer className="h-2.5 w-2.5" />
                    {persistida.diasRestantes}d restantes
                  </span>
                )}
            </div>
            <div className="font-semibold text-sm">{acao.titulo}</div>
            <p className="text-xs text-muted-foreground">{acao.descricao}</p>
            {persistida?.observacaoResolucao && (
              <p className="text-[11px] italic text-muted-foreground border-l-2 border-muted pl-2 mt-1">
                &ldquo;{persistida.observacaoResolucao}&rdquo;
                {persistida.resolvidaPor && (
                  <> — {persistida.resolvidaPor.name}</>
                )}
              </p>
            )}
          </div>
          {acao.metricaValor != null && acao.metricaLabel && (
            <div className="shrink-0 text-right">
              <div className="text-xl font-bold tabular-nums">
                {acao.metricaLabel.includes("%")
                  ? `${acao.metricaValor.toFixed(0)}%`
                  : acao.metricaValor.toFixed(0)}
              </div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {acao.metricaLabel}
              </div>
            </div>
          )}
        </div>

        {acao.sugestoes && acao.sugestoes.length > 0 && status === "ABERTA" && (
          <SugestoesBloco
            sugestoes={acao.sugestoes}
            onAfterAction={onReload}
          />
        )}

        {persistida && (
          <div className="mt-2 pt-2 border-t border-dashed flex flex-wrap items-center gap-2">
            <div className="relative">
              <select
                value={persistida.responsavel?.id ?? ""}
                onChange={(e) =>
                  onUpdate(persistida.id, {
                    responsavelUserId: e.target.value || null,
                  })
                }
                disabled={saving}
                className="appearance-none text-[11px] border rounded px-2 pr-6 py-0.5 bg-background disabled:opacity-50"
              >
                <option value="">Sem responsável</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-1 top-1/2 h-2.5 w-2.5 -translate-y-1/2 text-muted-foreground" />
            </div>
            <div className="flex-1" />
            {status === "ABERTA" ? (
              <>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    const obs =
                      window.prompt("Observação (opcional):", "") ?? "";
                    onUpdate(persistida.id, {
                      status: "FEITA",
                      observacaoResolucao: obs.trim() || null,
                    });
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 hover:text-emerald-900 disabled:opacity-50"
                >
                  <Check className="h-3 w-3" />
                  Marcar feita
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    const obs = window.prompt(
                      "Motivo da dispensa (opcional):",
                      "",
                    ) ?? "";
                    onUpdate(persistida.id, {
                      status: "DISPENSADA",
                      observacaoResolucao: obs.trim() || null,
                    });
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-600 hover:text-zinc-900 disabled:opacity-50"
                >
                  <X className="h-3 w-3" />
                  Dispensar
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  onUpdate(persistida.id, {
                    status: "ABERTA",
                    observacaoResolucao: null,
                  })
                }
                className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 hover:text-blue-900 disabled:opacity-50"
              >
                <Undo2 className="h-3 w-3" />
                Reabrir
              </button>
            )}
            {saving && (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SugestoesBloco({
  sugestoes,
  onAfterAction,
}: {
  sugestoes: Sugestao[];
  onAfterAction: () => void;
}) {
  const [running, setRunning] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const exec = async (idx: number, s: Sugestao) => {
    if (!s.action) return;
    let body: Record<string, unknown> | undefined = s.action.body
      ? { ...s.action.body }
      : undefined;
    if (s.action.promptObservacao) {
      const obs = window.prompt(
        `${s.label}\n\nObservação (opcional):`,
        "",
      );
      if (obs === null) return; // cancel
      const obsTrim = obs.trim();
      if (obsTrim) {
        body = body ?? {};
        // Para baselines o campo é "observacao"; pra acoes é "observacaoResolucao".
        // Detectamos pelo path da URL.
        if (s.action.url.includes("/baselines")) {
          body.observacao = obsTrim;
        } else {
          body.observacaoResolucao = `[SUGESTÃO ${s.tipo}] ${obsTrim}`;
        }
      }
    }
    if (s.action.confirm && !window.confirm(s.action.confirm)) return;

    setRunning(idx);
    try {
      const res = await fetch(s.action.url, {
        method: s.action.method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || `HTTP ${res.status}`);
      }
      if (s.action.successMessage) {
        // Avoid blocking — usa console; toast pode vir depois.
        console.info("[sugestão]", s.action.successMessage);
      }
      onAfterAction();
    } catch (err) {
      window.alert(`Falha: ${(err as Error).message}`);
    } finally {
      setRunning(null);
    }
  };

  const toneCls: Record<NonNullable<Sugestao["tone"]>, string> = {
    primary:
      "bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100",
    info: "bg-blue-50 border-blue-200 text-blue-800 hover:bg-blue-100",
    warn: "bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100",
    neutral: "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100",
  };

  return (
    <div className="mt-2 pt-2 border-t border-dashed">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
        <Lightbulb className="h-3 w-3" />
        Sugestões
      </div>
      <div className="flex flex-wrap gap-1.5">
        {sugestoes.map((s, idx) => {
          const cls = toneCls[s.tone ?? "neutral"];
          const hasSim = !!s.simulacao;
          const inner = (
            <>
              <span className="font-medium">{s.label}</span>
              {running === idx && (
                <Loader2 className="h-3 w-3 animate-spin ml-1" />
              )}
            </>
          );
          if (s.href) {
            return (
              <span key={idx} className="inline-flex">
                <Link
                  href={s.href}
                  title={s.descricao}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${cls} ${hasSim ? "rounded-r-none" : ""}`}
                >
                  {inner}
                  <ChevronRight className="h-3 w-3" />
                </Link>
                {hasSim && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setExpanded(expanded === idx ? null : idx);
                    }}
                    title="Ver simulação inline"
                    className={`inline-flex items-center rounded-full rounded-l-none border border-l-0 px-1.5 py-1 text-[11px] transition-colors ${cls}`}
                  >
                    <ChevronDown
                      className={`h-3 w-3 transition-transform ${expanded === idx ? "rotate-180" : ""}`}
                    />
                  </button>
                )}
              </span>
            );
          }
          return (
            <button
              key={idx}
              type="button"
              onClick={() => exec(idx, s)}
              disabled={running !== null}
              title={s.descricao}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors disabled:opacity-50 ${cls}`}
            >
              {inner}
            </button>
          );
        })}
      </div>
      {/* Tooltip alternativa: mostra a descrição da primeira sugestão como guia */}
      <div className="text-[10px] text-muted-foreground mt-1 italic">
        Passe o mouse pra ver o que cada uma faz.
      </div>
      {expanded !== null && sugestoes[expanded]?.simulacao && (
        <SimulacaoBloco sim={sugestoes[expanded].simulacao!} />
      )}
    </div>
  );
}

function SimulacaoBloco({
  sim,
}: {
  sim: NonNullable<Sugestao["simulacao"]>;
}) {
  const fmt = (n: number) => Math.round(n).toLocaleString("pt-BR");
  return (
    <div className="mt-2 rounded-md border bg-muted/30 p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
        Simulação · cota estimada baseada em {fmt(sim.geracaoEstimadaKwh)} kWh
        rateados no mês
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <div className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wide mb-1">
            UCs com cota sobrando ({sim.ucsSobrando.length})
          </div>
          {sim.ucsSobrando.length === 0 ? (
            <div className="text-[10px] text-muted-foreground italic">
              Nenhuma com folga significativa
            </div>
          ) : (
            <table className="w-full text-[11px]">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="text-left font-normal">UC</th>
                  <th className="text-right font-normal">%</th>
                  <th className="text-right font-normal">Cota→Cons.</th>
                  <th className="text-right font-normal">Sobra</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {sim.ucsSobrando.map((u) => (
                  <tr key={u.consumerUnitId}>
                    <td className="text-left truncate max-w-[120px]" title={u.nome}>
                      {u.codigoUc}
                    </td>
                    <td className="text-right">{u.percentualAtual.toFixed(0)}%</td>
                    <td className="text-right">
                      {fmt(u.cotaEstimadaKwh)} → {fmt(u.consumoKwh)}
                    </td>
                    <td className="text-right text-emerald-700 font-medium">
                      +{fmt(u.cotaEstimadaKwh - u.consumoKwh)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div>
          <div className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide mb-1">
            UCs no limite ({sim.ucsNoLimite.length})
          </div>
          {sim.ucsNoLimite.length === 0 ? (
            <div className="text-[10px] text-muted-foreground italic">
              Nenhuma consumindo no teto da cota
            </div>
          ) : (
            <table className="w-full text-[11px]">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="text-left font-normal">UC</th>
                  <th className="text-right font-normal">%</th>
                  <th className="text-right font-normal">Cota→Cons.</th>
                  <th className="text-right font-normal">Uso</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {sim.ucsNoLimite.map((u) => (
                  <tr key={u.consumerUnitId}>
                    <td className="text-left truncate max-w-[120px]" title={u.nome}>
                      {u.codigoUc}
                    </td>
                    <td className="text-right">{u.percentualAtual.toFixed(0)}%</td>
                    <td className="text-right">
                      {fmt(u.cotaEstimadaKwh)} → {fmt(u.consumoKwh)}
                    </td>
                    <td className="text-right text-amber-700 font-medium">
                      {(u.margemPct * 100).toFixed(0)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {sim.ucsSobrando.length > 0 && sim.ucsNoLimite.length > 0 && (
        <div className="mt-2 pt-2 border-t text-[11px] text-muted-foreground">
          💡 Realocar % das UCs à esquerda pras da direita reduz desperdício.
          Use a tela de rateios pra ajustar (clica no botão acima).
        </div>
      )}
    </div>
  );
}

function BannerCompletude({
  completude,
  showFaltantes,
  onToggle,
}: {
  completude: NonNullable<AnaliseCreditosResult["completude"]>;
  showFaltantes: boolean;
  onToggle: () => void;
}) {
  const pct = Math.round(completude.percentual * 100);
  const completo = completude.completo;
  const muitosFaltantes = completude.ucsFaltantes.length > 20;

  if (completude.ucsEsperadas === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
        Nenhuma UC ativa no escopo selecionado.
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border p-3 ${
        completo
          ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950"
          : "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950"
      }`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2">
          {completo ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          ) : (
            <FileWarning className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          )}
          <div>
            <div
              className={`text-sm font-semibold ${
                completo
                  ? "text-emerald-800 dark:text-emerald-200"
                  : "text-amber-900 dark:text-amber-200"
              }`}
            >
              {completo
                ? "Mês completo — análise consolidada"
                : `Mês parcial — ${completude.ucsFaltantes.length} fatura(s) faltando`}
            </div>
            <div
              className={`text-xs ${
                completo
                  ? "text-emerald-700 dark:text-emerald-300"
                  : "text-amber-800 dark:text-amber-300"
              }`}
            >
              {completude.ucsComFatura}/{completude.ucsEsperadas} UCs com fatura ({pct}%)
              {!completo && " · análise rodando com dados parciais"}
            </div>
          </div>
        </div>
        {!completo && (
          <div className="flex items-center gap-2">
            <Link
              href="/admin/uploads/novo"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 text-xs font-medium text-amber-800 hover:bg-amber-100 dark:bg-amber-900 dark:text-amber-100 dark:hover:bg-amber-800"
            >
              <Upload className="h-3.5 w-3.5" />
              Subir fatura
            </Link>
            <button
              type="button"
              onClick={onToggle}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 text-xs font-medium text-amber-800 hover:bg-amber-100 dark:bg-amber-900 dark:text-amber-100 dark:hover:bg-amber-800"
            >
              {showFaltantes ? "Ocultar" : "Ver"} lista
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${showFaltantes ? "rotate-180" : ""}`}
              />
            </button>
          </div>
        )}
      </div>

      {!completo && (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-amber-200 dark:bg-amber-900">
          <div
            className="h-full bg-amber-500 transition-all"
            style={{ width: `${pct}%` }}
            aria-hidden
          />
        </div>
      )}

      {!completo && showFaltantes && completude.ucsFaltantes.length > 0 && (
        <div className={`mt-3 ${muitosFaltantes ? "max-h-80" : "max-h-64"} overflow-y-auto rounded-md border border-amber-200 bg-white dark:border-amber-900 dark:bg-amber-950`}>
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium">Usina</th>
                <th className="px-3 py-1.5 text-left font-medium">UC</th>
                <th className="px-3 py-1.5 text-left font-medium">Nome</th>
              </tr>
            </thead>
            <tbody className="text-amber-900 dark:text-amber-200">
              {completude.ucsFaltantes.map((f) => (
                <tr
                  key={f.consumerUnitId}
                  className="border-t border-amber-100 dark:border-amber-900"
                >
                  <td className="px-3 py-1.5">{f.plantName ?? "—"}</td>
                  <td className="px-3 py-1.5 font-mono tabular-nums">
                    {f.codigoUc}
                  </td>
                  <td className="px-3 py-1.5">{f.nome}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface SnapshotLite {
  id: string;
  mesReferencia: number;
  anoReferencia: number;
  escopoTipo: string;
  escopoId: string | null;
  completo: boolean;
  emailEnviado: boolean;
  geradoEm: string;
  resumo: {
    saldoKwh: number;
    vencendo30dKwh: number;
    eficienciaPct: number | null;
    acoesCriticas: number;
  };
}

function HistoricoView({
  onVoltar,
  onSelectMes,
}: {
  onVoltar: () => void;
  onSelectMes: (mes: number, ano: number) => void;
}) {
  const [items, setItems] = useState<SnapshotLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch("/api/admin/gestao-creditos/snapshots")
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)),
      )
      .then((d: { items: SnapshotLite[] }) => setItems(d.items ?? []))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Histórico vem mais recente primeiro do endpoint; pro gráfico,
  // queremos ordem cronológica crescente.
  const chartData = useMemo(() => {
    return [...items]
      .reverse()
      .map((s) => ({
        label: `${String(s.mesReferencia).padStart(2, "0")}/${String(s.anoReferencia).slice(-2)}`,
        mes: s.mesReferencia,
        ano: s.anoReferencia,
        saldo: Math.round(s.resumo.saldoKwh),
        vencendo: Math.round(s.resumo.vencendo30dKwh),
        eficiencia:
          s.resumo.eficienciaPct != null
            ? Math.round(s.resumo.eficienciaPct * 100)
            : null,
        completo: s.completo,
      }));
  }, [items]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-slate-500 to-slate-700 text-white">
            <History className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Histórico</h1>
            <p className="text-sm text-muted-foreground">
              Snapshots mensais da carteira (gerados quando o mês fica
              completo).
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onVoltar}
          className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium hover:bg-muted/50 transition-colors"
        >
          <ChevronRight className="h-4 w-4 rotate-180" />
          Voltar à análise
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Falha ao carregar histórico: {error}
        </div>
      )}

      {loading && (
        <div className="rounded-lg border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
          Carregando…
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center text-sm text-amber-800">
          <FileWarning className="mx-auto mb-2 h-6 w-6" />
          Nenhum snapshot encontrado ainda. Rode{" "}
          <code className="bg-amber-100 px-1.5 py-0.5 rounded text-[11px]">
            npm run analise:mensal -- --force
          </code>{" "}
          em local pra popular ou aguarde o cron mensal.
        </div>
      )}

      {!loading && chartData.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground mb-2">
                  <Battery className="h-3.5 w-3.5" />
                  Saldo × A vencer (kWh)
                </div>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={chartData}
                      margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <RcTooltip
                        contentStyle={{ fontSize: 12 }}
                        formatter={(v) =>
                          `${Number(v).toLocaleString("pt-BR")} kWh`
                        }
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line
                        type="monotone"
                        dataKey="saldo"
                        name="Saldo"
                        stroke="#10b981"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="vencendo"
                        name="A vencer"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground mb-2">
                  <Zap className="h-3.5 w-3.5" />
                  Eficiência média (%)
                </div>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={chartData}
                      margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
                      <RcTooltip
                        contentStyle={{ fontSize: 12 }}
                        formatter={(v) => `${Number(v)}%`}
                      />
                      <Line
                        type="monotone"
                        dataKey="eficiencia"
                        name="PR"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="rounded-lg border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-muted-foreground uppercase tracking-wide">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Mês</th>
                    <th className="px-3 py-2 text-center font-medium">
                      Estado
                    </th>
                    <th className="px-3 py-2 text-right font-medium">Saldo</th>
                    <th className="px-3 py-2 text-right font-medium">
                      A vencer 30d
                    </th>
                    <th className="px-3 py-2 text-right font-medium">PR 90d</th>
                    <th className="px-3 py-2 text-right font-medium">
                      Críticas
                    </th>
                    <th className="px-3 py-2 text-center font-medium">Email</th>
                    <th className="px-3 py-2 text-center font-medium">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((s) => (
                    <tr
                      key={s.id}
                      className="border-t hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-3 py-2 font-medium">
                        {String(s.mesReferencia).padStart(2, "0")}/{s.anoReferencia}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {s.completo ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-800">
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            Completo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800">
                            <FileWarning className="h-2.5 w-2.5" />
                            Parcial
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatKWh(s.resumo.saldoKwh)}
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums ${s.resumo.vencendo30dKwh >= 500 ? "text-red-600 font-medium" : s.resumo.vencendo30dKwh > 0 ? "text-amber-700" : ""}`}
                      >
                        {formatKWh(s.resumo.vencendo30dKwh)}
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums ${
                          s.resumo.eficienciaPct == null
                            ? "text-muted-foreground"
                            : s.resumo.eficienciaPct < 0.7
                              ? "text-red-600 font-medium"
                              : s.resumo.eficienciaPct < 0.8
                                ? "text-amber-700"
                                : "text-emerald-700"
                        }`}
                      >
                        {s.resumo.eficienciaPct == null
                          ? "—"
                          : `${(s.resumo.eficienciaPct * 100).toFixed(0)}%`}
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums ${s.resumo.acoesCriticas > 0 ? "font-medium text-red-600" : "text-muted-foreground"}`}
                      >
                        {s.resumo.acoesCriticas}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {s.emailEnviado ? (
                          <Check className="inline h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Minus className="inline h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button
                          type="button"
                          onClick={() =>
                            onSelectMes(s.mesReferencia, s.anoReferencia)
                          }
                          className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                        >
                          Abrir
                          <ChevronRight className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

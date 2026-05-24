"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CalendarPlus,
  CheckCircle2,
  ClipboardCheck,
  Gauge,
  HardHat,
  Loader2,
  RefreshCw,
  Timer,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { ObraIndicadoresPayload } from "@/app/api/admin/obra/indicadores/route";

type Tone = "neutral" | "info" | "warn" | "danger" | "success";

const TONE_BAR: Record<Tone, string> = {
  neutral: "bg-slate-400",
  info: "bg-blue-500",
  warn: "bg-amber-500",
  danger: "bg-red-500",
  success: "bg-emerald-500",
};

interface IndicadorCardProps {
  label: string;
  hint: string;
  icon: React.ElementType;
  tone: Tone;
  value?: string;
  sub?: string;
  loading?: boolean;
}

function IndicadorCard({
  label,
  hint,
  icon: Icon,
  tone,
  value,
  sub,
  loading,
}: IndicadorCardProps) {
  return (
    <Card className="relative overflow-hidden">
      <span
        className={`absolute inset-y-0 left-0 w-1 ${TONE_BAR[tone]}`}
        aria-hidden
      />
      <CardContent className="p-4 pl-5">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </div>
        <div className="mt-1 text-2xl font-bold tabular-nums">
          {loading ? (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          ) : (
            (value ?? "—")
          )}
        </div>
        {sub && !loading && (
          <div className="text-xs text-muted-foreground">{sub}</div>
        )}
        <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
          {hint}
        </p>
      </CardContent>
    </Card>
  );
}

function formatKwp(v: number): string {
  return `${v.toFixed(1).replace(".", ",")} kWp`;
}

function formatHora(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function ObraIndicadoresPage() {
  const [data, setData] = useState<ObraIndicadoresPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    fetch("/api/admin/obra/indicadores")
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)),
      )
      .then((payload: ObraIndicadoresPayload) => setData(payload))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const emExecTone: Tone = (data?.emExecucao.count ?? 0) > 0 ? "info" : "neutral";
  const atrasadasTone: Tone =
    (data?.atrasadas.count ?? 0) > 0 ? "danger" : "success";
  const aprovacoesTone: Tone =
    (data?.aprovacoesPendentes.count ?? 0) > 0 ? "warn" : "neutral";
  const aIniciarTone: Tone =
    (data?.aIniciar7d.count ?? 0) > 0 ? "info" : "neutral";
  const concluidasTone: Tone =
    (data?.concluidasMes.count ?? 0) > 0 ? "success" : "neutral";
  const conflitosTone: Tone =
    (data?.conflitosEquipe.count ?? 0) > 0 ? "danger" : "success";

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 text-white">
            <HardHat className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Indicadores de Obra</h1>
            <p className="text-sm text-muted-foreground">
              Painel de gestão — visão de carteira, prazo e saúde operacional.
              {data && (
                <span className="ml-2 text-xs">
                  Atualizado às {formatHora(data.geradoEm)}
                </span>
              )}
            </p>
          </div>
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
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          Falha ao carregar indicadores: {error}
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Decisão do dia
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <IndicadorCard
            label="Em execução agora"
            icon={Zap}
            tone={emExecTone}
            loading={loading && !data}
            value={data ? String(data.emExecucao.count) : undefined}
            sub={
              data && data.emExecucao.kwpTotal > 0
                ? `${formatKwp(data.emExecucao.kwpTotal)} em obra`
                : undefined
            }
            hint="Obras com status EM_EXECUCAO + soma de kWp da Plant vinculada."
          />
          <IndicadorCard
            label="Atrasadas"
            icon={AlertTriangle}
            tone={atrasadasTone}
            loading={loading && !data}
            value={data ? String(data.atrasadas.count) : undefined}
            hint="dataFimPrevista < hoje e status ≠ CONCLUIDA/CANCELADA."
          />
          <IndicadorCard
            label="Aprovações pendentes"
            icon={ClipboardCheck}
            tone={aprovacoesTone}
            loading={loading && !data}
            value={data ? String(data.aprovacoesPendentes.count) : undefined}
            hint="aprovacao = PENDENTE. Bloqueio explícito de entrada no cronograma."
          />
          <IndicadorCard
            label="A iniciar em 7 dias"
            icon={CalendarPlus}
            tone={aIniciarTone}
            loading={loading && !data}
            value={data ? String(data.aIniciar7d.count) : undefined}
            hint="dataInicioPrevista entre hoje e +7d, status PLANEJAMENTO."
          />
          <IndicadorCard
            label="Concluídas no mês"
            icon={CheckCircle2}
            tone={concluidasTone}
            loading={loading && !data}
            value={data ? String(data.concluidasMes.count) : undefined}
            sub={
              data && data.concluidasMes.kwpTotal > 0
                ? `${formatKwp(data.concluidasMes.kwpTotal)} entregues`
                : undefined
            }
            hint="status CONCLUIDA + dataFimReal no mês corrente."
          />
          <IndicadorCard
            label="Conflitos de equipe"
            icon={Users}
            tone={conflitosTone}
            loading={loading && !data}
            value={data ? String(data.conflitosEquipe.count) : undefined}
            sub={
              data && data.conflitosEquipe.count > 0
                ? "obras com sobreposição"
                : undefined
            }
            hint="Sobreposição de datas entre obras da mesma equipe."
          />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Saúde operacional (Fase 2 — em construção)
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <IndicadorCard
            label="Lead time médio"
            icon={Timer}
            tone="neutral"
            hint="Média de (dataFimReal − dataInicioReal) das obras concluídas, comparada ao planejado."
          />
          <IndicadorCard
            label="Aderência ao prazo"
            icon={Gauge}
            tone="neutral"
            hint="% de obras concluídas com dataFimReal ≤ dataFimPrevista. Meta sugerida: 80%."
          />
          <IndicadorCard
            label="Obra → energização"
            icon={Zap}
            tone="neutral"
            hint="Dias entre dataFimReal da obra e primeira leitura/fatura da Plant vinculada."
          />
          <IndicadorCard
            label="Sem lista de material"
            icon={AlertTriangle}
            tone="neutral"
            hint="Obras com dataInicioPrevista em ≤14 dias e sem ObraListaMaterial. Risco iminente."
          />
        </div>
      </section>
    </div>
  );
}

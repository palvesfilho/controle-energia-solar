"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarPlus,
  CheckCircle2,
  ClipboardCheck,
  Gauge,
  HardHat,
  Loader2,
  PackageX,
  Pause,
  RefreshCw,
  Timer,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type {
  ComparativoSlice,
  DecisaoSemana,
  DecisaoTipo,
  EquipeCarga,
  ObraIndicadoresPayload,
  TendenciaMes,
} from "@/app/api/admin/obra/indicadores/route";

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

function formatDias(v: number | null): string | undefined {
  if (v == null) return undefined;
  return `${v.toFixed(1).replace(".", ",")} dias`;
}

function formatPct(v: number | null): string | undefined {
  if (v == null) return undefined;
  return `${v.toFixed(0)}%`;
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

  // Tom da aderência: ≥80% verde (meta atingida), 60-79% amarelo, <60% vermelho
  const aderenciaPct = data?.aderenciaPrazo.percent ?? null;
  const aderenciaTone: Tone =
    aderenciaPct == null
      ? "neutral"
      : aderenciaPct >= 80
        ? "success"
        : aderenciaPct >= 60
          ? "warn"
          : "danger";

  // Tom do lead time: se atrasou em média mais de 3 dias, amarelo; >7d vermelho
  const deltaLT = data?.leadTime.deltaDias ?? null;
  const leadTimeTone: Tone =
    deltaLT == null
      ? "neutral"
      : deltaLT <= 0
        ? "success"
        : deltaLT <= 3
          ? "info"
          : deltaLT <= 7
            ? "warn"
            : "danger";

  const semMatTone: Tone =
    (data?.semListaMaterial.count ?? 0) > 0 ? "danger" : "success";

  const pipeline60dTone: Tone =
    (data?.pipeline60d.count ?? 0) > 0 ? "info" : "neutral";

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

      <FunilPipeline data={data} loading={loading && !data} />

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
          <IndicadorCard
            label="Pipeline 60 dias"
            icon={TrendingUp}
            tone={pipeline60dTone}
            loading={loading && !data}
            value={data ? String(data.pipeline60d.count) : undefined}
            sub={
              data && data.pipeline60d.kwpTotal > 0
                ? `${formatKwp(data.pipeline60d.kwpTotal)} a entregar`
                : undefined
            }
            hint="Obras em PLANEJAMENTO com dataInicioPrevista nos próximos 60 dias — backlog confirmado."
          />
        </div>
      </section>

      <DecisoesSemanaSection
        decisoes={data?.decisoesSemana ?? []}
        loading={loading && !data}
      />

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Saúde operacional (últimos 90 dias)
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <IndicadorCard
            label="Lead time médio"
            icon={Timer}
            tone={leadTimeTone}
            loading={loading && !data}
            value={formatDias(data?.leadTime.diasRealMedio ?? null) ?? "—"}
            sub={
              data && data.leadTime.amostra > 0
                ? data.leadTime.diasPlanejadoMedio != null && deltaLT != null
                  ? `planejado ${formatDias(data.leadTime.diasPlanejadoMedio)} · ${deltaLT >= 0 ? "+" : ""}${deltaLT.toFixed(1).replace(".", ",")}d`
                  : `${data.leadTime.amostra} obra(s)`
                : "sem amostra"
            }
            hint="Média de (dataFimReal − dataInicioReal) das obras concluídas, comparada ao planejado."
          />
          <IndicadorCard
            label="Aderência ao prazo"
            icon={Gauge}
            tone={aderenciaTone}
            loading={loading && !data}
            value={formatPct(aderenciaPct) ?? "—"}
            sub={
              data && data.aderenciaPrazo.amostra > 0
                ? `${data.aderenciaPrazo.amostra} obra(s) · meta 80%`
                : "sem amostra"
            }
            hint="% de obras concluídas com dataFimReal ≤ dataFimPrevista. Meta sugerida: 80%."
          />
          <IndicadorCard
            label="Obra → energização"
            icon={Zap}
            tone="info"
            loading={loading && !data}
            value={formatDias(data?.obraEnergizacao.diasMedio ?? null) ?? "—"}
            sub={
              data && data.obraEnergizacao.amostra > 0
                ? `${data.obraEnergizacao.amostra} obra(s)`
                : "sem amostra"
            }
            hint="Dias entre dataFimReal da obra e primeira leitura/fatura da Plant vinculada."
          />
          <IndicadorCard
            label="Sem lista de material"
            icon={AlertTriangle}
            tone={semMatTone}
            loading={loading && !data}
            value={data ? String(data.semListaMaterial.count) : "—"}
            sub={
              data && data.semListaMaterial.count > 0
                ? "início ≤14d — risco"
                : undefined
            }
            hint="Obras com dataInicioPrevista em ≤14 dias e sem ObraListaMaterial. Risco iminente."
          />
        </div>
      </section>

      <DiretoriaSection data={data} loading={loading && !data} />
    </div>
  );
}

// Pipeline visual: 3 estágios (Planejamento → Em Execução → Pausada/concluído
// recente). Mostra onde o WIP está concentrado — vê o gargalo de relance.
function FunilPipeline({
  data,
  loading,
}: {
  data: ObraIndicadoresPayload | null;
  loading: boolean;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Funil
        </h2>
      </div>
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-stretch gap-2">
            <FunilEtapa
              label="Planejamento"
              icon={CalendarPlus}
              count={data?.funil.planejamento.count ?? null}
              sub={
                data && data.funil.planejamento.kwpTotal > 0
                  ? formatKwp(data.funil.planejamento.kwpTotal)
                  : undefined
              }
              tone="info"
              loading={loading}
            />
            <FunilArrow />
            <FunilEtapa
              label="Em execução"
              icon={Zap}
              count={data?.funil.emExecucao.count ?? null}
              sub={
                data && data.funil.emExecucao.kwpTotal > 0
                  ? formatKwp(data.funil.emExecucao.kwpTotal)
                  : undefined
              }
              tone="success"
              loading={loading}
            />
            <FunilArrow />
            <FunilEtapa
              label="Concluídas no mês"
              icon={CheckCircle2}
              count={data?.concluidasMes.count ?? null}
              sub={
                data && data.concluidasMes.kwpTotal > 0
                  ? formatKwp(data.concluidasMes.kwpTotal)
                  : undefined
              }
              tone="neutral"
              loading={loading}
            />
            {data && data.funil.pausadas.count > 0 && (
              <div className="ml-auto flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
                <Pause className="h-3.5 w-3.5" />
                <span>
                  <strong className="tabular-nums">
                    {data.funil.pausadas.count}
                  </strong>{" "}
                  pausada(s)
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function FunilEtapa({
  label,
  icon: Icon,
  count,
  sub,
  tone,
  loading,
}: {
  label: string;
  icon: React.ElementType;
  count: number | null;
  sub?: string;
  tone: Tone;
  loading: boolean;
}) {
  return (
    <div className="flex flex-1 min-w-[160px] items-center gap-3 rounded-lg border p-3">
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${TONE_BAR[tone]} text-white`}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="text-2xl font-bold tabular-nums leading-tight">
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            (count ?? "—")
          )}
        </div>
        {sub && !loading && (
          <div className="text-[11px] text-muted-foreground">{sub}</div>
        )}
      </div>
    </div>
  );
}

function FunilArrow() {
  return (
    <div className="flex items-center px-1 text-muted-foreground">
      <ArrowRight className="h-5 w-5" />
    </div>
  );
}

// Lista priorizada de ações que o gestor precisa tomar. Cada linha clicável
// leva direto pro local da ação (cronograma, lista de materiais, calendário,
// aprovação).
function DecisoesSemanaSection({
  decisoes,
  loading,
}: {
  decisoes: DecisaoSemana[];
  loading: boolean;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Decisões da semana
        </h2>
        {decisoes.length > 0 && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums">
            {decisoes.length}
          </span>
        )}
      </div>
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando ações...
            </div>
          ) : decisoes.length === 0 ? (
            <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Nenhuma ação pendente — operação saudável.
            </div>
          ) : (
            <ul className="divide-y">
              {decisoes.map((d, idx) => (
                <li key={`${d.tipo}-${d.obraId}-${idx}`}>
                  <Link
                    href={d.link}
                    className="flex items-center gap-3 px-4 py-3 transition hover:bg-muted/40"
                  >
                    <DecisaoBadge tipo={d.tipo} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {d.obraNome}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {d.detalhe}
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

// Seção de diretoria: tendência 12m + carga por equipe + comparativo mensal.
// Cada widget é independente; se um fica vazio, os outros aparecem normal.
function DiretoriaSection({
  data,
  loading,
}: {
  data: ObraIndicadoresPayload | null;
  loading: boolean;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Diretoria
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <ComparativoCard
          atual={data?.comparativoMes.atual ?? null}
          anterior={data?.comparativoMes.anterior ?? null}
          loading={loading}
        />
        <EquipeCargaCard equipes={data?.equipeCarga ?? []} loading={loading} />
      </div>

      <TendenciaCard tendencia={data?.tendencia12m ?? []} loading={loading} />
    </section>
  );
}

function ComparativoCard({
  atual,
  anterior,
  loading,
}: {
  atual: ComparativoSlice | null;
  anterior: ComparativoSlice | null;
  loading: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">Comparativo mensal</h3>
          {atual && anterior && (
            <span className="text-xs text-muted-foreground">
              {atual.label} vs {anterior.label}
            </span>
          )}
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando...
          </div>
        ) : !atual || !anterior ? (
          <div className="text-sm text-muted-foreground">Sem dados.</div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <ComparativoMetric
              label="Concluídas"
              atual={atual.concluidasCount}
              anterior={anterior.concluidasCount}
              format={(v) => String(v)}
              biggerIsBetter
            />
            <ComparativoMetric
              label="kWp"
              atual={atual.kwpTotal}
              anterior={anterior.kwpTotal}
              format={(v) => formatKwp(v)}
              biggerIsBetter
            />
            <ComparativoMetric
              label="Lead time"
              atual={atual.leadTimeRealMedio}
              anterior={anterior.leadTimeRealMedio}
              format={(v) => (v == null ? "—" : formatDias(v) ?? "—")}
              biggerIsBetter={false}
            />
            <ComparativoMetric
              label="Aderência"
              atual={atual.aderenciaPct}
              anterior={anterior.aderenciaPct}
              format={(v) => (v == null ? "—" : formatPct(v) ?? "—")}
              biggerIsBetter
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ComparativoMetric({
  label,
  atual,
  anterior,
  format,
  biggerIsBetter,
}: {
  label: string;
  atual: number | null;
  anterior: number | null;
  format: (v: number) => string;
  biggerIsBetter: boolean;
}) {
  const delta =
    atual != null && anterior != null && anterior !== 0
      ? atual - anterior
      : null;
  const deltaCls =
    delta == null || delta === 0
      ? "text-muted-foreground"
      : (delta > 0) === biggerIsBetter
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-red-600 dark:text-red-400";
  return (
    <div className="rounded-lg border p-2.5">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-lg font-bold tabular-nums">
        {atual == null ? "—" : format(atual)}
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 text-[11px]">
        <span className="text-muted-foreground">ant: {anterior == null ? "—" : format(anterior)}</span>
        {delta != null && delta !== 0 && (
          <span className={`tabular-nums ${deltaCls}`}>
            {delta > 0 ? "↑" : "↓"} {Math.abs(delta).toFixed(label === "Aderência" ? 0 : 1).replace(".", ",")}
          </span>
        )}
      </div>
    </div>
  );
}

function EquipeCargaCard({
  equipes,
  loading,
}: {
  equipes: EquipeCarga[];
  loading: boolean;
}) {
  const maxCarga = Math.max(1, ...equipes.map((e) => e.cargaAtual + e.concluidas30d));
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <h3 className="text-sm font-semibold">Carga por equipe</h3>
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando...
          </div>
        ) : equipes.length === 0 ? (
          <div className="text-sm text-muted-foreground">Nenhuma equipe ativa.</div>
        ) : (
          <ul className="space-y-2">
            {equipes.map((eq) => {
              const totalBar = ((eq.cargaAtual + eq.concluidas30d) / maxCarga) * 100;
              const cor = eq.cor ?? "#64748b";
              return (
                <li key={eq.equipeId} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                        style={{ backgroundColor: cor }}
                      />
                      <span className="truncate font-medium">{eq.equipeNome}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-muted-foreground tabular-nums">
                      <span title="Em execução agora">
                        <strong className="text-foreground">{eq.cargaAtual}</strong> ativa
                      </span>
                      <span className="text-muted-foreground/50">·</span>
                      <span title="Concluídas nos últimos 30 dias">
                        <strong className="text-foreground">{eq.concluidas30d}</strong> em 30d
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${totalBar}%`, backgroundColor: cor }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function TendenciaCard({
  tendencia,
  loading,
}: {
  tendencia: TendenciaMes[];
  loading: boolean;
}) {
  const maxKwp = Math.max(1, ...tendencia.map((t) => t.kwpTotal));
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold">Tendência 12 meses</h3>
          <span className="text-xs text-muted-foreground">
            obras concluídas · kWp · aderência
          </span>
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando...
          </div>
        ) : tendencia.length === 0 ? (
          <div className="text-sm text-muted-foreground">Sem dados.</div>
        ) : (
          <div className="flex items-end gap-1 overflow-x-auto pb-1">
            {tendencia.map((t) => {
              const altura = (t.kwpTotal / maxKwp) * 80; // px
              const ader = t.aderenciaPct;
              const aderCls =
                ader == null
                  ? "bg-slate-300"
                  : ader >= 80
                    ? "bg-emerald-500"
                    : ader >= 60
                      ? "bg-amber-500"
                      : "bg-red-500";
              return (
                <div
                  key={`${t.ano}-${t.mes}`}
                  className="flex min-w-[44px] flex-1 flex-col items-center gap-1"
                  title={`${t.label}: ${t.concluidasCount} obra(s), ${formatKwp(t.kwpTotal)}, aderência ${ader == null ? "—" : formatPct(ader)}`}
                >
                  <div className="flex h-[80px] w-full items-end">
                    <div
                      className="w-full rounded-t bg-blue-500/80 transition-all"
                      style={{ height: `${Math.max(2, altura)}px` }}
                    />
                  </div>
                  <div className={`h-1.5 w-full rounded-full ${aderCls}`} />
                  <div className="text-[10px] text-muted-foreground tabular-nums">
                    {t.label}
                  </div>
                  <div className="text-[11px] font-medium tabular-nums">
                    {t.concluidasCount}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DecisaoBadge({ tipo }: { tipo: DecisaoTipo }) {
  const map: Record<
    DecisaoTipo,
    { label: string; icon: React.ElementType; cls: string }
  > = {
    ATRASADA: {
      label: "Atrasada",
      icon: AlertTriangle,
      cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    },
    SEM_MATERIAL: {
      label: "Sem material",
      icon: PackageX,
      cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    },
    CONFLITO_EQUIPE: {
      label: "Conflito equipe",
      icon: Users,
      cls: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
    },
    APROVAR: {
      label: "Aprovar",
      icon: ClipboardCheck,
      cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    },
  };
  const it = map[tipo];
  const Icon = it.icon;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ${it.cls}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {it.label}
    </span>
  );
}

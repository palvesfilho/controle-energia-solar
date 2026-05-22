"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type {
  DayCellContentArg,
  EventClickArg,
  EventContentArg,
  EventDropArg,
  EventInput,
} from "@fullcalendar/core";
import type { EventResizeDoneArg } from "@fullcalendar/interaction";
import {
  Activity,
  AlertTriangle,
  Calendar as CalendarIcon,
  CheckCircle2,
  ClipboardList,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Filter,
  Loader2,
  RefreshCw,
  Sun,
  Users,
  X,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { CalendarioObraRow } from "@/app/api/admin/obra/calendario/route";
import type { ResumoCalendario } from "@/app/api/admin/obra/calendario/resumo/route";
import type {
  ForecastDay,
  ForecastResponse,
} from "@/app/api/weather/forecast/route";
import type { WeatherKind } from "@/lib/weather";
import {
  ATRASADA_COLOR,
  PRIORIDADE_LABEL,
  PRIORIDADE_STRIPE,
  STATUS_COLOR,
  STATUS_LABEL,
  type ObraPrioridade,
  type ObraStatus,
} from "@/lib/obra-calendario";
import { parseObraMeta, serializeObraObservacoes } from "@/lib/obra-meta";

const STATUS_OPTIONS: ObraStatus[] = [
  "PLANEJAMENTO",
  "EM_EXECUCAO",
  "PAUSADA",
  "CONCLUIDA",
  "CANCELADA",
];
const PRIORIDADE_OPTIONS: ObraPrioridade[] = [
  "BAIXA",
  "MEDIA",
  "ALTA",
  "URGENTE",
];

interface FiltrosState {
  equipeId: string;
  status: string;
  cidade: string;
  responsavel: string;
  incluirConcluidas: boolean;
}

function emptyFiltros(): FiltrosState {
  return {
    equipeId: "",
    status: "",
    cidade: "",
    responsavel: "",
    incluirConcluidas: false,
  };
}

// Datas das obras são armazenadas como "dia do calendário" (sem hora útil) —
// usamos a porção UTC para que o que aparece no input/UI seja sempre o dia que
// o usuário digitou, independente do fuso do navegador.
function formatDateBR(iso: string | null): string {
  if (!iso) return "—";
  const ymd = iso.slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return new Date(iso).toLocaleDateString("pt-BR");
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function toDateInput(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

// "Severidade" para escolher 1 ícone quando o dia tem várias obras em
// locais diferentes — mostramos o tempo mais "notável" (tempestade > chuva
// > etc.) pra equipe ficar ciente do pior cenário daquele dia.
const WEATHER_SEVERITY: Record<WeatherKind, number> = {
  storm: 6,
  snow: 5,
  rain: 4,
  fog: 3,
  cloud: 2,
  "cloud-partial": 1,
  sun: 0,
  unknown: -1,
};

const WEATHER_LABEL: Record<WeatherKind, string> = {
  sun: "Sol",
  "cloud-partial": "Parcialmente nublado",
  cloud: "Nublado",
  rain: "Chuva",
  storm: "Tempestade",
  snow: "Neve",
  fog: "Nevoeiro",
  unknown: "—",
};

const WEATHER_COLOR: Record<WeatherKind, string> = {
  sun: "#f59e0b",
  "cloud-partial": "#94a3b8",
  cloud: "#64748b",
  rain: "#0284c7",
  storm: "#7c3aed",
  snow: "#0ea5e9",
  fog: "#94a3b8",
  unknown: "#cbd5e1",
};

function WeatherIcon({
  kind,
  size = 14,
}: {
  kind: WeatherKind;
  size?: number;
}) {
  const color = WEATHER_COLOR[kind];
  const common = { width: size, height: size, color };
  switch (kind) {
    case "sun":
      return <Sun {...common} />;
    case "cloud-partial":
      return <CloudSun {...common} />;
    case "cloud":
      return <Cloud {...common} />;
    case "rain":
      return <CloudRain {...common} />;
    case "storm":
      return <CloudLightning {...common} />;
    case "snow":
      return <CloudSnow {...common} />;
    case "fog":
      return <CloudFog {...common} />;
    default:
      return null;
  }
}

function ymdLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function ymdRangeInclusive(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  const start = new Date(startIso.slice(0, 10) + "T12:00:00Z");
  const end = new Date(endIso.slice(0, 10) + "T12:00:00Z");
  // endIso vem do `fcEnd` (exclusivo) — voltamos 1 dia pra obter inclusivo.
  end.setUTCDate(end.getUTCDate() - 1);
  const cur = new Date(start);
  while (cur.getTime() <= end.getTime()) {
    out.push(
      `${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, "0")}-${String(cur.getUTCDate()).padStart(2, "0")}`
    );
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

export function CalendarioClient({
  equipes,
}: {
  equipes: { id: string; nome: string }[];
}) {
  const calendarRef = useRef<FullCalendar | null>(null);
  const [rows, setRows] = useState<CalendarioObraRow[]>([]);
  const [resumo, setResumo] = useState<ResumoCalendario | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtros, setFiltros] = useState<FiltrosState>(emptyFiltros());
  const [obraSelecionada, setObraSelecionada] =
    useState<CalendarioObraRow | null>(null);
  const [editando, setEditando] = useState(false);
  const [formEdit, setFormEdit] = useState<{
    status: ObraStatus;
    prioridade: ObraPrioridade;
    equipeId: string;
    dataInicio: string;
    dataFim: string;
    observacoes: string;
    // Snapshot do `observacoes` original — usado pra preservar o tag
    // `#OBRA_META` (proprietario, potência, inversor) na hora de salvar,
    // sem que ele apareça no textarea.
    observacoesOriginal: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  // Forecast por dia: YYYY-MM-DD → { kind, label, tMax, tMin, prob }.
  // Quando o dia tem várias obras em locais distintos, o ícone reflete o
  // tempo mais severo (ver WEATHER_SEVERITY).
  const [weatherByDay, setWeatherByDay] = useState<
    Map<string, { kind: WeatherKind; label: string; day: ForecastDay }>
  >(new Map());

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (filtros.equipeId) qs.set("equipeId", filtros.equipeId);
    if (filtros.status) qs.set("status", filtros.status);
    if (filtros.cidade) qs.set("cidade", filtros.cidade);
    if (filtros.responsavel) qs.set("responsavel", filtros.responsavel);
    if (filtros.incluirConcluidas) qs.set("concluidas", "true");

    try {
      const [listRes, resumoRes] = await Promise.all([
        fetch(`/api/admin/obra/calendario?${qs.toString()}`, {
          cache: "no-store",
        }),
        fetch("/api/admin/obra/calendario/resumo", { cache: "no-store" }),
      ]);
      if (!listRes.ok) throw new Error("Falha ao carregar obras");
      if (!resumoRes.ok) throw new Error("Falha ao carregar resumo");
      const list = (await listRes.json()) as { rows: CalendarioObraRow[] };
      const res = (await resumoRes.json()) as ResumoCalendario;
      setRows(list.rows);
      setResumo(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, [filtros]);

  useEffect(() => {
    load();
  }, [load]);

  // Busca previsão por (lat,lon) único e cruza com as obras de cada dia.
  useEffect(() => {
    const ativos = rows.filter(
      (r) => r.weatherLat != null && r.weatherLon != null && r.fcStart && r.fcEnd
    );
    if (ativos.length === 0) {
      setWeatherByDay(new Map());
      return;
    }
    const pontosUnicos = new Map<string, { lat: number; lon: number }>();
    for (const r of ativos) {
      const key = `${r.weatherLat!.toFixed(2)},${r.weatherLon!.toFixed(2)}`;
      if (!pontosUnicos.has(key)) {
        pontosUnicos.set(key, { lat: r.weatherLat!, lon: r.weatherLon! });
      }
    }
    const points = Array.from(pontosUnicos.entries()).map(([key, p]) => ({
      key,
      lat: p.lat,
      lon: p.lon,
    }));

    let cancelado = false;
    (async () => {
      try {
        const res = await fetch("/api/weather/forecast", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ points }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as ForecastResponse;
        if (cancelado) return;

        // Indexa forecast por (pointKey, date).
        const byPointDay = new Map<string, ForecastDay>();
        for (const [pointKey, days] of Object.entries(data.forecasts)) {
          for (const d of days) {
            byPointDay.set(`${pointKey}|${d.date}`, d);
          }
        }

        // Para cada dia visitado por uma obra, escolhe o forecast mais severo
        // entre as obras que cobrem aquele dia.
        const acc = new Map<
          string,
          { kind: WeatherKind; label: string; day: ForecastDay }
        >();
        for (const r of ativos) {
          const key = `${r.weatherLat!.toFixed(2)},${r.weatherLon!.toFixed(2)}`;
          const dias = ymdRangeInclusive(r.fcStart!, r.fcEnd!);
          for (const ymd of dias) {
            const fc = byPointDay.get(`${key}|${ymd}`);
            if (!fc) continue;
            const cur = acc.get(ymd);
            if (!cur || WEATHER_SEVERITY[fc.kind] > WEATHER_SEVERITY[cur.kind]) {
              acc.set(ymd, {
                kind: fc.kind,
                label: r.weatherLabel ?? "",
                day: fc,
              });
            }
          }
        }
        setWeatherByDay(acc);
      } catch {
        // silencia — clima é cosmético, não bloqueia o calendário.
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [rows]);

  const events: EventInput[] = useMemo(() => {
    return rows
      .filter((r) => r.fcStart && r.fcEnd)
      .map((r) => {
        const palette = r.atrasada ? ATRASADA_COLOR : STATUS_COLOR[r.status];
        return {
          id: r.id,
          title: r.nome,
          start: r.fcStart!,
          end: r.fcEnd!,
          backgroundColor: palette.bg,
          borderColor: palette.border,
          textColor: palette.text,
          extendedProps: { row: r },
        };
      });
  }, [rows]);

  function abrirObra(r: CalendarioObraRow) {
    setObraSelecionada(r);
    setEditando(false);
    const { rest } = parseObraMeta(r.observacoes);
    setFormEdit({
      status: r.status,
      prioridade: r.prioridade,
      equipeId: r.equipeId ?? "",
      dataInicio: toDateInput(r.dataInicioPrevista),
      dataFim: toDateInput(r.dataFimPrevista),
      observacoes: rest,
      observacoesOriginal: r.observacoes ?? "",
    });
  }

  function fecharModal() {
    setObraSelecionada(null);
    setEditando(false);
    setFormEdit(null);
  }

  async function salvarEdicao() {
    if (!obraSelecionada || !formEdit) return;
    setSaving(true);
    try {
      // Reanexa o tag `#OBRA_META` original ao texto editado pra preservar
      // proprietário/potência/inversor que ficam escondidos do usuário.
      const { meta } = parseObraMeta(formEdit.observacoesOriginal);
      const observacoesPersist = serializeObraObservacoes(meta, formEdit.observacoes);
      const res = await fetch(
        `/api/admin/obra/${obraSelecionada.id}/datas`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: formEdit.status,
            prioridade: formEdit.prioridade,
            equipeId: formEdit.equipeId || null,
            dataInicioPrevista: formEdit.dataInicio || null,
            dataFimPrevista: formEdit.dataFim || null,
            observacoes: observacoesPersist,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409 && data.conflitos) {
          const nomes = (data.conflitos as { nome: string }[])
            .map((c) => c.nome)
            .join(", ");
          toast.error(`Conflito com: ${nomes}`);
        } else {
          toast.error(data.error || "Falha ao salvar");
        }
        return;
      }
      toast.success("Obra atualizada");
      fecharModal();
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function moverOuRedimensionar(
    id: string,
    start: Date,
    endExclusive: Date,
    revert: () => void
  ) {
    const inicio = new Date(start);
    // FullCalendar entrega end exclusivo; revertemos 1 dia para obter o
    // último dia inclusivo que nossa API espera.
    const fim = new Date(endExclusive);
    fim.setDate(fim.getDate() - 1);

    // Envia YYYY-MM-DD (dia local) — server normaliza pra UTC noon. Evita
    // qualquer ambiguidade de fuso ao serializar via .toISOString().
    const toYmd = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    try {
      const res = await fetch(`/api/admin/obra/${id}/datas`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataInicioPrevista: toYmd(inicio),
          dataFimPrevista: toYmd(fim),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        revert();
        if (res.status === 409 && data.conflitos) {
          const nomes = (data.conflitos as { nome: string }[])
            .map((c) => c.nome)
            .join(", ");
          toast.error(`Conflito com a equipe: ${nomes}`);
        } else {
          toast.error(data.error || "Falha ao atualizar datas");
        }
        return;
      }
      toast.success("Datas atualizadas");
      await load();
    } catch (err) {
      revert();
      toast.error(err instanceof Error ? err.message : "Erro ao mover");
    }
  }

  function onEventDrop(info: EventDropArg) {
    const id = info.event.id;
    const start = info.event.start;
    const end = info.event.end;
    if (!start || !end) return info.revert();
    moverOuRedimensionar(id, start, end, () => info.revert());
  }

  function onEventResize(info: EventResizeDoneArg) {
    const id = info.event.id;
    const start = info.event.start;
    const end = info.event.end;
    if (!start || !end) return info.revert();
    moverOuRedimensionar(id, start, end, () => info.revert());
  }

  function onEventClick(info: EventClickArg) {
    const row = info.event.extendedProps.row as CalendarioObraRow | undefined;
    if (row) abrirObra(row);
  }

  function renderEventContent(arg: EventContentArg) {
    const row = arg.event.extendedProps.row as CalendarioObraRow | undefined;
    const stripe = row ? PRIORIDADE_STRIPE[row.prioridade] : "#94a3b8";
    return (
      <div className="flex h-full w-full items-center gap-1 overflow-hidden px-1">
        <span
          className="h-full w-1 shrink-0 rounded-sm"
          style={{ backgroundColor: stripe }}
        />
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium">
          {arg.event.title}
        </span>
        {row?.atrasada && (
          <AlertTriangle className="h-3 w-3 shrink-0 text-red-700" />
        )}
      </div>
    );
  }

  function renderDayCellContent(arg: DayCellContentArg) {
    const ymd = ymdLocal(arg.date);
    const wx = weatherByDay.get(ymd);
    if (!wx) {
      // FullCalendar renderiza o número do dia automaticamente quando
      // dayCellContent não é definido — replicamos isso retornando só
      // o texto pra manter consistência com nossa célula custom.
      return <span className="fc-daygrid-day-number">{arg.dayNumberText}</span>;
    }
    const tip = `${WEATHER_LABEL[wx.kind]}${wx.label ? ` — ${wx.label}` : ""} · ${
      Number.isFinite(wx.day.tMin) ? Math.round(wx.day.tMin) : "?"
    }°/${Number.isFinite(wx.day.tMax) ? Math.round(wx.day.tMax) : "?"}°${
      wx.day.precipitationProbabilityMax
        ? ` · ${wx.day.precipitationProbabilityMax}% chuva`
        : ""
    }`;
    return (
      <div className="flex w-full items-center justify-between gap-1 px-1">
        <span
          className="inline-flex items-center"
          title={tip}
          aria-label={tip}
        >
          <WeatherIcon kind={wx.kind} size={14} />
        </span>
        <span className="fc-daygrid-day-number">{arg.dayNumberText}</span>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-violet-700 text-white">
            <CalendarIcon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Calendário de Obras</h1>
            <p className="text-sm text-muted-foreground">
              Planejamento, capacidade das equipes e conflitos de agenda.
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Atualizar
        </Button>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <ResumoCard
          label="Total"
          value={resumo?.total ?? 0}
          icon={<ClipboardList className="h-4 w-4" />}
        />
        <ResumoCard
          label="Em andamento"
          value={resumo?.emAndamento ?? 0}
          icon={<Activity className="h-4 w-4" />}
          tone="emerald"
        />
        <ResumoCard
          label="Atrasadas"
          value={resumo?.atrasadas ?? 0}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone="red"
        />
        <ResumoCard
          label="Concluídas"
          value={resumo?.concluidas ?? 0}
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone="blue"
        />
        <ResumoCard
          label="Conflitos equipe"
          value={resumo?.conflitosEquipe.length ?? 0}
          icon={<Users className="h-4 w-4" />}
          tone={resumo?.conflitosEquipe.length ? "red" : "slate"}
        />
      </div>

      {/* Próximas + conflitos */}
      {(resumo?.proximasAIniciar.length || resumo?.conflitosEquipe.length) ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">
                Próximas obras a iniciar
              </CardTitle>
            </CardHeader>
            <CardContent>
              {resumo && resumo.proximasAIniciar.length > 0 ? (
                <ul className="space-y-1.5 text-sm">
                  {resumo.proximasAIniciar.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="truncate">
                        <b>{p.nome}</b>
                        {p.cliente ? (
                          <span className="text-muted-foreground">
                            {" "}
                            · {p.cliente}
                          </span>
                        ) : null}
                        {p.equipeNome ? (
                          <span className="text-muted-foreground">
                            {" "}
                            · {p.equipeNome}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                        {p.diasAteInicio === 0
                          ? "Hoje"
                          : `em ${p.diasAteInicio}d`}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Sem obras previstas para iniciar.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className={resumo?.conflitosEquipe.length ? "border-red-300" : ""}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Users className="h-4 w-4" />
                Equipes com conflito
              </CardTitle>
            </CardHeader>
            <CardContent>
              {resumo && resumo.conflitosEquipe.length > 0 ? (
                <ul className="space-y-2 text-sm">
                  {resumo.conflitosEquipe.map((c) => (
                    <li key={c.equipeId}>
                      <div className="font-medium text-red-700">
                        {c.equipeNome}
                      </div>
                      <ul className="ml-3 mt-1 space-y-0.5 text-xs text-muted-foreground">
                        {c.obras.map((o) => (
                          <li key={o.id}>
                            • {o.nome} (
                            {formatDateBR(o.dataInicioPrevista)} –{" "}
                            {formatDateBR(o.dataFimPrevista)})
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhum conflito detectado.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Filtros */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Filter className="h-4 w-4" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-5">
            <div className="space-y-1">
              <Label>Equipe</Label>
              <Select
                value={filtros.equipeId || "__all__"}
                onValueChange={(v) =>
                  setFiltros((f) => ({
                    ...f,
                    equipeId: !v || v === "__all__" ? "" : v,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todas">
                    {(v) =>
                      !v || v === "__all__"
                        ? "Todas"
                        : equipes.find((e) => e.id === v)?.nome ?? "Todas"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  {equipes.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select
                value={filtros.status || "__all__"}
                onValueChange={(v) =>
                  setFiltros((f) => ({
                    ...f,
                    status: !v || v === "__all__" ? "" : v,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos">
                    {(v) =>
                      !v || v === "__all__"
                        ? "Todos"
                        : STATUS_LABEL[v as ObraStatus] ?? "Todos"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Cidade</Label>
              <Input
                value={filtros.cidade}
                onChange={(e) =>
                  setFiltros({ ...filtros, cidade: e.target.value })
                }
                placeholder="Contém..."
              />
            </div>
            <div className="space-y-1">
              <Label>Responsável</Label>
              <Input
                value={filtros.responsavel}
                onChange={(e) =>
                  setFiltros({ ...filtros, responsavel: e.target.value })
                }
                placeholder="Contém..."
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={filtros.incluirConcluidas}
                  onChange={(e) =>
                    setFiltros({
                      ...filtros,
                      incluirConcluidas: e.target.checked,
                    })
                  }
                  className="h-4 w-4 rounded border-slate-300"
                />
                Incluir concluídas/canceladas
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Calendário */}
      <Card>
        <CardContent className="p-3">
          <div className="fc-solar">
            <FullCalendar
              ref={(el) => {
                calendarRef.current = el;
              }}
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              locale="pt-br"
              firstDay={0}
              height="auto"
              headerToolbar={{
                left: "prev,next today",
                center: "title",
                right: "dayGridMonth,timeGridWeek,timeGridDay",
              }}
              buttonText={{
                today: "Hoje",
                month: "Mês",
                week: "Semana",
                day: "Dia",
              }}
              events={events}
              editable
              eventResizableFromStart
              eventStartEditable
              eventDurationEditable
              eventClick={onEventClick}
              eventDrop={onEventDrop}
              eventResize={onEventResize}
              eventContent={renderEventContent}
              dayCellContent={renderDayCellContent}
              dayMaxEvents
              nowIndicator
              eventDisplay="block"
              displayEventTime={false}
            />
          </div>

          {/* Legenda */}
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="font-medium">Status:</span>
            {STATUS_OPTIONS.map((s) => (
              <span key={s} className="inline-flex items-center gap-1">
                <span
                  className="inline-block h-3 w-3 rounded-sm"
                  style={{
                    backgroundColor: STATUS_COLOR[s].bg,
                    border: `1px solid ${STATUS_COLOR[s].border}`,
                  }}
                />
                {STATUS_LABEL[s]}
              </span>
            ))}
            <span className="inline-flex items-center gap-1">
              <span
                className="inline-block h-3 w-3 rounded-sm"
                style={{
                  backgroundColor: ATRASADA_COLOR.bg,
                  border: `1px solid ${ATRASADA_COLOR.border}`,
                }}
              />
              Atrasada
            </span>
            <span className="ml-3 font-medium">Prioridade:</span>
            {PRIORIDADE_OPTIONS.map((p) => (
              <span key={p} className="inline-flex items-center gap-1">
                <span
                  className="inline-block h-3 w-1 rounded-sm"
                  style={{ backgroundColor: PRIORIDADE_STRIPE[p] }}
                />
                {PRIORIDADE_LABEL[p]}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={obraSelecionada !== null}
        onOpenChange={(v) => !v && fecharModal()}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {obraSelecionada && formEdit && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between pr-6">
                  <span>{obraSelecionada.nome}</span>
                  {obraSelecionada.atrasada && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                      Atrasada
                    </span>
                  )}
                </DialogTitle>
              </DialogHeader>

              <div className="grid gap-3 md:grid-cols-2">
                <InfoLine label="Cliente" value={obraSelecionada.cliente} />
                <InfoLine label="Local" value={obraSelecionada.local} />
                <InfoLine
                  label="Responsável"
                  value={obraSelecionada.responsavel}
                />
                <InfoLine
                  label="Equipe atual"
                  value={obraSelecionada.equipeNome}
                />
                <InfoLine
                  label="Progresso"
                  value={`${obraSelecionada.progresso}%`}
                />
              </div>

              {editando ? (
                <div className="space-y-3 border-t pt-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label>Status</Label>
                      <Select
                        value={formEdit.status}
                        onValueChange={(v) =>
                          setFormEdit({
                            ...formEdit,
                            status: v as ObraStatus,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue>
                            {(v) => STATUS_LABEL[v as ObraStatus] ?? ""}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((s) => (
                            <SelectItem key={s} value={s}>
                              {STATUS_LABEL[s]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Prioridade</Label>
                      <Select
                        value={formEdit.prioridade}
                        onValueChange={(v) =>
                          setFormEdit({
                            ...formEdit,
                            prioridade: v as ObraPrioridade,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue>
                            {(v) => PRIORIDADE_LABEL[v as ObraPrioridade] ?? ""}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {PRIORIDADE_OPTIONS.map((p) => (
                            <SelectItem key={p} value={p}>
                              {PRIORIDADE_LABEL[p]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Equipe</Label>
                      <Select
                        value={formEdit.equipeId || "__none__"}
                        onValueChange={(v) =>
                          setFormEdit({
                            ...formEdit,
                            equipeId: !v || v === "__none__" ? "" : v,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Sem equipe">
                            {(v) =>
                              !v || v === "__none__"
                                ? "Sem equipe"
                                : equipes.find((e) => e.id === v)?.nome ??
                                  "Sem equipe"
                            }
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Sem equipe</SelectItem>
                          {equipes.map((e) => (
                            <SelectItem key={e.id} value={e.id}>
                              {e.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label>Início previsto</Label>
                        <Input
                          type="date"
                          value={formEdit.dataInicio}
                          onChange={(e) =>
                            setFormEdit({
                              ...formEdit,
                              dataInicio: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Fim previsto</Label>
                        <Input
                          type="date"
                          value={formEdit.dataFim}
                          onChange={(e) =>
                            setFormEdit({
                              ...formEdit,
                              dataFim: e.target.value,
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Observações</Label>
                    <Textarea
                      value={formEdit.observacoes}
                      onChange={(e) =>
                        setFormEdit({
                          ...formEdit,
                          observacoes: e.target.value,
                        })
                      }
                      rows={3}
                      className="max-h-48 resize-y break-words"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid gap-2 border-t pt-3 md:grid-cols-2">
                  <InfoLine
                    label="Status"
                    value={STATUS_LABEL[obraSelecionada.status]}
                  />
                  <InfoLine
                    label="Prioridade"
                    value={PRIORIDADE_LABEL[obraSelecionada.prioridade]}
                  />
                  <InfoLine
                    label="Início previsto"
                    value={formatDateBR(obraSelecionada.dataInicioPrevista)}
                  />
                  <InfoLine
                    label="Fim previsto"
                    value={formatDateBR(obraSelecionada.dataFimPrevista)}
                  />
                  {(() => {
                    const restView = parseObraMeta(obraSelecionada.observacoes).rest.trim();
                    if (!restView) return null;
                    return (
                      <div className="md:col-span-2 min-w-0">
                        <div className="text-xs font-medium text-muted-foreground">
                          Observações
                        </div>
                        <div className="whitespace-pre-wrap break-words text-sm">
                          {restView}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              <DialogFooter className="gap-2 sm:justify-between">
                <Link
                  href={`/admin/obra/cronograma/${obraSelecionada.id}`}
                  className="text-sm text-indigo-600 hover:underline"
                >
                  Abrir cronograma completo →
                </Link>
                <div className="flex gap-2">
                  {editando ? (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => setEditando(false)}
                        disabled={saving}
                      >
                        <X className="h-4 w-4" />
                        Cancelar
                      </Button>
                      <Button onClick={salvarEdicao} disabled={saving}>
                        {saving && (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        )}
                        Salvar
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="outline" onClick={fecharModal}>
                        Fechar
                      </Button>
                      <Button onClick={() => setEditando(true)}>Editar</Button>
                    </>
                  )}
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <style jsx global>{`
        .fc-solar .fc {
          font-family: inherit;
          font-size: 13px;
        }
        .fc-solar .fc .fc-toolbar-title {
          font-size: 1.1rem;
          font-weight: 600;
        }
        .fc-solar .fc .fc-button {
          background-color: #f8fafc;
          border-color: #e2e8f0;
          color: #334155;
          text-transform: capitalize;
          padding: 0.35rem 0.7rem;
        }
        .fc-solar .fc .fc-button:hover {
          background-color: #e2e8f0;
        }
        .fc-solar .fc .fc-button-active,
        .fc-solar .fc .fc-button-primary:not(:disabled).fc-button-active {
          background-color: #4f46e5;
          border-color: #4f46e5;
          color: #fff;
        }
        .fc-solar .fc .fc-daygrid-day.fc-day-today,
        .fc-solar .fc .fc-timegrid-col.fc-day-today {
          background: #eef2ff;
        }
        .fc-solar .fc-event {
          border-radius: 4px;
          padding: 1px 2px;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}

function ResumoCard({
  label,
  value,
  icon,
  tone = "slate",
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone?: "slate" | "emerald" | "red" | "blue";
}) {
  const toneClass: Record<string, string> = {
    slate: "bg-slate-50 text-slate-700 border-slate-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    red: "bg-red-50 text-red-700 border-red-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
  };
  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-lg border p-3 ${toneClass[tone]}`}
    >
      <div>
        <div className="text-xs font-medium uppercase tracking-wide opacity-80">
          {label}
        </div>
        <div className="text-2xl font-bold leading-tight">{value}</div>
      </div>
      <div className="opacity-70">{icon}</div>
    </div>
  );
}

function InfoLine({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="text-sm">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="truncate">{value || "—"}</div>
    </div>
  );
}

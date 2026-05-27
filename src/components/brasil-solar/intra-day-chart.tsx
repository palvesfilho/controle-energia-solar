"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect, useMemo, useState, useCallback } from "react";
import { Loader2, RefreshCw, Calendar as CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import { formatNumber } from "@/lib/formatters";

interface SamplePoint {
  timeStampUtc: string;
  hhmmBrt: string;
  kwhAcumulado: number | null;
  p2Wh: number | null;
}

interface InverterData {
  psKey: string;
  samples: SamplePoint[];
  kwhDoDia: number;
}

interface IntraDayResponse {
  date: string;
  inverters: InverterData[];
  totalKwh: number;
  capacidadeKwp: number | null;
}

const COLORS = ["#10b981", "#06b6d4", "#f59e0b", "#ec4899", "#8b5cf6"];

/** Formata Date local pra "YYYY-MM-DD" UTC. */
function fmtDateUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Default = ontem UTC. */
function defaultDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return fmtDateUtc(d);
}

export function IntraDayChart({ clientId }: { clientId: string }) {
  const [date, setDate] = useState<string>(defaultDate());
  const [data, setData] = useState<IntraDayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [collecting, setCollecting] = useState(false);

  const fetchData = useCallback(async (targetDate: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/brasil-solar/${clientId}/intra-day?date=${targetDate}`);
      if (res.ok) {
        const j = await res.json();
        setData(j);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Erro ao carregar samples");
        setData(null);
      }
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchData(date);
  }, [date, fetchData]);

  const collectNow = useCallback(async () => {
    setCollecting(true);
    try {
      const res = await fetch(`/api/brasil-solar/${clientId}/intra-day`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 7 }),
      });
      if (res.ok) {
        const j = await res.json();
        const total = (j.results as Array<{ samplesUpserted: number }>)
          .reduce((s, r) => s + r.samplesUpserted, 0);
        toast.success(`Coleta concluída: ${total} amostras gravadas (7 dias)`);
        await fetchData(date);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Erro ao coletar");
      }
    } finally {
      setCollecting(false);
    }
  }, [clientId, date, fetchData]);

  // Une os samples de todos os inversores num único array por timestamp pra plotar.
  // Converte energia acumulada (kWh) → potência média do intervalo (kW),
  // calculando ΔkWh / Δh entre amostras consecutivas. Funciona pra qualquer
  // resolução (5min, 30min, etc.). Sem isso, a curva fica plana no total do
  // dia após o pôr-do-sol porque o acumulado não cai.
  const chartData = useMemo(() => {
    if (!data || data.inverters.length === 0) return [];
    const byTime = new Map<string, Record<string, string | number | null>>();
    // Parse "YYYYMMDDHHmmss" UTC em ms — Sungrow não devolve formato ISO.
    const tsToMs = (ts: string): number => {
      const y = Number(ts.substring(0, 4));
      const mo = Number(ts.substring(4, 6));
      const d = Number(ts.substring(6, 8));
      const h = Number(ts.substring(8, 10));
      const mi = Number(ts.substring(10, 12));
      const se = Number(ts.substring(12, 14) || "0");
      return Date.UTC(y, mo - 1, d, h, mi, se);
    };
    for (const inv of data.inverters) {
      const sorted = [...inv.samples].sort((a, b) =>
        a.timeStampUtc.localeCompare(b.timeStampUtc),
      );
      let prevKwh: number | null = null;
      let prevTs: number | null = null;
      for (const s of sorted) {
        const cur = s.kwhAcumulado;
        const curTs = tsToMs(s.timeStampUtc);
        let kw: number | null = null;
        if (cur != null) {
          if (prevKwh != null && prevTs != null) {
            const deltaKwh = cur - prevKwh;
            const deltaH = (curTs - prevTs) / 3600000;
            // delta < 0 = reset do contador diário (00h UTC) → trata como 0
            kw = deltaKwh > 0 && deltaH > 0 ? deltaKwh / deltaH : 0;
          } else {
            kw = 0;
          }
          prevKwh = cur;
          prevTs = curTs;
        }
        const row = byTime.get(s.hhmmBrt) ?? { hhmm: s.hhmmBrt };
        row[inv.psKey] = kw;
        byTime.set(s.hhmmBrt, row);
      }
    }
    return Array.from(byTime.values()).sort((a, b) =>
      String(a.hhmm).localeCompare(String(b.hhmm)),
    );
  }, [data]);

  const hasData = chartData.length > 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Curva diária do inversor</CardTitle>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2 py-1 border rounded-md text-sm">
              <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="date"
                value={date}
                max={fmtDateUtc(new Date())}
                onChange={(e) => setDate(e.target.value)}
                className="bg-transparent outline-none text-sm"
              />
            </div>
            <button
              onClick={collectNow}
              disabled={collecting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg hover:bg-muted disabled:opacity-50 transition-colors"
              title="Coleta os últimos 7 dias da Sungrow e grava no banco"
            >
              {collecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {collecting ? "Coletando…" : "Coletar 7 dias"}
            </button>
          </div>
        </div>
        {data && (
          <p className="text-xs text-muted-foreground">
            {data.inverters.length} inversor{data.inverters.length === 1 ? "" : "es"} •
            Total do dia: <span className="font-semibold text-foreground">{formatNumber(data.totalKwh)} kWh</span>
            {data.capacidadeKwp != null && ` • Capacidade ${formatNumber(data.capacidadeKwp)} kWp`}
          </p>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-72 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : !hasData ? (
          <div className="h-72 flex flex-col items-center justify-center gap-2 text-muted-foreground text-sm">
            <p>Sem dados pro dia {date}.</p>
            <p className="text-xs">Use &quot;Coletar 7 dias&quot; pra buscar da Sungrow.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
              <XAxis dataKey="hhmm" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis
                tick={{ fontSize: 11 }}
                label={{ value: "kW", angle: -90, position: "insideLeft", style: { fontSize: 11 } }}
              />
              <Tooltip
                contentStyle={{ fontSize: 12 }}
                formatter={(value) => `${formatNumber(Number(value))} kW`}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {data!.inverters.map((inv, i) => (
                <Area
                  key={inv.psKey}
                  type="monotone"
                  dataKey={inv.psKey}
                  stroke={COLORS[i % COLORS.length]}
                  fill={COLORS[i % COLORS.length]}
                  fillOpacity={0.25}
                  name={`Inv ${inv.psKey.split("_").slice(-2).join("/")}`}
                  connectNulls
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

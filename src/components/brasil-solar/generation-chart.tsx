"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  BarChart,
  Bar,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState, useMemo } from "react";

interface MonitoringLog {
  data: string;
  geracaoDiaria: number;
  geracaoEsperada?: number | null;
  picoMaximo?: number | null;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const MESES_FULL = [
  "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function ChartTypeToggle({
  chartType,
  setChartType,
}: {
  chartType: "bar" | "area";
  setChartType: (v: "bar" | "area") => void;
}) {
  return (
    <div className="flex gap-1">
      <button
        onClick={() => setChartType("bar")}
        className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
          chartType === "bar" ? "bg-primary text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"
        }`}
      >
        Barras
      </button>
      <button
        onClick={() => setChartType("area")}
        className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
          chartType === "area" ? "bg-primary text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"
        }`}
      >
        Area
      </button>
    </div>
  );
}

export function GenerationChart({
  logs,
  geracaoMediaEsperada,
}: {
  logs: MonitoringLog[];
  geracaoMediaEsperada?: number | null;
}) {
  const [chartType, setChartType] = useState<"bar" | "area">("bar");

  // Extrair anos e meses disponiveis dos logs
  const { availableYears, availableMonths } = useMemo(() => {
    const yearsSet = new Set<number>();
    const monthsByYear = new Map<number, Set<number>>();
    for (const log of logs) {
      const d = new Date(log.data);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      yearsSet.add(y);
      if (!monthsByYear.has(y)) monthsByYear.set(y, new Set());
      monthsByYear.get(y)!.add(m);
    }
    return {
      availableYears: Array.from(yearsSet).sort((a, b) => b - a),
      availableMonths: monthsByYear,
    };
  }, [logs]);

  const now = new Date();
  const [selectedYear, setSelectedYear] = useState<string>(String(now.getFullYear()));
  const [selectedMonth, setSelectedMonth] = useState<string>(String(now.getMonth() + 1));

  // Filtrar logs pelo ano/mes selecionado
  const filteredData = useMemo(() => {
    const year = Number(selectedYear);
    const month = Number(selectedMonth);
    return [...logs]
      .filter((log) => {
        const d = new Date(log.data);
        return d.getFullYear() === year && d.getMonth() + 1 === month;
      })
      .sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime())
      .map((log) => ({
        data: formatDate(log.data),
        geracao: log.geracaoDiaria,
        esperada: log.geracaoEsperada ?? (geracaoMediaEsperada ? geracaoMediaEsperada / 30 : null),
        pico: log.picoMaximo,
      }));
  }, [logs, selectedYear, selectedMonth, geracaoMediaEsperada]);

  const mediaEsperadaDia = geracaoMediaEsperada ? geracaoMediaEsperada / 30 : null;

  // Meses disponiveis para o ano selecionado
  const monthsForYear = useMemo(() => {
    const months = availableMonths.get(Number(selectedYear));
    if (!months) return [];
    return Array.from(months).sort((a, b) => a - b);
  }, [availableMonths, selectedYear]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="text-base">Geracao Diaria (kWh)</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={selectedMonth} onValueChange={(v) => v && setSelectedMonth(v)}>
              <SelectTrigger className="w-[130px] h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(monthsForYear.length > 0 ? monthsForYear : Array.from({ length: 12 }, (_, i) => i + 1)).map((m) => (
                  <SelectItem key={m} value={String(m)}>{MESES_FULL[m - 1]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedYear} onValueChange={(v) => {
              if (!v) return;
              setSelectedYear(v);
              // Reset mes se nao disponivel no novo ano
              const months = availableMonths.get(Number(v));
              if (months && !months.has(Number(selectedMonth))) {
                const first = Array.from(months).sort((a, b) => b - a)[0];
                if (first) setSelectedMonth(String(first));
              }
            }}>
              <SelectTrigger className="w-[90px] h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(availableYears.length > 0
                  ? availableYears
                  : [now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear()]
                ).map((a) => (
                  <SelectItem key={a} value={String(a)}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ChartTypeToggle chartType={chartType} setChartType={setChartType} />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filteredData.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
            Nenhum dado de geracao disponivel para {MESES_FULL[Number(selectedMonth) - 1]}/{selectedYear}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            {chartType === "bar" ? (
              <BarChart data={filteredData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="data" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                  formatter={(value) => [`${Number(value).toFixed(1)} kWh`, "Geracao"]}
                />
                <Bar dataKey="geracao" fill="#10b981" radius={[4, 4, 0, 0]} />
                {mediaEsperadaDia && (
                  <ReferenceLine y={mediaEsperadaDia} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: "Meta", fontSize: 10 }} />
                )}
              </BarChart>
            ) : (
              <AreaChart data={filteredData}>
                <defs>
                  <linearGradient id="colorGeracao" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="data" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                  formatter={(value, name) => [
                    `${Number(value).toFixed(1)} kWh`,
                    name === "geracao" ? "Geracao" : "Esperada",
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="geracao"
                  stroke="#10b981"
                  strokeWidth={2}
                  fill="url(#colorGeracao)"
                />
                {filteredData.some((d) => d.esperada != null) && (
                  <Area
                    type="monotone"
                    dataKey="esperada"
                    stroke="#94a3b8"
                    strokeWidth={1}
                    strokeDasharray="5 5"
                    fill="none"
                  />
                )}
                {mediaEsperadaDia && (
                  <ReferenceLine y={mediaEsperadaDia} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: "Meta", fontSize: 10 }} />
                )}
              </AreaChart>
            )}
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export function MonthlyComparisonChart({ logs }: { logs: MonitoringLog[] }) {
  const [chartType, setChartType] = useState<"bar" | "area">("bar");

  // Extrair anos disponiveis
  const availableYears = useMemo(() => {
    const yearsSet = new Set<number>();
    for (const log of logs) {
      yearsSet.add(new Date(log.data).getFullYear());
    }
    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [logs]);

  const [selectedYear, setSelectedYear] = useState<string>(String(new Date().getFullYear()));

  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

  const data = useMemo(() => {
    const year = Number(selectedYear);
    const monthlyMap = new Map<string, number>();
    for (const log of logs) {
      const d = new Date(log.data);
      if (d.getFullYear() !== year) continue;
      const key = `${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthlyMap.set(key, (monthlyMap.get(key) || 0) + log.geracaoDiaria);
    }
    return Array.from(monthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, total]) => ({
        mes: months[parseInt(key) - 1],
        geracao: total,
      }));
  }, [logs, selectedYear]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="text-base">Geracao Mensal (kWh)</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={selectedYear} onValueChange={(v) => v && setSelectedYear(v)}>
              <SelectTrigger className="w-[90px] h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(availableYears.length > 0
                  ? availableYears
                  : [new Date().getFullYear() - 2, new Date().getFullYear() - 1, new Date().getFullYear()]
                ).map((a) => (
                  <SelectItem key={a} value={String(a)}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ChartTypeToggle chartType={chartType} setChartType={setChartType} />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
            Nenhum dado mensal disponivel para {selectedYear}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            {chartType === "bar" ? (
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  formatter={(value) => [`${Number(value).toFixed(0)} kWh`, "Geracao"]}
                />
                <Bar dataKey="geracao" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
              </BarChart>
            ) : (
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="colorGeracaoMensal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  formatter={(value) => [`${Number(value).toFixed(0)} kWh`, "Geracao"]}
                />
                <Area
                  type="monotone"
                  dataKey="geracao"
                  stroke="#0ea5e9"
                  strokeWidth={2}
                  fill="url(#colorGeracaoMensal)"
                />
              </AreaChart>
            )}
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

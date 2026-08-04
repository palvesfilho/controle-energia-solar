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
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { esperadaDoDiaKwh, esperadaDoMesKwh } from "@/lib/geracao-esperada";
import { mesesDoAno } from "@/lib/serie-mensal";
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
  /**
   * "MANUAL" = rateio de um total mensal digitado (plataforma sem integração);
   * qualquer outro valor = medido pela plataforma. O gráfico PRECISA distinguir
   * os dois: média rateada não é leitura de inversor.
   */
  origem?: string | null;
}

/** Verde = medido pela plataforma. Âmbar = informado à mão. */
const COR_MEDIDO = "#10b981";
const COR_MANUAL = "#f59e0b";

function NotaManual({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] text-amber-700 mt-2 flex items-center gap-1.5">
      <span className="inline-block h-2 w-2 rounded-sm" style={{ background: COR_MANUAL }} />
      {children}
    </p>
  );
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const MESES_FULL = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
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
  /**
   * Prognóstico mensal MÉDIO da usina (kWh/mês) — não dividido por dia. A
   * conversão pra dia é feita aqui, com o fator sazonal do mês exibido, senão
   * a linha "esperada" fica alta demais no inverno e baixa demais no verão.
   */
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
        esperada:
          log.geracaoEsperada ??
          (geracaoMediaEsperada
            ? esperadaDoDiaKwh(geracaoMediaEsperada, new Date(log.data))
            : null),
        pico: log.picoMaximo,
        manual: log.origem === "MANUAL",
      }));
  }, [logs, selectedYear, selectedMonth, geracaoMediaEsperada]);

  // Referência do mês exibido, com sazonalidade (jun ≈ 55% da média do ano).
  const mediaEsperadaDia = useMemo(() => {
    if (!geracaoMediaEsperada) return null;
    const ano = Number(selectedYear);
    const mes = Number(selectedMonth);
    const dias = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
    return esperadaDoMesKwh(geracaoMediaEsperada, mes) / dias;
  }, [geracaoMediaEsperada, selectedYear, selectedMonth]);

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
                <SelectValue>{MESES_FULL[Number(selectedMonth) - 1]}</SelectValue>
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
          <>
          <ResponsiveContainer width="100%" height={300}>
            {chartType === "bar" ? (
              <BarChart data={filteredData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="data" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                  formatter={(value, _name, item) => [
                    `${Number(value).toFixed(1)} kWh`,
                    (item?.payload as { manual?: boolean } | undefined)?.manual
                      ? "Geracao (manual)"
                      : "Geracao",
                  ]}
                />
                <Bar dataKey="geracao" fill={COR_MEDIDO} radius={[4, 4, 0, 0]}>
                  {filteredData.map((d, i) => (
                    <Cell key={i} fill={d.manual ? COR_MANUAL : COR_MEDIDO} />
                  ))}
                </Bar>
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
          {filteredData.some((d) => d.manual) && (
            <NotaManual>
              {filteredData.filter((d) => d.manual).length} dia(s) vêm de geração informada
              manualmente (média do total do mês), não de leitura da plataforma.
            </NotaManual>
          )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

const MESES_LABEL = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

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

  const data = useMemo(() => {
    const year = Number(selectedYear);
    const monthlyMap = new Map<number, number>();
    const manualMap = new Map<number, number>();
    for (const log of logs) {
      const d = new Date(log.data);
      if (d.getFullYear() !== year) continue;
      const m = d.getMonth() + 1;
      monthlyMap.set(m, (monthlyMap.get(m) || 0) + log.geracaoDiaria);
      if (log.origem === "MANUAL") {
        manualMap.set(m, (manualMap.get(m) || 0) + log.geracaoDiaria);
      }
    }
    // Janeiro até o mês atual, com zero nos meses sem geração — mês ausente
    // esconde falha de monitoramento. Ver src/lib/serie-mensal.ts.
    return mesesDoAno(year).map(({ mes }) => {
      const total = monthlyMap.get(mes) ?? 0;
      const manualKwh = manualMap.get(mes) ?? 0;
      return {
        mes: MESES_LABEL[mes - 1],
        geracao: total,
        // Mês é "manual" quando a maior parte do kWh veio de lançamento à mão.
        manual: manualKwh > 0 && manualKwh > total / 2,
        manualKwh,
      };
    });
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
          <>
          <ResponsiveContainer width="100%" height={200}>
            {chartType === "bar" ? (
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  formatter={(value, _name, item) => [
                    `${Number(value).toFixed(0)} kWh`,
                    (item?.payload as { manual?: boolean } | undefined)?.manual
                      ? "Geracao (manual)"
                      : "Geracao",
                  ]}
                />
                <Bar dataKey="geracao" fill="#0ea5e9" radius={[4, 4, 0, 0]}>
                  {data.map((d, i) => (
                    <Cell key={i} fill={d.manual ? COR_MANUAL : "#0ea5e9"} />
                  ))}
                </Bar>
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
          {data.some((d) => d.manual) && (
            <NotaManual>
              Meses em âmbar: geração informada manualmente (
              {data
                .filter((d) => d.manual)
                .map((d) => d.mes)
                .join(", ")}
              ).
            </NotaManual>
          )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

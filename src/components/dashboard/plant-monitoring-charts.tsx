"use client";

import { useState, useEffect, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Area,
  AreaChart,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sun, TrendingUp, Calendar, Activity, Loader2, AlertCircle } from "lucide-react";

const MESES_LABEL = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

const MESES_FULL = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const tooltipStyle = {
  borderRadius: "8px",
  border: "1px solid #e2e8f0",
  fontSize: "12px",
  backgroundColor: "#fff",
};

const formatKWh = (value: number) => `${value.toLocaleString("pt-BR")} kWh`;

interface DailyPoint {
  dia: string;
  geracao: number;
}

interface MonthlyPoint {
  mes: string;
  mesNum: number;
  geracao: number;
}

interface YearlyPoint {
  ano: string;
  geracao: number;
}

interface GenerationResponse<T> {
  data: T[];
  empty?: boolean;
  reason?: string;
}

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
        Área
      </button>
    </div>
  );
}

function ChartEmptyState({ message }: { message: string }) {
  return (
    <div className="h-80 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
      <AlertCircle className="h-6 w-6" />
      <span>{message}</span>
    </div>
  );
}

function ChartLoading() {
  return (
    <div className="h-80 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" />
      <span>Buscando dados...</span>
    </div>
  );
}

interface PlantMonitoringChartsProps {
  plantId: string;
  plantName: string;
  potencia: number | null;
}

export function PlantMonitoringCharts({ plantId, plantName, potencia }: PlantMonitoringChartsProps) {
  const anoAtual = new Date().getFullYear();
  const mesAtual = new Date().getMonth();

  const [anoMensal, setAnoMensal] = useState(String(anoAtual));
  const [mesDiario, setMesDiario] = useState(String(mesAtual + 1));
  const [anoDiario, setAnoDiario] = useState(String(anoAtual));

  const [chartTypeDiario, setChartTypeDiario] = useState<"bar" | "area">("bar");
  const [chartTypeMensal, setChartTypeMensal] = useState<"bar" | "area">("bar");
  const [chartTypeAnual, setChartTypeAnual] = useState<"bar" | "area">("bar");

  const [dadosDiarios, setDadosDiarios] = useState<DailyPoint[]>([]);
  const [dadosMensais, setDadosMensais] = useState<MonthlyPoint[]>([]);
  const [dadosAnuais, setDadosAnuais] = useState<YearlyPoint[]>([]);

  const [loadingDiario, setLoadingDiario] = useState(true);
  const [loadingMensal, setLoadingMensal] = useState(true);
  const [loadingAnual, setLoadingAnual] = useState(true);

  const [emptyDiario, setEmptyDiario] = useState<string | null>(null);
  const [emptyMensal, setEmptyMensal] = useState<string | null>(null);
  const [emptyAnual, setEmptyAnual] = useState<string | null>(null);

  const reasonMessage = (reason?: string) => {
    if (reason === "SEM_INVERSOR") {
      return "Nenhuma planta fotovoltaica vinculada a esta usina.";
    }
    return "Sem dados de geração no período.";
  };

  const loadDiario = useCallback(async () => {
    setLoadingDiario(true);
    setEmptyDiario(null);
    try {
      const r = await fetch(
        `/api/plants/${plantId}/generation?view=diario&ano=${anoDiario}&mes=${mesDiario}`,
      );
      const j: GenerationResponse<DailyPoint> = await r.json();
      if (!r.ok) {
        setEmptyDiario("Erro ao carregar dados.");
        setDadosDiarios([]);
        return;
      }
      setDadosDiarios(j.data ?? []);
      if (j.empty || (j.data ?? []).every((p) => p.geracao === 0)) {
        setEmptyDiario(reasonMessage(j.reason));
      }
    } catch {
      setEmptyDiario("Erro ao carregar dados.");
      setDadosDiarios([]);
    } finally {
      setLoadingDiario(false);
    }
  }, [plantId, anoDiario, mesDiario]);

  const loadMensal = useCallback(async () => {
    setLoadingMensal(true);
    setEmptyMensal(null);
    try {
      const r = await fetch(`/api/plants/${plantId}/generation?view=mensal&ano=${anoMensal}`);
      const j: GenerationResponse<MonthlyPoint> = await r.json();
      if (!r.ok) {
        setEmptyMensal("Erro ao carregar dados.");
        setDadosMensais([]);
        return;
      }
      setDadosMensais(j.data ?? []);
      if (j.empty || (j.data ?? []).every((p) => p.geracao === 0)) {
        setEmptyMensal(reasonMessage(j.reason));
      }
    } catch {
      setEmptyMensal("Erro ao carregar dados.");
      setDadosMensais([]);
    } finally {
      setLoadingMensal(false);
    }
  }, [plantId, anoMensal]);

  const loadAnual = useCallback(async () => {
    setLoadingAnual(true);
    setEmptyAnual(null);
    try {
      const r = await fetch(`/api/plants/${plantId}/generation?view=anual`);
      const j: GenerationResponse<YearlyPoint> = await r.json();
      if (!r.ok) {
        setEmptyAnual("Erro ao carregar dados.");
        setDadosAnuais([]);
        return;
      }
      setDadosAnuais(j.data ?? []);
      if (j.empty || (j.data ?? []).every((p) => p.geracao === 0)) {
        setEmptyAnual(reasonMessage(j.reason));
      }
    } catch {
      setEmptyAnual("Erro ao carregar dados.");
      setDadosAnuais([]);
    } finally {
      setLoadingAnual(false);
    }
  }, [plantId]);

  useEffect(() => { loadDiario(); }, [loadDiario]);
  useEffect(() => { loadMensal(); }, [loadMensal]);
  useEffect(() => { loadAnual(); }, [loadAnual]);

  const totalMensal = dadosMensais.reduce((s, d) => s + d.geracao, 0);
  const mediaDiaria = dadosDiarios.length > 0
    ? Math.round(dadosDiarios.reduce((s, d) => s + d.geracao, 0) / dadosDiarios.filter((d) => d.geracao > 0).length || 1)
    : 0;
  const melhorDia = dadosDiarios.length > 0
    ? dadosDiarios.reduce((best, d) => d.geracao > best.geracao ? d : best, dadosDiarios[0])
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Monitoramento de Geração</h2>
            <p className="text-sm text-muted-foreground">{plantName} {potencia ? `- ${potencia} kWp` : ""}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-100 text-green-700">
              <Sun className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total {anoMensal}</p>
              <p className="text-lg font-bold">{formatKWh(totalMensal)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
              <TrendingUp className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Média Diária ({MESES_FULL[Number(mesDiario) - 1]})</p>
              <p className="text-lg font-bold">{formatKWh(mediaDiaria)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <Calendar className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Melhor Dia ({MESES_FULL[Number(mesDiario) - 1]})</p>
              <p className="text-lg font-bold">
                {melhorDia && melhorDia.geracao > 0 ? `Dia ${melhorDia.dia} - ${formatKWh(melhorDia.geracao)}` : "-"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="mensal" className="space-y-4">
        <TabsList className="grid grid-cols-3 w-full max-w-md">
          <TabsTrigger value="diario">Diário</TabsTrigger>
          <TabsTrigger value="mensal">Mensal</TabsTrigger>
          <TabsTrigger value="anual">Anual</TabsTrigger>
        </TabsList>

        <TabsContent value="diario">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <CardTitle className="text-base">Geração Diária (kWh)</CardTitle>
                <div className="flex items-center gap-2">
                  <Select value={mesDiario} onValueChange={(v) => v && setMesDiario(v)}>
                    <SelectTrigger className="w-[130px] h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MESES_FULL.map((m, i) => (
                        <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={anoDiario} onValueChange={(v) => v && setAnoDiario(v)}>
                    <SelectTrigger className="w-[90px] h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[anoAtual - 2, anoAtual - 1, anoAtual].map((a) => (
                        <SelectItem key={a} value={String(a)}>{a}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <ChartTypeToggle chartType={chartTypeDiario} setChartType={setChartTypeDiario} />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingDiario ? (
                <ChartLoading />
              ) : emptyDiario ? (
                <ChartEmptyState message={emptyDiario} />
              ) : (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    {chartTypeDiario === "bar" ? (
                      <BarChart data={dadosDiarios} barCategoryGap="15%">
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="dia" fontSize={11} tickLine={false} axisLine={false} interval={1} />
                        <YAxis fontSize={11} tickLine={false} axisLine={false} />
                        <Tooltip
                          contentStyle={tooltipStyle}
                          formatter={(value) => [formatKWh(Number(value)), "Geração"]}
                          labelFormatter={(label) => `Dia ${label}`}
                        />
                        <Legend formatter={() => "Geração"} />
                        <Bar dataKey="geracao" fill="#22c55e" radius={[3, 3, 0, 0]} name="geracao" />
                      </BarChart>
                    ) : (
                      <AreaChart data={dadosDiarios}>
                        <defs>
                          <linearGradient id="gradDiarioGeracao" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="dia" fontSize={11} tickLine={false} axisLine={false} interval={1} />
                        <YAxis fontSize={11} tickLine={false} axisLine={false} />
                        <Tooltip
                          contentStyle={tooltipStyle}
                          formatter={(value) => [formatKWh(Number(value)), "Geração"]}
                          labelFormatter={(label) => `Dia ${label}`}
                        />
                        <Legend formatter={() => "Geração"} />
                        <Area type="monotone" dataKey="geracao" stroke="#22c55e" strokeWidth={2} fill="url(#gradDiarioGeracao)" name="geracao" />
                      </AreaChart>
                    )}
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mensal">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <CardTitle className="text-base">Geração Mensal (kWh)</CardTitle>
                <div className="flex items-center gap-2">
                  <Select value={anoMensal} onValueChange={(v) => v && setAnoMensal(v)}>
                    <SelectTrigger className="w-[90px] h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[anoAtual - 2, anoAtual - 1, anoAtual].map((a) => (
                        <SelectItem key={a} value={String(a)}>{a}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <ChartTypeToggle chartType={chartTypeMensal} setChartType={setChartTypeMensal} />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingMensal ? (
                <ChartLoading />
              ) : emptyMensal ? (
                <ChartEmptyState message={emptyMensal} />
              ) : (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    {chartTypeMensal === "bar" ? (
                      <BarChart data={dadosMensais} barCategoryGap="20%">
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="mes" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis fontSize={12} tickLine={false} axisLine={false} />
                        <Tooltip
                          contentStyle={tooltipStyle}
                          formatter={(value) => [formatKWh(Number(value)), "Geração"]}
                        />
                        <Legend formatter={() => "Geração"} />
                        <Bar dataKey="geracao" fill="#16a34a" radius={[4, 4, 0, 0]} name="geracao" />
                      </BarChart>
                    ) : (
                      <AreaChart data={dadosMensais}>
                        <defs>
                          <linearGradient id="gradMensalGeracao" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#16a34a" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="mes" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis fontSize={12} tickLine={false} axisLine={false} />
                        <Tooltip
                          contentStyle={tooltipStyle}
                          formatter={(value) => [formatKWh(Number(value)), "Geração"]}
                        />
                        <Legend formatter={() => "Geração"} />
                        <Area type="monotone" dataKey="geracao" stroke="#16a34a" strokeWidth={2} fill="url(#gradMensalGeracao)" name="geracao" />
                      </AreaChart>
                    )}
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="anual">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <CardTitle className="text-base">Geração Anual (kWh)</CardTitle>
                <ChartTypeToggle chartType={chartTypeAnual} setChartType={setChartTypeAnual} />
              </div>
            </CardHeader>
            <CardContent>
              {loadingAnual ? (
                <ChartLoading />
              ) : emptyAnual ? (
                <ChartEmptyState message={emptyAnual} />
              ) : (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    {chartTypeAnual === "bar" ? (
                      <BarChart data={dadosAnuais} barCategoryGap="20%">
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="ano" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis fontSize={12} tickLine={false} axisLine={false} />
                        <Tooltip
                          contentStyle={tooltipStyle}
                          formatter={(value) => [formatKWh(Number(value)), "Geração"]}
                        />
                        <Legend formatter={() => "Geração"} />
                        <Bar dataKey="geracao" fill="#16a34a" radius={[4, 4, 0, 0]} name="geracao" />
                      </BarChart>
                    ) : (
                      <AreaChart data={dadosAnuais}>
                        <defs>
                          <linearGradient id="gradGeracao" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#16a34a" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="ano" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis fontSize={12} tickLine={false} axisLine={false} />
                        <Tooltip
                          contentStyle={tooltipStyle}
                          formatter={(value) => [formatKWh(Number(value)), "Geração"]}
                        />
                        <Legend formatter={() => "Geração"} />
                        <Area type="monotone" dataKey="geracao" stroke="#16a34a" strokeWidth={2} fill="url(#gradGeracao)" name="geracao" />
                      </AreaChart>
                    )}
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

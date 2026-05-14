"use client";

import { useState } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ChartData {
  shortMonth: string;
  injecao: number;
  consumo: number;
  autoConsumo: number;
}

export function EnergyChart({ data }: { data: ChartData[] }) {
  const [chartType, setChartType] = useState<"bar" | "area">("bar");

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="text-base">Historico de Geracao (kWh)</CardTitle>
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
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            {chartType === "bar" ? (
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="shortMonth"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                    fontSize: "12px",
                  }}
                  formatter={(value) => [
                    `${Number(value).toLocaleString("pt-BR")} kWh`,
                  ]}
                />
                <Bar
                  dataKey="injecao"
                  fill="#f59e0b"
                  radius={[4, 4, 0, 0]}
                  name="Injecao"
                />
              </BarChart>
            ) : (
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="colorInjecao" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="shortMonth"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                    fontSize: "12px",
                  }}
                  formatter={(value) => [
                    `${Number(value).toLocaleString("pt-BR")} kWh`,
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="injecao"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  fill="url(#colorInjecao)"
                  name="Injecao"
                />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

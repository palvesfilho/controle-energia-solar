"use client";

import { Card, CardContent } from "@/components/ui/card";
import {
  Users,
  Wifi,
  WifiOff,
  AlertTriangle,
  HelpCircle,
  Zap,
  Bell,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface StatsData {
  totalClientes: number;
  statusDistribution: {
    online: number;
    offline: number;
    alerta: number;
    semDados: number;
  };
  alertas: {
    abertos: number;
    criticos: number;
  };
  geracao: {
    hoje: number;
    clientesComDadosHoje: number;
    mesAtual: number;
  };
}

interface StatItem {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
}

export function StatsCards({ stats }: { stats: StatsData }) {
  const items: StatItem[] = [
    {
      title: "Total Clientes",
      value: stats.totalClientes.toLocaleString("pt-BR"),
      icon: Users,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
    },
    {
      title: "Online",
      value: stats.statusDistribution.online.toLocaleString("pt-BR"),
      subtitle: stats.totalClientes > 0
        ? `${((stats.statusDistribution.online / stats.totalClientes) * 100).toFixed(0)}%`
        : undefined,
      icon: Wifi,
      color: "text-emerald-600",
      bgColor: "bg-emerald-50",
    },
    {
      title: "Offline",
      value: stats.statusDistribution.offline.toLocaleString("pt-BR"),
      icon: WifiOff,
      color: "text-red-600",
      bgColor: "bg-red-50",
    },
    {
      title: "Em Alerta",
      value: stats.statusDistribution.alerta.toLocaleString("pt-BR"),
      icon: AlertTriangle,
      color: "text-amber-600",
      bgColor: "bg-amber-50",
    },
    {
      title: "Sem Dados",
      value: stats.statusDistribution.semDados.toLocaleString("pt-BR"),
      icon: HelpCircle,
      color: "text-gray-500",
      bgColor: "bg-gray-50",
    },
    {
      title: "Geracao Hoje",
      value: `${(stats.geracao.hoje / 1000).toFixed(1)} MWh`,
      subtitle: `${stats.geracao.clientesComDadosHoje} clientes`,
      icon: Zap,
      color: "text-green-600",
      bgColor: "bg-green-50",
    },
    {
      title: "Geracao Mes",
      value: `${(stats.geracao.mesAtual / 1000).toFixed(1)} MWh`,
      icon: TrendingUp,
      color: "text-cyan-600",
      bgColor: "bg-cyan-50",
    },
    {
      title: "Alertas Abertos",
      value: stats.alertas.abertos.toLocaleString("pt-BR"),
      subtitle: stats.alertas.criticos > 0 ? `${stats.alertas.criticos} criticos` : undefined,
      icon: Bell,
      color: stats.alertas.criticos > 0 ? "text-red-600" : "text-amber-600",
      bgColor: stats.alertas.criticos > 0 ? "bg-red-50" : "bg-amber-50",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
      {items.map((item) => (
        <Card key={item.title} className="hover:shadow-sm transition-shadow">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className={cn("p-1.5 rounded-lg", item.bgColor)}>
                <item.icon className={cn("h-3.5 w-3.5", item.color)} />
              </div>
            </div>
            <p className="text-lg font-bold leading-none">{item.value}</p>
            <p className="text-[10px] text-muted-foreground mt-1 leading-tight">{item.title}</p>
            {item.subtitle && (
              <p className={cn("text-[10px] mt-0.5 font-medium", item.color)}>{item.subtitle}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

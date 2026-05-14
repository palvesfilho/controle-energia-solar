"use client";

import { cn } from "@/lib/utils";

const statusConfig: Record<string, { label: string; color: string; dot: string }> = {
  ONLINE: { label: "Online", color: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  OFFLINE: { label: "Offline", color: "bg-red-50 text-red-700 border-red-200", dot: "bg-red-500" },
  ALERTA: { label: "Alerta", color: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500" },
  SEM_DADOS: { label: "Sem dados", color: "bg-gray-50 text-gray-600 border-gray-200", dot: "bg-gray-400" },
};

const severidadeConfig: Record<string, { label: string; color: string }> = {
  BAIXA: { label: "Baixa", color: "bg-blue-50 text-blue-700 border-blue-200" },
  MEDIA: { label: "Media", color: "bg-amber-50 text-amber-700 border-amber-200" },
  ALTA: { label: "Alta", color: "bg-orange-50 text-orange-700 border-orange-200" },
  CRITICA: { label: "Critica", color: "bg-red-50 text-red-700 border-red-200" },
};

const alertStatusConfig: Record<string, { label: string; color: string }> = {
  ABERTO: { label: "Aberto", color: "bg-red-50 text-red-700 border-red-200" },
  EM_ANDAMENTO: { label: "Em andamento", color: "bg-blue-50 text-blue-700 border-blue-200" },
  RESOLVIDO: { label: "Resolvido", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  IGNORADO: { label: "Ignorado", color: "bg-gray-50 text-gray-600 border-gray-200" },
};

export function MonitoringStatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || statusConfig.SEM_DADOS;
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border", config.color)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", config.dot, status === "ONLINE" && "animate-pulse")} />
      {config.label}
    </span>
  );
}

export function SeveridadeBadge({ severidade }: { severidade: string }) {
  const config = severidadeConfig[severidade] || severidadeConfig.MEDIA;
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border", config.color)}>
      {config.label}
    </span>
  );
}

export function AlertStatusBadge({ status }: { status: string }) {
  const config = alertStatusConfig[status] || alertStatusConfig.ABERTO;
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border", config.color)}>
      {config.label}
    </span>
  );
}

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SeveridadeBadge, AlertStatusBadge } from "./status-badge";
import { AlertTriangle, CheckCircle, Clock, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface Alert {
  id: string;
  tipo: string;
  severidade: string;
  titulo: string;
  descricao?: string | null;
  status: string;
  resolvidoPor?: string | null;
  resolvidoEm?: string | null;
  observacaoResolucao?: string | null;
  notificadoCliente: boolean;
  notificadoEngenharia: boolean;
  createdAt: string;
}

const tipoLabels: Record<string, string> = {
  OFFLINE: "Sistema Offline",
  BAIXA_GERACAO: "Baixa Geracao",
  ERRO_INVERSOR: "Erro Inversor",
  CONSUMO_ELEVADO: "Consumo Elevado",
  FATURA_IRREGULAR: "Fatura Irregular",
  MANUTENCAO: "Manutencao",
};

const tipoIcons: Record<string, React.ElementType> = {
  OFFLINE: AlertTriangle,
  BAIXA_GERACAO: AlertTriangle,
  ERRO_INVERSOR: AlertTriangle,
  CONSUMO_ELEVADO: AlertTriangle,
  FATURA_IRREGULAR: AlertTriangle,
  MANUTENCAO: Clock,
};

function formatDateTime(dateStr: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateStr));
}

export function AlertPanel({
  alerts,
  clientId,
  onUpdate,
}: {
  alerts: Alert[];
  clientId: string;
  onUpdate?: () => void;
}) {
  const [resolving, setResolving] = useState<string | null>(null);
  const [observacao, setObservacao] = useState("");

  const openAlerts = alerts.filter((a) => a.status === "ABERTO" || a.status === "EM_ANDAMENTO");
  const resolvedAlerts = alerts.filter((a) => a.status === "RESOLVIDO" || a.status === "IGNORADO");

  async function handleResolve(alertId: string, status: string) {
    setResolving(alertId);
    try {
      const res = await fetch(`/api/brasil-solar/${clientId}/alerts`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertId, status, observacaoResolucao: observacao }),
      });
      if (res.ok) {
        toast.success(status === "RESOLVIDO" ? "Alerta resolvido" : "Alerta atualizado");
        setObservacao("");
        onUpdate?.();
      } else {
        toast.error("Erro ao atualizar alerta");
      }
    } finally {
      setResolving(null);
    }
  }

  async function handleNotify(alertId: string, target: "cliente" | "engenharia") {
    const field = target === "cliente" ? "notificadoCliente" : "notificadoEngenharia";
    const res = await fetch(`/api/brasil-solar/${clientId}/alerts`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alertId, [field]: true }),
    });
    if (res.ok) {
      toast.success(`Notificacao enviada para ${target}`);
      onUpdate?.();
    }
  }

  return (
    <div className="space-y-4">
      {/* Alertas Abertos */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Alertas Abertos ({openAlerts.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {openAlerts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Nenhum alerta aberto
            </p>
          ) : (
            <div className="space-y-3">
              {openAlerts.map((alert) => {
                const Icon = tipoIcons[alert.tipo] || AlertTriangle;
                return (
                  <div key={alert.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0">
                        <Icon className="h-4 w-4 mt-0.5 text-amber-500 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{alert.titulo}</p>
                          <p className="text-xs text-muted-foreground">
                            {tipoLabels[alert.tipo] || alert.tipo} - {formatDateTime(alert.createdAt)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <SeveridadeBadge severidade={alert.severidade} />
                        <AlertStatusBadge status={alert.status} />
                      </div>
                    </div>

                    {alert.descricao && (
                      <p className="text-xs text-muted-foreground pl-6">{alert.descricao}</p>
                    )}

                    <div className="flex items-center gap-2 pl-6">
                      <input
                        type="text"
                        value={resolving === alert.id ? observacao : ""}
                        onChange={(e) => {
                          setResolving(alert.id);
                          setObservacao(e.target.value);
                        }}
                        placeholder="Observacao..."
                        className="flex-1 text-xs border rounded px-2 py-1 bg-background"
                      />
                      <button
                        onClick={() => handleResolve(alert.id, "EM_ANDAMENTO")}
                        disabled={resolving === alert.id && !observacao}
                        className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                      >
                        <Clock className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => handleResolve(alert.id, "RESOLVIDO")}
                        className="text-xs px-2 py-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                      >
                        <CheckCircle className="h-3 w-3" />
                      </button>
                      {!alert.notificadoCliente && (
                        <button
                          onClick={() => handleNotify(alert.id, "cliente")}
                          className="text-xs px-2 py-1 rounded bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors"
                          title="Notificar cliente"
                        >
                          <Send className="h-3 w-3" />
                        </button>
                      )}
                      {!alert.notificadoEngenharia && (
                        <button
                          onClick={() => handleNotify(alert.id, "engenharia")}
                          className="text-xs px-2 py-1 rounded bg-orange-50 text-orange-700 hover:bg-orange-100 transition-colors"
                          title="Notificar engenharia"
                        >
                          <Send className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Historico de Alertas */}
      {resolvedAlerts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              Historico ({resolvedAlerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {resolvedAlerts.slice(0, 10).map((alert) => (
                <div key={alert.id} className="flex items-center justify-between text-sm border-b last:border-0 pb-2">
                  <div className="min-w-0">
                    <p className="text-sm truncate">{alert.titulo}</p>
                    <p className="text-xs text-muted-foreground">
                      {tipoLabels[alert.tipo] || alert.tipo} - {formatDateTime(alert.createdAt)}
                      {alert.resolvidoPor && ` - Resolvido por ${alert.resolvidoPor}`}
                    </p>
                  </div>
                  <AlertStatusBadge status={alert.status} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function CreateAlertForm({
  clientId,
  onCreated,
}: {
  clientId: string;
  onCreated?: () => void;
}) {
  const [form, setForm] = useState({
    tipo: "BAIXA_GERACAO",
    severidade: "MEDIA",
    titulo: "",
    descricao: "",
  });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.titulo.trim()) {
      toast.error("Titulo e obrigatorio");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/brasil-solar/${clientId}/alerts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        toast.success("Alerta criado");
        setForm({ tipo: "BAIXA_GERACAO", severidade: "MEDIA", titulo: "", descricao: "" });
        onCreated?.();
      } else {
        toast.error("Erro ao criar alerta");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Criar Alerta</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Tipo</label>
              <select
                value={form.tipo}
                onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                className="w-full mt-1 text-sm border rounded-md px-2 py-1.5 bg-background"
              >
                {Object.entries(tipoLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Severidade</label>
              <select
                value={form.severidade}
                onChange={(e) => setForm({ ...form, severidade: e.target.value })}
                className="w-full mt-1 text-sm border rounded-md px-2 py-1.5 bg-background"
              >
                <option value="BAIXA">Baixa</option>
                <option value="MEDIA">Media</option>
                <option value="ALTA">Alta</option>
                <option value="CRITICA">Critica</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Titulo</label>
            <input
              type="text"
              value={form.titulo}
              onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              placeholder="Ex: Inversor offline ha 3 dias"
              className="w-full mt-1 text-sm border rounded-md px-2 py-1.5 bg-background"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Descricao</label>
            <textarea
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              placeholder="Detalhes do problema..."
              rows={2}
              className="w-full mt-1 text-sm border rounded-md px-2 py-1.5 bg-background resize-none"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full text-sm font-medium py-2 rounded-md bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving ? "Criando..." : "Criar Alerta"}
          </button>
        </form>
      </CardContent>
    </Card>
  );
}

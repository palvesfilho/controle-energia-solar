"use client";

import { useEffect, useState } from "react";
import { Loader2, X, Calendar, Plus, ShieldCheck, ShieldAlert, ShieldOff } from "lucide-react";
import { toast } from "sonner";

interface Plan {
  id: string;
  dataInicio: string;
  dataFim: string;
  valorMensal: number | null;
  observacoes: string | null;
  createdAt: string;
}

export type MonitoringPlanStatus = "VIGENTE" | "VENCIDO" | "FUTURO" | "SEM_PLANO";

export function deriveStatus(plans: Pick<Plan, "dataInicio" | "dataFim">[]): {
  status: MonitoringPlanStatus;
  ativo: { dataInicio: string; dataFim: string } | null;
} {
  if (plans.length === 0) return { status: "SEM_PLANO", ativo: null };
  const now = Date.now();
  const vigente = plans.find((p) => {
    const ini = new Date(p.dataInicio).getTime();
    const fim = new Date(p.dataFim).getTime();
    return ini <= now && now <= fim;
  });
  if (vigente) return { status: "VIGENTE", ativo: vigente };

  const futuro = plans.find((p) => new Date(p.dataInicio).getTime() > now);
  if (futuro) return { status: "FUTURO", ativo: futuro };

  // mais recente vencido
  const ordenados = [...plans].sort(
    (a, b) => new Date(b.dataFim).getTime() - new Date(a.dataFim).getTime(),
  );
  return { status: "VENCIDO", ativo: ordenados[0] };
}

const formatBRL = (v: number | null) =>
  v == null
    ? "—"
    : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const formatDate = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

const inputCls =
  "text-sm border rounded-lg px-3 py-2 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all w-full";

interface Props {
  clientId: string;
  clientNome: string;
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
}

export function MonitoringPlanModal({ clientId, clientNome, open, onClose, onChanged }: Props) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [novoInicio, setNovoInicio] = useState("");
  const [novoFim, setNovoFim] = useState("");
  const [novoValor, setNovoValor] = useState<string>("");
  const [novoObs, setNovoObs] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/brasil-solar/${clientId}/monitoring-plans`)
      .then((r) => r.json())
      .then((d) => setPlans(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, [open, clientId]);

  if (!open) return null;

  const { status, ativo } = deriveStatus(plans);

  const handleCriar = async () => {
    if (!novoInicio || !novoFim) {
      toast.error("Preencha data de início e fim");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/brasil-solar/${clientId}/monitoring-plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataInicio: novoInicio,
          dataFim: novoFim,
          valorMensal: novoValor ? Number(novoValor) : null,
          observacoes: novoObs || null,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Erro ao criar plano");
        return;
      }
      toast.success("Plano criado");
      const r2 = await fetch(`/api/brasil-solar/${clientId}/monitoring-plans`);
      const d2 = await r2.json();
      setPlans(Array.isArray(d2) ? d2 : []);
      setNovoInicio("");
      setNovoFim("");
      setNovoValor("");
      setNovoObs("");
      onChanged?.();
    } finally {
      setSaving(false);
    }
  };

  const handleExcluir = async (planId: string) => {
    if (!confirm("Excluir este plano? Essa ação remove o histórico do registro.")) return;
    const res = await fetch(`/api/brasil-solar/${clientId}/monitoring-plans/${planId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("Erro ao excluir");
      return;
    }
    toast.success("Plano excluído");
    setPlans((prev) => prev.filter((p) => p.id !== planId));
    onChanged?.();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h3 className="font-semibold text-base">Plano de Monitoramento</h3>
            <p className="text-xs text-muted-foreground">{clientNome}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-4 space-y-4">
          {/* Status atual */}
          <StatusBlock status={status} ativo={ativo} />

          {/* Formulário novo plano */}
          <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Plus className="h-4 w-4" />
              {status === "VIGENTE"
                ? "Adicionar plano futuro / sobrepor"
                : status === "FUTURO"
                  ? "Adicionar outro plano"
                  : "Contratar / renovar plano"}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Início</label>
                <input
                  type="date"
                  value={novoInicio}
                  onChange={(e) => setNovoInicio(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Fim</label>
                <input
                  type="date"
                  value={novoFim}
                  onChange={(e) => setNovoFim(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Valor mensal (R$)
              </label>
              <input
                type="number"
                step="0.01"
                placeholder="opcional"
                value={novoValor}
                onChange={(e) => setNovoValor(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Observações
              </label>
              <textarea
                rows={2}
                value={novoObs}
                onChange={(e) => setNovoObs(e.target.value)}
                className={inputCls}
              />
            </div>
            <div className="flex justify-end">
              <button
                onClick={handleCriar}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {saving ? "Salvando..." : "Salvar plano"}
              </button>
            </div>
          </div>

          {/* Histórico */}
          <div>
            <div className="text-sm font-medium mb-2 flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Histórico ({plans.length})
            </div>
            {loading ? (
              <div className="text-sm text-muted-foreground py-4 text-center">
                Carregando...
              </div>
            ) : plans.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center">
                Nenhum plano cadastrado.
              </div>
            ) : (
              <div className="space-y-2">
                {plans.map((p) => {
                  const now = Date.now();
                  const ini = new Date(p.dataInicio).getTime();
                  const fim = new Date(p.dataFim).getTime();
                  const vigente = ini <= now && now <= fim;
                  const vencido = fim < now;
                  return (
                    <div
                      key={p.id}
                      className={`rounded-lg border p-3 text-sm ${
                        vigente ? "border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/10" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">
                            {formatDate(p.dataInicio)} → {formatDate(p.dataFim)}
                            {vigente && (
                              <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                                Vigente
                              </span>
                            )}
                            {vencido && (
                              <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                Vencido
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Mensal: {formatBRL(p.valorMensal)}
                          </div>
                          {p.observacoes && (
                            <div className="text-xs text-muted-foreground mt-1 italic">
                              {p.observacoes}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => handleExcluir(p.id)}
                          className="text-xs text-muted-foreground hover:text-red-600 transition-colors"
                        >
                          Excluir
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBlock({
  status,
  ativo,
}: {
  status: MonitoringPlanStatus;
  ativo: { dataInicio: string; dataFim: string } | null;
}) {
  if (status === "VIGENTE" && ativo) {
    return (
      <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 p-3">
        <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
          <ShieldCheck className="h-5 w-5" />
          <span className="font-semibold">Plano vigente</span>
        </div>
        <p className="text-sm mt-1 text-muted-foreground">
          Vence em <strong>{formatDate(ativo.dataFim)}</strong>
        </p>
      </div>
    );
  }
  if (status === "FUTURO" && ativo) {
    return (
      <div className="rounded-lg border-2 border-blue-300 bg-blue-50 dark:bg-blue-950/20 p-3">
        <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
          <ShieldCheck className="h-5 w-5" />
          <span className="font-semibold">Plano futuro</span>
        </div>
        <p className="text-sm mt-1 text-muted-foreground">
          Começa em <strong>{formatDate(ativo.dataInicio)}</strong>
        </p>
      </div>
    );
  }
  if (status === "VENCIDO" && ativo) {
    return (
      <div className="rounded-lg border-2 border-red-300 bg-red-50 dark:bg-red-950/20 p-3">
        <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
          <ShieldAlert className="h-5 w-5" />
          <span className="font-semibold">Plano vencido</span>
        </div>
        <p className="text-sm mt-1 text-muted-foreground">
          Venceu em <strong>{formatDate(ativo.dataFim)}</strong> — renove ou exclua
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border-2 border-muted bg-muted/20 p-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        <ShieldOff className="h-5 w-5" />
        <span className="font-semibold">Sem plano de monitoramento</span>
      </div>
      <p className="text-sm mt-1 text-muted-foreground">
        Contrate um plano abaixo pra monitoramento pago dessa usina.
      </p>
    </div>
  );
}

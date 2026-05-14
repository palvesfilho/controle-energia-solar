"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, RefreshCw, Save, Send, XCircle } from "lucide-react";
import { toast } from "sonner";
import { formatMonthYear, formatBRL } from "@/lib/formatters";
import { brand, brandGradient } from "@/lib/brand-colors";
import { parseInstallments, type BillingInstallment } from "@/lib/billing-installments";

interface BillingDetail {
  id: string;
  consumerUnitId: string;
  ano: number;
  mes: number;
  status: string;
  valorFatura: number | null;
  valorCompensado: number | null;
  valorEconomia: number | null;
  valorCobranca: number | null;
  dataVencimento: string | null;
  observacoes: string | null;
  asaasChargeId: string | null;
  asaasInvoiceUrl: string | null;
  asaasStatus: string | null;
  asaasSyncedAt: string | null;
  pagoEm: string | null;
  installments: string | null;
  consumerUnit: {
    id: string;
    nome: string;
    codigoUc: string;
    cpfCnpj: string | null;
    distribuidora: string | null;
    consumer: { id: string; name: string; emailsRecebimento: string | null } | null;
  };
}

// Status com cores espelhando a identidade do PDF (teal/orange) em vez do azul/vermelho default.
const STATUS_LABELS: Record<
  string,
  { label: string; bg: string; text: string }
> = {
  PENDENTE: { label: "Pendente", bg: "#F1F5F4", text: brand.tealDark },
  ENVIADO_ASAAS: { label: "Enviado ao Asaas", bg: brand.tealMid, text: "#ffffff" },
  PARCIALMENTE_PAGO: { label: "Parcialmente pago", bg: brand.tealMid, text: "#ffffff" },
  PAGO: { label: "Pago", bg: brand.teal, text: "#ffffff" },
  ATRASADO: { label: "Atrasado", bg: brand.orange, text: "#ffffff" },
  CANCELADO: { label: "Cancelado", bg: "#64748B", text: "#ffffff" },
};

const inputClass =
  "w-full text-sm border rounded-lg px-3 py-1.5 bg-background focus:ring-2 focus:ring-[#2E9B87]/30 focus:border-[#2E9B87] outline-none transition-all";

const primaryBtn =
  "inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50";

const primaryBtnStyle = { backgroundColor: brand.teal } as const;
const primaryBtnHoverStyle = { backgroundColor: brand.tealDark } as const;

const secondaryBtn =
  "inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border rounded-lg hover:bg-muted/50 transition-colors disabled:opacity-50";

export default function CobrancaUCDetalhePage() {
  const params = useParams();
  const mesParam = params.mes as string;
  const id = params.id as string;

  const [data, setData] = useState<BillingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    valorFatura: "",
    valorCompensado: "",
    valorEconomia: "",
    valorCobranca: "",
    dataVencimento: "",
    observacoes: "",
  });
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [sendingAsaas, setSendingAsaas] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [billingType, setBillingType] = useState<"UNDEFINED" | "BOLETO" | "PIX" | "CREDIT_CARD">("BOLETO");

  const reload = async () => {
    const r = await fetch(`/api/billing/consumer-units/${id}`);
    if (r.ok) {
      const d: BillingDetail = await r.json();
      setData(d);
      setForm({
        valorFatura: d.valorFatura?.toString() ?? "",
        valorCompensado: d.valorCompensado?.toString() ?? "",
        valorEconomia: d.valorEconomia?.toString() ?? "",
        valorCobranca: d.valorCobranca?.toString() ?? "",
        dataVencimento: d.dataVencimento ? d.dataVencimento.slice(0, 10) : "",
        observacoes: d.observacoes ?? "",
      });
    }
  };

  useEffect(() => {
    setLoading(true);
    reload().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/billing/consumer-units/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 2000);
        await reload();
        toast.success("Cobrança salva");
      } else {
        toast.error("Erro ao salvar");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSincronizar = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`/api/billing/consumer-units/${id}/asaas`, { method: "GET" });
      const d = await res.json();
      if (!res.ok) toast.error("Erro ao sincronizar", { description: d.detail || d.error });
      else {
        await reload();
        toast.success("Status sincronizado");
      }
    } finally {
      setSyncing(false);
    }
  };

  const handleCancelarAsaas = async () => {
    if (!confirm("Cancelar esta cobrança no Asaas? O cliente não poderá mais pagar este boleto.")) return;
    setCanceling(true);
    try {
      const res = await fetch(`/api/billing/consumer-units/${id}/asaas`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Erro ao cancelar", { description: d.detail || d.error });
      } else {
        await reload();
        toast.success("Cobrança cancelada no Asaas");
      }
    } finally {
      setCanceling(false);
    }
  };

  const handleEnviarAsaas = async () => {
    setSendingAsaas(true);
    try {
      const res = await fetch(`/api/billing/consumer-units/${id}/asaas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billingType }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error("Erro ao enviar para Asaas", { description: d.detail || d.error });
      } else {
        await reload();
        toast.success("Cobrança enviada ao Asaas");
      }
    } finally {
      setSendingAsaas(false);
    }
  };

  if (loading) {
    return <div className="p-12 text-center text-sm text-muted-foreground">Carregando...</div>;
  }
  if (!data) {
    return <div className="p-12 text-center text-sm text-muted-foreground">Cobrança não encontrada</div>;
  }

  const st = STATUS_LABELS[data.status] ?? STATUS_LABELS.PENDENTE;

  return (
    <div className="space-y-4 max-w-5xl">
      <Link
        href={`/admin/faturamento/unidades-consumidoras/${mesParam}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </Link>

      <div
        className="rounded-xl p-5 text-white shadow-sm relative overflow-hidden"
        style={{ background: brandGradient }}
      >
        {/* círculos decorativos translúcidos, ecoando a capa do PDF */}
        <div
          className="absolute -top-16 -right-12 h-48 w-48 rounded-full"
          style={{ backgroundColor: "rgba(255,255,255,0.10)" }}
        />
        <div
          className="absolute -bottom-20 -left-10 h-56 w-56 rounded-full"
          style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
        />
        <div className="relative flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <p className="text-xs uppercase tracking-widest text-white/80">
              Cobrança · {formatMonthYear(data.mes, data.ano)}
            </p>
            <h1 className="text-2xl font-bold truncate">
              {data.consumerUnit.nome}
            </h1>
            <p className="text-sm text-white/85">
              UC {data.consumerUnit.codigoUc}
              {data.consumerUnit.consumer?.name &&
                ` · ${data.consumerUnit.consumer.name}`}
            </p>
          </div>
          <span
            className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold shadow-sm"
            style={{ backgroundColor: st.bg, color: st.text }}
          >
            {st.label}
          </span>
        </div>
      </div>

      <Card style={{ borderColor: `${brand.teal}30` }}>
        <CardContent className="grid gap-4 p-4 md:grid-cols-4 text-sm">
          <div>
            <p
              className="text-xs uppercase tracking-wide font-semibold"
              style={{ color: brand.tealDark }}
            >
              Consumidor
            </p>
            <p className="font-medium">{data.consumerUnit.consumer?.name ?? "-"}</p>
          </div>
          <div>
            <p
              className="text-xs uppercase tracking-wide font-semibold"
              style={{ color: brand.tealDark }}
            >
              CPF/CNPJ
            </p>
            <p className="font-medium">{data.consumerUnit.cpfCnpj ?? "-"}</p>
          </div>
          <div>
            <p
              className="text-xs uppercase tracking-wide font-semibold"
              style={{ color: brand.tealDark }}
            >
              Distribuidora
            </p>
            <p className="font-medium">{data.consumerUnit.distribuidora ?? "-"}</p>
          </div>
          <div>
            <p
              className="text-xs uppercase tracking-wide font-semibold"
              style={{ color: brand.tealDark }}
            >
              Valor a cobrar
            </p>
            <p className="font-bold text-lg" style={{ color: brand.orange }}>
              {data.valorCobranca != null ? formatBRL(data.valorCobranca) : "-"}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-4">
          <h2
            className="text-sm font-semibold uppercase tracking-wide"
            style={{ color: brand.tealDark }}
          >
            Valores da cobrança
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="Valor total da fatura (R$)">
              <input
                type="number"
                step="0.01"
                value={form.valorFatura}
                onChange={(e) => setForm({ ...form, valorFatura: e.target.value })}
                className={inputClass}
              />
            </FormField>
            <FormField label="Valor compensado pela usina (R$)">
              <input
                type="number"
                step="0.01"
                value={form.valorCompensado}
                onChange={(e) => setForm({ ...form, valorCompensado: e.target.value })}
                className={inputClass}
              />
            </FormField>
            <FormField label="Economia gerada (R$)">
              <input
                type="number"
                step="0.01"
                value={form.valorEconomia}
                onChange={(e) => setForm({ ...form, valorEconomia: e.target.value })}
                className={inputClass}
              />
            </FormField>
            <FormField label="Valor a cobrar do consumidor (R$)">
              <input
                type="number"
                step="0.01"
                value={form.valorCobranca}
                onChange={(e) => setForm({ ...form, valorCobranca: e.target.value })}
                className={inputClass}
              />
            </FormField>
            <FormField label="Data de vencimento">
              <input
                type="date"
                value={form.dataVencimento}
                onChange={(e) => setForm({ ...form, dataVencimento: e.target.value })}
                className={inputClass}
              />
            </FormField>
            <div className="md:col-span-2">
              <FormField label="Observações">
                <textarea
                  value={form.observacoes}
                  onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                  rows={3}
                  className={inputClass}
                />
              </FormField>
            </div>
          </div>
          <div>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className={primaryBtn}
              style={primaryBtnStyle}
              onMouseEnter={(e) =>
                Object.assign(e.currentTarget.style, primaryBtnHoverStyle)
              }
              onMouseLeave={(e) =>
                Object.assign(e.currentTarget.style, primaryBtnStyle)
              }
            >
              <Save className="h-4 w-4" />
              {saving ? "Salvando..." : savedFlash ? "Salvo!" : "Salvar"}
            </button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <h2
            className="text-sm font-semibold uppercase tracking-wide"
            style={{ color: brand.tealDark }}
          >
            Cobrança via Asaas.com.br
          </h2>
          {(() => {
            const installments = parseInstallments(data.installments);
            if (installments && installments.length > 0) {
              const pagas = installments.filter((it) => !!it.pagoEm).length;
              return (
                <div
                  className="rounded-lg border p-3 text-sm space-y-2"
                  style={{
                    borderColor: `${brand.teal}40`,
                    backgroundColor: `${brand.teal}0D`,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <strong>
                      Cobrança parcelada — {pagas}/{installments.length} pagas
                    </strong>
                    {data.asaasSyncedAt && (
                      <span className="text-xs text-muted-foreground">
                        Última sync:{" "}
                        {new Date(data.asaasSyncedAt).toLocaleString("pt-BR")}
                      </span>
                    )}
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground border-b">
                        <th className="text-left py-1">#</th>
                        <th className="text-left py-1">Vencimento</th>
                        <th className="text-right py-1">Valor</th>
                        <th className="text-left py-1 pl-2">Status</th>
                        <th className="text-left py-1">Pago em</th>
                        <th className="text-right py-1">Boleto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {installments.map((it: BillingInstallment, i: number) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-1.5">{i + 1}</td>
                          <td className="py-1.5">
                            {it.dueDate.split("-").reverse().join("/")}
                          </td>
                          <td className="py-1.5 text-right tabular-nums">
                            {formatBRL(it.valor)}
                          </td>
                          <td className="py-1.5 pl-2">
                            {it.pagoEm ? (
                              <span className="text-emerald-700 font-medium">
                                Pago
                              </span>
                            ) : it.asaasStatus === "DELETED" ? (
                              <span className="text-slate-500">Cancelado</span>
                            ) : (
                              <span className="text-amber-700">
                                {it.asaasStatus ?? "Aberto"}
                              </span>
                            )}
                          </td>
                          <td className="py-1.5">
                            {it.pagoEm
                              ? new Date(it.pagoEm).toLocaleDateString("pt-BR")
                              : "—"}
                          </td>
                          <td className="py-1.5 text-right">
                            {it.asaasInvoiceUrl ? (
                              <a
                                href={it.asaasInvoiceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:underline"
                                style={{ color: brand.tealDark }}
                              >
                                Abrir →
                              </a>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            }
            if (data.asaasChargeId) {
              return (
                <div
                  className="rounded-lg border p-3 text-sm space-y-1"
                  style={{
                    borderColor: `${brand.teal}40`,
                    backgroundColor: `${brand.teal}0D`,
                  }}
                >
                  <p>
                    <strong>Charge ID:</strong> {data.asaasChargeId}
                  </p>
                  {data.asaasStatus && (
                    <p>
                      <strong>Status Asaas:</strong> {data.asaasStatus}
                    </p>
                  )}
                  {data.asaasInvoiceUrl && (
                    <a
                      href={data.asaasInvoiceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium hover:underline"
                      style={{ color: brand.tealDark }}
                    >
                      Abrir fatura no Asaas →
                    </a>
                  )}
                  {data.asaasSyncedAt && (
                    <p className="text-xs text-muted-foreground">
                      Última sincronização:{" "}
                      {new Date(data.asaasSyncedAt).toLocaleString("pt-BR")}
                    </p>
                  )}
                </div>
              );
            }
            return (
              <p className="text-sm text-muted-foreground">
                Esta cobrança ainda não foi enviada ao Asaas.
              </p>
            );
          })()}
          <div className="flex flex-wrap items-end gap-3">
            <FormField label="Forma de pagamento">
              <select
                value={billingType}
                onChange={(e) => setBillingType(e.target.value as typeof billingType)}
                disabled={(!!data.asaasChargeId || !!data.installments) && data.status !== "CANCELADO"}
                className={inputClass}
              >
                <option value="BOLETO">Boleto</option>
                <option value="PIX">PIX</option>
                <option value="CREDIT_CARD">Cartão de crédito</option>
                <option value="UNDEFINED">Cliente escolhe no checkout</option>
              </select>
            </FormField>
            <button
              type="button"
              onClick={handleEnviarAsaas}
              disabled={
                sendingAsaas ||
                !form.valorCobranca ||
                ((!!data.asaasChargeId || !!data.installments) &&
                  data.status !== "CANCELADO")
              }
              className={primaryBtn}
              style={primaryBtnStyle}
              onMouseEnter={(e) => {
                if (!e.currentTarget.disabled)
                  Object.assign(e.currentTarget.style, primaryBtnHoverStyle);
              }}
              onMouseLeave={(e) =>
                Object.assign(e.currentTarget.style, primaryBtnStyle)
              }
            >
              <Send className="h-4 w-4" />
              {sendingAsaas
                ? "Enviando..."
                : data.status === "CANCELADO"
                  ? "Emitir nova cobrança"
                  : "Enviar cobrança ao Asaas"}
            </button>
            {(data.asaasChargeId || data.installments) && (
              <button
                type="button"
                onClick={handleSincronizar}
                disabled={syncing}
                className={secondaryBtn}
                style={{ borderColor: `${brand.teal}60`, color: brand.tealDark }}
              >
                <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
                {syncing ? "Sincronizando..." : "Sincronizar status"}
              </button>
            )}
            {(data.asaasChargeId || data.installments) && data.status !== "CANCELADO" && data.status !== "PAGO" && (
              <button
                type="button"
                onClick={handleCancelarAsaas}
                disabled={canceling}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border rounded-lg transition-colors disabled:opacity-50"
                style={{ borderColor: `${brand.orange}60`, color: brand.orange }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = `${brand.orange}15`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <XCircle className="h-4 w-4" />
                {canceling ? "Cancelando..." : "Cancelar cobrança"}
              </button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </label>
      {children}
    </div>
  );
}

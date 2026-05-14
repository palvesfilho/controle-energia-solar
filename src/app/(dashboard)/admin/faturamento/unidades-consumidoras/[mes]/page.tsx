"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, FileBarChart2, Search, Send, Receipt, X, XCircle, CheckCircle2, Plug } from "lucide-react";
import { toast } from "sonner";
import { formatMonthYear, formatBRL } from "@/lib/formatters";
import {
  DEFAULT_INTERVAL_DAYS,
  MAX_INSTALLMENTS,
  generateDueDates,
  splitValueEvenly,
} from "@/lib/billing-installments";

interface Row {
  consumerUnit: {
    id: string;
    nome: string;
    codigoUc: string;
    cpfCnpj: string | null;
    distribuidora: string | null;
    consumer: { id: string; name: string } | null;
  };
  billing: {
    id: string;
    valorCobranca: number | null;
    valorFatura: number | null;
    dataVencimento: string | null;
    notificarEmail?: boolean;
    notificarWhatsapp?: boolean;
    asaasChargeId?: string | null;
    asaasInvoiceUrl?: string | null;
    pagoEm?: string | null;
  } | null;
  status: string;
  faturaDistribuidoraDisponivel: boolean;
}

interface CobrancaModalState {
  billingId: string;
  consumerUnitNome: string;
  codigoUc: string;
  valorCobranca: number | null;
  dataVencimento: string;
  notificarEmail: boolean;
  notificarWhatsapp: boolean;
  jaEnviado: boolean;
  // Parcelamento
  parcelarAtivo: boolean;
  parcelasN: number;
  parcelasIntervaloDias: number;
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  PENDENTE: { label: "Pendente", className: "bg-slate-400 hover:bg-slate-500" },
  ENVIADO_ASAAS: { label: "Enviado ao Asaas", className: "bg-blue-500 hover:bg-blue-600" },
  PAGO: { label: "Pago", className: "bg-emerald-500 hover:bg-emerald-600" },
  ATRASADO: { label: "Atrasado", className: "bg-red-500 hover:bg-red-600" },
  CANCELADO: { label: "Cancelado", className: "bg-slate-600 hover:bg-slate-700" },
};

const selectClass =
  "text-sm border rounded-lg px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all";

function parseMes(mes: string): { ano: number; mesNum: number } | null {
  const m = mes.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  return { ano: Number(m[1]), mesNum: Number(m[2]) };
}

const MESES_OPTS = [
  { v: 1, l: "Janeiro" }, { v: 2, l: "Fevereiro" }, { v: 3, l: "Março" },
  { v: 4, l: "Abril" }, { v: 5, l: "Maio" }, { v: 6, l: "Junho" },
  { v: 7, l: "Julho" }, { v: 8, l: "Agosto" }, { v: 9, l: "Setembro" },
  { v: 10, l: "Outubro" }, { v: 11, l: "Novembro" }, { v: 12, l: "Dezembro" },
];

export default function FaturamentoUCMesPage() {
  const params = useParams();
  const router = useRouter();
  const mesParam = params.mes as string;
  const parsed = parseMes(mesParam);

  const anosOpts = useMemo(() => {
    const y = new Date().getFullYear();
    const arr: number[] = [];
    for (let i = y + 1; i >= y - 4; i--) arr.push(i);
    return arr;
  }, []);

  function navigateTo(ano: number, mesNum: number) {
    const novoMes = `${ano}-${String(mesNum).padStart(2, "0")}`;
    router.push(`/admin/faturamento/unidades-consumidoras/${novoMes}`);
  }

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "PENDENTE" | "ENVIADO_ASAAS" | "PAGO" | "ATRASADO" | "CANCELADO">("all");
  const [opening, setOpening] = useState<string | null>(null);
  const [batchSending, setBatchSending] = useState(false);
  const [batchType, setBatchType] = useState<"UNDEFINED" | "BOLETO" | "PIX" | "CREDIT_CARD">("BOLETO");
  const [cobrancaModal, setCobrancaModal] = useState<CobrancaModalState | null>(null);
  const [cobrancaBillingType, setCobrancaBillingType] =
    useState<"UNDEFINED" | "BOLETO" | "PIX" | "CREDIT_CARD">("BOLETO");
  const [cobrancaSaving, setCobrancaSaving] = useState<"save" | "send" | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  useEffect(() => {
    if (!parsed) {
      setLoading(false);
      return;
    }
    fetch(`/api/billing/consumer-units?ano=${parsed.ano}&mes=${parsed.mesNum}`)
      .then((r) => r.json())
      .then((data: Row[]) => setRows(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, [parsed?.ano, parsed?.mesNum]);

  const handleOpen = async (consumerUnitId: string) => {
    if (!parsed) return;
    setOpening(consumerUnitId);
    try {
      const res = await fetch("/api/billing/consumer-units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consumerUnitId, ano: parsed.ano, mes: parsed.mesNum }),
      });
      const billing = await res.json();
      window.location.href = `/admin/faturamento/unidades-consumidoras/${mesParam}/${billing.id}`;
    } catch {
      setOpening(null);
    }
  };

  const handleBatchAsaas = async () => {
    if (!parsed) return;
    const pendentes = rows.filter(
      (r) => r.billing && !!r.billing.valorCobranca && r.status === "PENDENTE",
    );
    if (pendentes.length === 0) {
      toast.error("Nenhuma cobrança pendente com valor preenchido neste mês.");
      return;
    }
    if (
      !confirm(
        `Enviar ${pendentes.length} cobrança(s) ao Asaas como ${batchType}? Cobranças já enviadas serão puladas.`,
      )
    ) {
      return;
    }
    setBatchSending(true);
    try {
      const res = await fetch("/api/billing/consumer-units/batch/asaas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ano: parsed.ano,
          mes: parsed.mesNum,
          billingType: batchType,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error("Erro no envio em lote", { description: d.detail || d.error });
      } else {
        const { summary } = d;
        toast.success("Envio concluído", {
          description: `${summary.ok} emitida(s), ${summary.skipped} pulada(s), ${summary.failed} falha(s).`,
        });
        const r2 = await fetch(
          `/api/billing/consumer-units?ano=${parsed.ano}&mes=${parsed.mesNum}`,
        );
        const j = await r2.json();
        setRows(Array.isArray(j) ? j : []);
      }
    } finally {
      setBatchSending(false);
    }
  };

  const openCobrancaModal = (r: Row) => {
    if (!r.billing) return;
    const vencISO = r.billing.dataVencimento
      ? r.billing.dataVencimento.slice(0, 10)
      : "";
    setCobrancaModal({
      billingId: r.billing.id,
      consumerUnitNome: r.consumerUnit.nome,
      codigoUc: r.consumerUnit.codigoUc,
      valorCobranca: r.billing.valorCobranca,
      dataVencimento: vencISO,
      notificarEmail: r.billing.notificarEmail ?? true,
      notificarWhatsapp: r.billing.notificarWhatsapp ?? false,
      jaEnviado: !!r.billing.asaasChargeId && r.status !== "CANCELADO",
      parcelarAtivo: false,
      parcelasN: 2,
      parcelasIntervaloDias: DEFAULT_INTERVAL_DAYS,
    });
  };

  const handleCancelar = async (billingId: string) => {
    if (!confirm("Cancelar esta cobrança no Asaas? O cliente não poderá mais pagar este boleto.")) return;
    setCancelingId(billingId);
    try {
      const res = await fetch(`/api/billing/consumer-units/${billingId}/asaas`, {
        method: "DELETE",
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Erro ao cancelar", { description: d.detail || d.error });
        return;
      }
      toast.success("Cobrança cancelada no Asaas");
      await refreshRows();
    } finally {
      setCancelingId(null);
    }
  };

  const refreshRows = async () => {
    if (!parsed) return;
    const r2 = await fetch(
      `/api/billing/consumer-units?ano=${parsed.ano}&mes=${parsed.mesNum}`,
    );
    const j = await r2.json();
    setRows(Array.isArray(j) ? j : []);
  };

  const handleSalvarCobranca = async () => {
    if (!cobrancaModal) return;
    setCobrancaSaving("save");
    try {
      const res = await fetch(
        `/api/billing/consumer-units/${cobrancaModal.billingId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dataVencimento: cobrancaModal.dataVencimento || null,
            notificarEmail: cobrancaModal.notificarEmail,
            notificarWhatsapp: cobrancaModal.notificarWhatsapp,
          }),
        },
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error("Erro ao salvar", { description: d.error || `HTTP ${res.status}` });
        return;
      }
      toast.success("Preferências salvas");
      await refreshRows();
      setCobrancaModal(null);
    } finally {
      setCobrancaSaving(null);
    }
  };

  const handleSalvarEEnviar = async () => {
    if (!cobrancaModal) return;
    if (cobrancaModal.jaEnviado) {
      toast.error("Esta cobrança já foi enviada ao Asaas.");
      return;
    }
    if (!cobrancaModal.valorCobranca || cobrancaModal.valorCobranca <= 0) {
      toast.error("Valor de cobrança não preenchido para esta UC.");
      return;
    }
    setCobrancaSaving("send");
    try {
      // Monta installments se parcelamento ativo (>= 2 parcelas).
      let installments: { dueDate: string; valor: number }[] | undefined;
      if (cobrancaModal.parcelarAtivo && cobrancaModal.parcelasN >= 2) {
        if (!cobrancaModal.dataVencimento) {
          toast.error("Defina a data do primeiro vencimento.");
          setCobrancaSaving(null);
          return;
        }
        const valores = splitValueEvenly(
          cobrancaModal.valorCobranca,
          cobrancaModal.parcelasN,
        );
        const datas = generateDueDates(
          new Date(cobrancaModal.dataVencimento + "T12:00:00"),
          cobrancaModal.parcelasN,
          cobrancaModal.parcelasIntervaloDias,
        );
        installments = valores.map((valor, i) => ({
          dueDate: datas[i],
          valor,
        }));
      }
      const res = await fetch(
        `/api/billing/consumer-units/${cobrancaModal.billingId}/asaas`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            billingType: cobrancaBillingType,
            dataVencimento: cobrancaModal.dataVencimento || null,
            notificarEmail: cobrancaModal.notificarEmail,
            notificarWhatsapp: cobrancaModal.notificarWhatsapp,
            installments,
          }),
        },
      );
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Erro ao enviar", { description: d.detail || d.error });
        return;
      }
      toast.success("Cobrança enviada ao Asaas");
      await refreshRows();
      setCobrancaModal(null);
    } finally {
      setCobrancaSaving(null);
    }
  };

  if (!parsed) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Mês inválido</div>;
  }

  const filtered = rows.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.consumerUnit.nome.toLowerCase().includes(q) ||
      r.consumerUnit.codigoUc.toLowerCase().includes(q) ||
      (r.consumerUnit.consumer?.name.toLowerCase().includes(q) ?? false)
    );
  });

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const kpis = rows.reduce(
    (acc, r) => {
      const valor = r.billing?.valorCobranca ?? 0;
      if (r.billing && r.status !== "CANCELADO") acc.faturamento += valor;
      if (r.status === "PAGO") acc.recebido += valor;
      const venc = r.billing?.dataVencimento ? new Date(r.billing.dataVencimento) : null;
      const vencido =
        venc !== null &&
        venc < hoje &&
        r.status !== "PAGO" &&
        r.status !== "CANCELADO";
      if (vencido) {
        acc.vencidasCount += 1;
        acc.inadimplencia += valor;
      }
      const semCobranca =
        !r.billing ||
        (!r.billing.asaasChargeId && r.status !== "CANCELADO");
      if (semCobranca) acc.naoCobradas += 1;
      return acc;
    },
    { faturamento: 0, recebido: 0, inadimplencia: 0, vencidasCount: 0, naoCobradas: 0 },
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
          <Plug className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">
            Cobrança UCs — {formatMonthYear(parsed.mesNum, parsed.ano)}
          </h1>
          <p className="text-sm text-muted-foreground">
            Selecione uma unidade consumidora para gerar/abrir a cobrança do mês
          </p>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Faturamento do mês
            </p>
            <p className="text-xl font-bold mt-1">{formatBRL(kpis.faturamento)}</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
              Recebido: {formatBRL(kpis.recebido)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Inadimplência
            </p>
            <p className="text-xl font-bold mt-1 text-red-600 dark:text-red-400">
              {formatBRL(kpis.inadimplencia)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {kpis.vencidasCount}{" "}
              {kpis.vencidasCount === 1 ? "cobrança" : "cobranças"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              UCs não cobradas
            </p>
            <p className="text-xl font-bold mt-1 text-amber-600 dark:text-amber-400">
              {kpis.naoCobradas}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              sem cobrança emitida
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Cobranças vencidas
            </p>
            <p className="text-xl font-bold mt-1 text-red-600 dark:text-red-400">
              {kpis.vencidasCount}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatBRL(kpis.inadimplencia)} em aberto
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Mês</label>
              <select
                value={parsed.mesNum}
                onChange={(e) => navigateTo(parsed.ano, Number(e.target.value))}
                className={selectClass}
              >
                {MESES_OPTS.map((m) => (
                  <option key={m.v} value={m.v}>
                    {m.l}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ano</label>
              <select
                value={parsed.ano}
                onChange={(e) => navigateTo(Number(e.target.value), parsed.mesNum)}
                className={selectClass}
              >
                {anosOpts.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                className={selectClass}
              >
                <option value="all">Todas</option>
                <option value="PENDENTE">Pendente</option>
                <option value="ENVIADO_ASAAS">Enviado ao Asaas</option>
                <option value="PAGO">Pago</option>
                <option value="ATRASADO">Atrasado</option>
                <option value="CANCELADO">Cancelado</option>
              </select>
            </div>
            <div className="relative flex-1 min-w-[220px] space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Buscar</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="UC, código ou consumidor..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className={`${selectClass} w-full pl-8`}
                />
              </div>
            </div>
            <select
              value={batchType}
              onChange={(e) => setBatchType(e.target.value as typeof batchType)}
              disabled={batchSending}
              className={selectClass}
            >
              <option value="PIX">PIX</option>
              <option value="BOLETO">Boleto</option>
              <option value="CREDIT_CARD">Cartão</option>
              <option value="UNDEFINED">Cliente escolhe</option>
            </select>
            <button
              type="button"
              onClick={handleBatchAsaas}
              disabled={batchSending || rows.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {batchSending ? "Enviando..." : "Enviar pendentes ao Asaas"}
            </button>
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma UC encontrada.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium text-xs uppercase tracking-wide">UC</th>
                    <th className="px-3 py-2 text-left font-medium text-xs uppercase tracking-wide">Nome</th>
                    <th className="px-3 py-2 text-left font-medium text-xs uppercase tracking-wide">Distribuidora</th>
                    <th className="px-3 py-2 text-right font-medium text-xs uppercase tracking-wide">Cobrança</th>
                    <th className="px-3 py-2 text-center font-medium text-xs uppercase tracking-wide">Status</th>
                    <th className="px-3 py-2 text-center font-medium text-xs uppercase tracking-wide">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const st = STATUS_LABELS[r.status] ?? STATUS_LABELS.PENDENTE;
                    return (
                      <tr key={r.consumerUnit.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-3 py-2.5 font-mono text-xs">{r.consumerUnit.codigoUc}</td>
                        <td className="px-3 py-2.5 font-medium">{r.consumerUnit.nome}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {r.consumerUnit.distribuidora ?? "-"}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {r.billing?.valorCobranca != null ? formatBRL(r.billing.valorCobranca) : "-"}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <Badge className={`${st.className} text-white`}>{st.label}</Badge>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {r.billing ? (
                              <>
                                <Link
                                  href={`/admin/faturamento/unidades-consumidoras/${mesParam}/${r.billing.id}`}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-muted transition-colors text-xs"
                                >
                                  <FileText className="h-3.5 w-3.5" />
                                  Ajustar Cobrança
                                </Link>
                                <a
                                  href={`/api/admin/faturamento/unidades-consumidoras/${r.billing.id}/demonstrativo`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Visualizar Demonstrativo de Economia"
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors text-xs"
                                >
                                  <FileBarChart2 className="h-3.5 w-3.5" />
                                  Visualizar Demonstrativo
                                </a>
                                {(() => {
                                  // Estado 4: Cobrança paga via Asaas → "Cobrança Finalizada" (verde sólido + tooltip)
                                  if (r.status === "PAGO") {
                                    const dataPagamento = r.billing.pagoEm
                                      ? new Date(r.billing.pagoEm).toLocaleDateString("pt-BR")
                                      : null;
                                    const tooltip = dataPagamento
                                      ? `Pago em ${dataPagamento} — clique para abrir no Asaas`
                                      : "Cobrança finalizada";
                                    const baseClass =
                                      "inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 transition-colors text-xs font-medium";
                                    if (r.billing.asaasInvoiceUrl) {
                                      return (
                                        <a
                                          href={r.billing.asaasInvoiceUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          title={tooltip}
                                          className={baseClass}
                                        >
                                          <CheckCircle2 className="h-3.5 w-3.5" />
                                          Cobrança Finalizada
                                        </a>
                                      );
                                    }
                                    return (
                                      <span title={tooltip} className={baseClass}>
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                        Cobrança Finalizada
                                      </span>
                                    );
                                  }
                                  // Estado 2: Enviada ao Asaas (e não paga/cancelada) → "Cancelar Cobrança" (vermelho)
                                  if (
                                    r.billing.asaasChargeId &&
                                    r.status !== "CANCELADO"
                                  ) {
                                    return (
                                      <button
                                        type="button"
                                        onClick={() => handleCancelar(r.billing!.id)}
                                        disabled={cancelingId === r.billing.id}
                                        title="Cancelar cobrança no Asaas (ex.: cliente pagou via PIX/dinheiro por fora)"
                                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors text-xs font-medium disabled:opacity-50"
                                      >
                                        <XCircle className="h-3.5 w-3.5" />
                                        {cancelingId === r.billing.id
                                          ? "Cancelando..."
                                          : "Cancelar Cobrança"}
                                      </button>
                                    );
                                  }
                                  // Estado 3: Cancelada → "Nova Cobrança" (azul)
                                  if (r.status === "CANCELADO") {
                                    return (
                                      <button
                                        type="button"
                                        onClick={() => openCobrancaModal(r)}
                                        title="Emitir nova cobrança (anterior cancelada)"
                                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors text-xs font-medium"
                                      >
                                        <Receipt className="h-3.5 w-3.5" />
                                        Nova Cobrança
                                      </button>
                                    );
                                  }
                                  // Estado 1 (default): Pendente → "Realizar Cobrança" (verde, relatório pronto)
                                  return (
                                    <button
                                      type="button"
                                      onClick={() => openCobrancaModal(r)}
                                      title="Realizar cobrança"
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors text-xs font-medium"
                                    >
                                      <Receipt className="h-3.5 w-3.5" />
                                      Realizar Cobrança
                                    </button>
                                  );
                                })()}
                              </>
                            ) : r.faturaDistribuidoraDisponivel ? (
                              <button
                                type="button"
                                disabled={opening === r.consumerUnit.id}
                                onClick={() => handleOpen(r.consumerUnit.id)}
                                title="A fatura da distribuidora está disponível — clique para gerar o demonstrativo de cobrança"
                                className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                              >
                                <FileText className="h-3.5 w-3.5" />
                                {opening === r.consumerUnit.id
                                  ? "Gerando..."
                                  : "Fatura Disponível — Emitir Demonstrativo"}
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled
                                title="Aguardando a fatura da distribuidora chegar — sincronize com a Infosimples ou suba o PDF manualmente"
                                className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium bg-red-600 text-white rounded-lg cursor-not-allowed opacity-90"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                Aguardando Fatura da Distribuidora
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {cobrancaModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => {
            if (!cobrancaSaving) setCobrancaModal(null);
          }}
        >
          <div
            className="bg-background rounded-lg shadow-xl w-full max-w-md border"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <div>
                <h2 className="text-base font-semibold">Realizar Cobrança</h2>
                <p className="text-xs text-muted-foreground">
                  UC {cobrancaModal.codigoUc} — {cobrancaModal.consumerUnitNome}
                </p>
              </div>
              <button
                type="button"
                disabled={!!cobrancaSaving}
                onClick={() => setCobrancaModal(null)}
                className="p-1 rounded hover:bg-muted disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              <div>
                <div className="text-xs text-muted-foreground">Valor da cobrança</div>
                <div className="text-lg font-semibold">
                  {cobrancaModal.valorCobranca != null
                    ? formatBRL(cobrancaModal.valorCobranca)
                    : "—"}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Data de pagamento (vencimento)
                </label>
                <input
                  type="date"
                  value={cobrancaModal.dataVencimento}
                  onChange={(e) =>
                    setCobrancaModal((s) =>
                      s ? { ...s, dataVencimento: e.target.value } : s,
                    )
                  }
                  className={`${selectClass} w-full`}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Forma de pagamento</label>
                <select
                  value={cobrancaBillingType}
                  onChange={(e) =>
                    setCobrancaBillingType(e.target.value as typeof cobrancaBillingType)
                  }
                  disabled={cobrancaModal.jaEnviado}
                  className={`${selectClass} w-full`}
                >
                  <option value="BOLETO">Boleto</option>
                  <option value="PIX">PIX</option>
                  <option value="CREDIT_CARD">Cartão</option>
                  <option value="UNDEFINED">Cliente escolhe</option>
                </select>
              </div>

              <div className="rounded-lg border p-3 space-y-3 bg-muted/20">
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cobrancaModal.parcelarAtivo}
                    disabled={cobrancaModal.jaEnviado}
                    onChange={(e) =>
                      setCobrancaModal((s) =>
                        s ? { ...s, parcelarAtivo: e.target.checked } : s,
                      )
                    }
                    className="h-4 w-4"
                  />
                  Parcelar pagamento (uso esporádico)
                </label>
                {cobrancaModal.parcelarAtivo && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">
                          Quantidade de parcelas
                        </label>
                        <select
                          value={cobrancaModal.parcelasN}
                          disabled={cobrancaModal.jaEnviado}
                          onChange={(e) =>
                            setCobrancaModal((s) =>
                              s ? { ...s, parcelasN: Number(e.target.value) } : s,
                            )
                          }
                          className={`${selectClass} w-full`}
                        >
                          {Array.from({ length: MAX_INSTALLMENTS - 1 }, (_, i) => i + 2).map(
                            (n) => (
                              <option key={n} value={n}>
                                {n} parcelas
                              </option>
                            ),
                          )}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">
                          Intervalo entre parcelas (dias)
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={60}
                          value={cobrancaModal.parcelasIntervaloDias}
                          disabled={cobrancaModal.jaEnviado}
                          onChange={(e) =>
                            setCobrancaModal((s) =>
                              s
                                ? {
                                    ...s,
                                    parcelasIntervaloDias: Math.max(
                                      1,
                                      Number(e.target.value) || 1,
                                    ),
                                  }
                                : s,
                            )
                          }
                          className={`${selectClass} w-full`}
                        />
                      </div>
                    </div>
                    {cobrancaModal.valorCobranca && cobrancaModal.dataVencimento ? (
                      <div className="text-xs space-y-1">
                        <div className="font-medium text-muted-foreground">
                          Pré-visualização:
                        </div>
                        {(() => {
                          const valores = splitValueEvenly(
                            cobrancaModal.valorCobranca,
                            cobrancaModal.parcelasN,
                          );
                          const datas = generateDueDates(
                            new Date(cobrancaModal.dataVencimento + "T12:00:00"),
                            cobrancaModal.parcelasN,
                            cobrancaModal.parcelasIntervaloDias,
                          );
                          return valores.map((v, i) => (
                            <div
                              key={i}
                              className="flex justify-between border-b border-dashed last:border-0 py-0.5"
                            >
                              <span>Parcela {i + 1}/{cobrancaModal.parcelasN}</span>
                              <span className="font-mono">
                                {formatBRL(v)} — {datas[i].split("-").reverse().join("/")}
                              </span>
                            </div>
                          ));
                        })()}
                        <div className="text-muted-foreground italic mt-1">
                          O cliente recebe os {cobrancaModal.parcelasN} boletos por email de uma vez.
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-amber-700">
                        Defina valor de cobrança e data do primeiro vencimento para pré-visualizar.
                      </div>
                    )}
                  </>
                )}
              </div>

              <div>
                <div className="text-sm font-medium mb-2">Notificar por</div>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={cobrancaModal.notificarEmail}
                      onChange={(e) =>
                        setCobrancaModal((s) =>
                          s ? { ...s, notificarEmail: e.target.checked } : s,
                        )
                      }
                      className="h-4 w-4"
                    />
                    E-mail
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={cobrancaModal.notificarWhatsapp}
                      onChange={(e) =>
                        setCobrancaModal((s) =>
                          s ? { ...s, notificarWhatsapp: e.target.checked } : s,
                        )
                      }
                      className="h-4 w-4"
                    />
                    WhatsApp
                    <span className="text-xs text-muted-foreground">
                      (preferência gravada; envio ainda não implementado)
                    </span>
                  </label>
                </div>
              </div>

              {cobrancaModal.jaEnviado && (
                <div className="text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded px-3 py-2">
                  Esta cobrança já foi enviada ao Asaas. Você pode atualizar as preferências,
                  mas não é possível reenviá-la.
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t bg-muted/30">
              <button
                type="button"
                onClick={() => setCobrancaModal(null)}
                disabled={!!cobrancaSaving}
                className="px-3 py-1.5 text-sm rounded-lg border hover:bg-muted transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSalvarCobranca}
                disabled={!!cobrancaSaving}
                className="px-3 py-1.5 text-sm rounded-lg border hover:bg-muted transition-colors disabled:opacity-50"
              >
                {cobrancaSaving === "save" ? "Salvando..." : "Salvar"}
              </button>
              <button
                type="button"
                onClick={handleSalvarEEnviar}
                disabled={!!cobrancaSaving || cobrancaModal.jaEnviado}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                {cobrancaSaving === "send" ? "Enviando..." : "Salvar e Enviar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

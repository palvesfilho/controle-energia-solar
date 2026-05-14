"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Ban,
  CircleCheck,
  FileDown,
  Loader2,
  Lock,
  LockOpen,
  Pencil,
  Receipt,
  RefreshCw,
  RotateCcw,
  Send,
  Sparkles,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { UploadSlot } from "@/components/billing/upload-slot";
import { BalancoHistoricoInvestidor } from "@/components/billing/balanco-historico-investidor";
import { formatMonthYear, formatBRL } from "@/lib/formatters";
import { isFinanceRole } from "@/lib/roles";

interface UcCompensacao {
  payableId: string;
  billingId: string | null;
  codigoUc: string | null;
  nome: string | null;
  /** kWh remunerável (bruto - legado abatido). Bate com valor pago. */
  kwhCompensado: number;
  /** kWh bruto compensado na fatura do consumidor (físico). */
  kwhCompensadoBruto: number;
  /** kWh base do payable (editável pelo operador). */
  kwhCompensadoBase: number;
  /** kWh excedente ao cap (legado). */
  kwhCreditoLegadoAbatido: number;
  valorBruto: number | null;
  valorLiquido: number | null;
  valorPago: number;
  payableStatus: string;
  billingStatus: string | null;
  pagoEm: string | null;
  formaPagamento: string | null;
  pagamentoNota: string | null;
  /** Linha de saldo carregado de mês anterior (se true, mostrar rótulo "saldo de ..."). */
  isSaldo: boolean;
  origemAno: number | null;
  origemMes: number | null;
  /** Mês da fatura do consumidor onde o crédito foi compensado fisicamente. */
  compensouAno: number;
  compensouMes: number;
  /** True se este natural foi cascadeado pra frente (zerado + saldo line no mês destino). */
  wasCarriedForward: boolean;
  carriedToAno: number | null;
  carriedToMes: number | null;
}

const FORMAS_PAGAMENTO: Array<{ value: string; label: string }> = [
  { value: "PIX_DIRETO", label: "PIX direto" },
  { value: "DINHEIRO", label: "Dinheiro" },
  { value: "TRANSFERENCIA", label: "Transferência bancária" },
  { value: "OUTRO", label: "Outro" },
];

const FORMA_LABEL: Record<string, string> = {
  PIX_DIRETO: "PIX direto",
  DINHEIRO: "Dinheiro",
  TRANSFERENCIA: "Transferência bancária",
  OUTRO: "Outro",
  BOLETO_ASAAS: "Boleto Asaas",
};

interface BillingDetail {
  id: string;
  plantId: string;
  ano: number;
  mes: number;
  status: string;
  valorTotal: number | null;
  observacoes: string | null;
  relatorioGeradoUrl: string | null;
  relatorioGeradoAt: string | null;
  notaFiscalUrl: string | null;
  notaFiscalAt: string | null;
  reciboTerraUrl: string | null;
  reciboTerraAt: string | null;
  reciboAluguelUrl: string | null;
  reciboAluguelAt: string | null;
  comprovantePagamentoUrl: string | null;
  comprovantePagamentoAt: string | null;
  encerradoEm: string | null;
  encerradoPorUserId: string | null;
  semPagamentoMotivo: string | null;
  plant: {
    id: string;
    name: string;
    numeroUsina: string | null;
    cpfCnpj: string | null;
    distribuidora: string | null;
    potenciaInstalada: number | null;
  };
  ucsCompensacao: UcCompensacao[];
  valorContaUcUsina: number | null;
  gestaoFixaMensal: number | null;
  valorBrutoRealizado: number;
  valorAjustesGerais: number;
  valorSaldoCarregadoProximo: number;
  valorLiquidoInvestidor: number;
  isPrimeiroRelatorio: boolean;
  faturasUsinaDescontadas: Array<{
    id: string;
    ano: number;
    mes: number;
    valor: number | null;
  }>;
  kwhCreditoLegadoTotal: number;
  valorCreditoLegadoTotal: number;
  monthlyReport: {
    id: string;
    status: string;
    publishedAt: string | null;
    publishedByUserId: string | null;
  } | null;
}

const MES_ABREV = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

const PAYABLE_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  AGUARDANDO_COMPENSACAO: { label: "Aguardando compensação", className: "bg-amber-100 text-amber-800" },
  AGUARDANDO_PAGAMENTO: { label: "Aguardando pagamento", className: "bg-blue-100 text-blue-800" },
  EM_COBRANCA_JUDICIAL: { label: "Em cobrança judicial", className: "bg-red-100 text-red-800" },
  DISPONIVEL: { label: "Disponível p/ pagar", className: "bg-emerald-100 text-emerald-800" },
  PAGO: { label: "Pago ao investidor", className: "bg-emerald-200 text-emerald-900" },
  SEM_COMPENSACAO: { label: "Sem compensação no mês", className: "bg-slate-100 text-slate-600" },
};

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  PENDENTE: { label: "Pendente", className: "bg-slate-400 hover:bg-slate-500" },
  AGUARDANDO_DOCUMENTOS: { label: "Aguardando documentos", className: "bg-amber-500 hover:bg-amber-600" },
  AGUARDANDO_PAGAMENTO: { label: "Aguardando pagamento", className: "bg-blue-500 hover:bg-blue-600" },
  PAGO: { label: "Pago", className: "bg-emerald-500 hover:bg-emerald-600" },
};

const inputClass =
  "w-full text-sm border rounded-lg px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all";

export default function FaturamentoUsinaDetalhePage() {
  const params = useParams();
  const mesParam = params.mes as string;
  const id = params.id as string;
  const { data: session } = useSession();
  const userRole = session?.user?.role ?? "";
  const canPayment = isFinanceRole(userRole);
  const isAdmin = userRole === "ADMIN";

  const [data, setData] = useState<BillingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [revertingPublish, setRevertingPublish] = useState(false);
  const [reabrindo, setReabrindo] = useState(false);
  const [encerrando, setEncerrando] = useState(false);
  const [pagamentoUc, setPagamentoUc] = useState<UcCompensacao | null>(null);
  const [cancelandoPagamento, setCancelandoPagamento] = useState(false);
  const [semPagamentoOpen, setSemPagamentoOpen] = useState(false);
  const [semPagamentoTipo, setSemPagamentoTipo] = useState<string>(
    "Saldo negativo (custos > compensação)",
  );
  const [semPagamentoTexto, setSemPagamentoTexto] = useState("");
  const [semPagamentoSaving, setSemPagamentoSaving] = useState(false);
  const [pagamentoForma, setPagamentoForma] = useState("PIX_DIRETO");
  const [pagamentoData, setPagamentoData] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [pagamentoNota, setPagamentoNota] = useState("");
  const [pagamentoSaving, setPagamentoSaving] = useState(false);

  const abrirPagamentoManual = (uc: UcCompensacao) => {
    if (!uc.billingId) {
      toast.error("Cobrança não encontrada", {
        description:
          "Esta UC ainda não tem cobrança gerada para o mês. Cadastre/sincronize a fatura antes.",
      });
      return;
    }
    setPagamentoUc(uc);
    setPagamentoForma("PIX_DIRETO");
    setPagamentoData(new Date().toISOString().slice(0, 10));
    setPagamentoNota("");
  };

  const abrirEdicaoPagamento = (uc: UcCompensacao) => {
    if (!uc.billingId) {
      toast.error("Cobrança não encontrada");
      return;
    }
    setPagamentoUc(uc);
    setPagamentoForma(uc.formaPagamento ?? "PIX_DIRETO");
    setPagamentoData(
      uc.pagoEm
        ? new Date(uc.pagoEm).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10),
    );
    setPagamentoNota(uc.pagamentoNota ?? "");
  };

  const cancelarPagamento = async () => {
    if (!pagamentoUc?.billingId) return;
    if (
      !confirm(
        "Cancelar este pagamento? A cobrança volta para 'Aguardando pagamento' e o crédito do investidor volta para o estado anterior.\n\nSe houver boleto Asaas, o estorno precisa ser feito manualmente no painel do Asaas.",
      )
    ) {
      return;
    }
    setCancelandoPagamento(true);
    try {
      const res = await fetch(
        `/api/billing/consumer-unit-billings/${pagamentoUc.billingId}/cancelar-pagamento`,
        { method: "POST" },
      );
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Erro ao cancelar pagamento", { description: j.error });
        return;
      }
      if (j.asaasWarning) {
        toast.warning("Pagamento cancelado", { description: j.asaasWarning });
      } else {
        toast.success("Pagamento cancelado", {
          description: "Cobrança voltou para 'Aguardando pagamento'.",
        });
      }
      setPagamentoUc(null);
      await reload();
    } finally {
      setCancelandoPagamento(false);
    }
  };

  const confirmarPagamentoManual = async () => {
    if (!pagamentoUc?.billingId) return;
    setPagamentoSaving(true);
    try {
      const res = await fetch(
        `/api/billing/consumer-unit-billings/${pagamentoUc.billingId}/pagamento-manual`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            formaPagamento: pagamentoForma,
            pagoEm: pagamentoData ? `${pagamentoData}T12:00:00.000Z` : undefined,
            pagamentoNota,
          }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error("Erro ao registrar pagamento", {
          description: err.error ?? "Falha desconhecida.",
        });
        return;
      }
      const result = await res.json().catch(() => ({}));
      const asaas = result?.asaas;
      const isEdit = !!pagamentoUc?.pagoEm;
      const tituloOk = isEdit ? "Pagamento atualizado" : "Pagamento registrado";
      if (asaas?.attempted && !asaas.ok && asaas.skipped !== "asaas_ja_recebido") {
        toast.warning(`${tituloOk}, mas Asaas falhou`, {
          description: `O boleto não foi baixado no Asaas: ${asaas.error ?? "erro desconhecido"}. Dê baixa manualmente no painel.`,
        });
      } else if (asaas?.attempted && asaas.ok) {
        toast.success(tituloOk, {
          description: isEdit
            ? "Forma/data/observação atualizadas."
            : "Boleto Asaas baixado e payable do investidor liberado.",
        });
      } else {
        toast.success(tituloOk, {
          description: isEdit
            ? "Forma/data/observação atualizadas."
            : "Payable do investidor liberado.",
        });
      }
      setPagamentoUc(null);
      await reload();
    } finally {
      setPagamentoSaving(false);
    }
  };

  const reload = async () => {
    const r = await fetch(`/api/billing/plants/${id}`);
    if (r.ok) {
      const d = await r.json();
      setData(d);
    }
  };

  useEffect(() => {
    setLoading(true);
    reload().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const upload = async (type: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("type", type);
    const res = await fetch(`/api/billing/plants/${id}/upload`, {
      method: "POST",
      body: fd,
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast.error("Erro ao enviar arquivo", { description: d.error });
      return;
    }
    await reload();
    toast.success("Arquivo enviado");
  };

  const fetchAndOpenPdf = async (
    publish: boolean,
  ): Promise<"ok" | "fail"> => {
    if (!data) return "fail";
    const qs = `ano=${data.ano}&mes=${data.mes}${publish ? "&publish=1" : ""}`;
    const res = await fetch(
      `/api/plants/${data.plantId}/monthly-report/generate?${qs}`,
      { method: "POST" },
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(publish ? "Erro ao publicar" : "Erro ao gerar pré-visualização", {
        description: err.error ?? "Falha ao calcular/gerar o PDF.",
      });
      return "fail";
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return "ok";
  };

  const handlePreview = async () => {
    setGeneratingReport(true);
    try {
      const r = await fetchAndOpenPdf(false);
      if (r === "ok") {
        toast.success("Pré-visualização gerada", {
          description:
            data?.monthlyReport?.status === "PUBLISHED"
              ? "Relatório está publicado — PDF veio do snapshot."
              : "Salvo como rascunho. Clique em Publicar para travar.",
        });
        await reload();
      }
    } catch (e) {
      toast.error("Erro ao gerar pré-visualização", {
        description: e instanceof Error ? e.message : "Erro desconhecido",
      });
    } finally {
      setGeneratingReport(false);
    }
  };

  const handlePublish = async () => {
    if (!data) return;
    if (
      !confirm(
        "Publicar o relatório do investidor? Após publicado, os números ficam congelados (snapshot). Para corrigir, será preciso reverter a publicação.",
      )
    ) {
      return;
    }
    setPublishing(true);
    try {
      const r = await fetchAndOpenPdf(true);
      if (r === "ok") {
        toast.success("Relatório publicado", {
          description: "Snapshot dos números travado. PDF disponível para envio ao investidor.",
        });
        await reload();
      }
    } catch (e) {
      toast.error("Erro ao publicar", {
        description: e instanceof Error ? e.message : "Erro desconhecido",
      });
    } finally {
      setPublishing(false);
    }
  };

  const handleRevertPublish = async () => {
    if (!data) return;
    if (
      !confirm(
        "Reverter a publicação? O relatório volta para rascunho e o snapshot é descartado.",
      )
    ) {
      return;
    }
    setRevertingPublish(true);
    try {
      const res = await fetch(
        `/api/plants/${data.plantId}/monthly-report/reverter-publicacao?ano=${data.ano}&mes=${data.mes}`,
        { method: "POST" },
      );
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Erro ao reverter", { description: j.error });
        return;
      }
      toast.success("Publicação revertida — relatório voltou para rascunho.");
      await reload();
    } finally {
      setRevertingPublish(false);
    }
  };

  const handleReabrir = async () => {
    if (!data) return;
    if (
      !confirm(
        "Reabrir mês? O comprovante permanece anexado, mas as edições ficam liberadas até você re-encerrar.",
      )
    ) {
      return;
    }
    setReabrindo(true);
    try {
      const res = await fetch(`/api/billing/plants/${data.id}/reabrir`, {
        method: "POST",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Erro ao reabrir", { description: j.error });
        return;
      }
      toast.success("Mês reaberto — edições liberadas.");
      await reload();
    } finally {
      setReabrindo(false);
    }
  };

  const abrirSemPagamento = () => {
    setSemPagamentoTipo("Saldo negativo (custos > compensação)");
    setSemPagamentoTexto("");
    setSemPagamentoOpen(true);
  };

  const confirmarSemPagamento = async () => {
    if (!data) return;
    const isOutro = semPagamentoTipo === "OUTRO";
    if (isOutro && !semPagamentoTexto.trim()) {
      toast.error("Descreva o motivo no campo de texto.");
      return;
    }
    const motivo = isOutro
      ? semPagamentoTexto.trim()
      : semPagamentoTexto.trim()
        ? `${semPagamentoTipo} — ${semPagamentoTexto.trim()}`
        : semPagamentoTipo;
    setSemPagamentoSaving(true);
    try {
      const res = await fetch(
        `/api/billing/plants/${data.id}/encerrar-sem-pagamento`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ motivo }),
        },
      );
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Erro ao encerrar", { description: j.error });
        return;
      }
      toast.success("Mês encerrado sem pagamento", {
        description: "Edições travadas. Apenas ADMIN pode reabrir.",
      });
      setSemPagamentoOpen(false);
      await reload();
    } finally {
      setSemPagamentoSaving(false);
    }
  };

  const handleEncerrar = async () => {
    if (!data) return;
    if (
      !confirm(
        "Encerrar mês de novo? Após isso, apenas ADMIN poderá editar payables, faturas e documentos.",
      )
    ) {
      return;
    }
    setEncerrando(true);
    try {
      const res = await fetch(`/api/billing/plants/${data.id}/encerrar`, {
        method: "POST",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Erro ao encerrar", { description: j.error });
        return;
      }
      toast.success("Mês encerrado — edições travadas.");
      await reload();
    } finally {
      setEncerrando(false);
    }
  };

  const removeFile = async (type: string) => {
    const res = await fetch(`/api/billing/plants/${id}/upload?type=${type}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast.error("Erro ao remover", { description: d.error });
      return;
    }
    await reload();
    toast.success("Arquivo removido");
  };

  if (loading) {
    return <div className="p-12 text-center text-sm text-muted-foreground">Carregando...</div>;
  }
  if (!data) {
    return <div className="p-12 text-center text-sm text-muted-foreground">Faturamento não encontrado</div>;
  }

  const docsCompletos = !!(data.notaFiscalUrl && data.reciboTerraUrl && data.reciboAluguelUrl);
  const st = STATUS_LABELS[data.status] ?? STATUS_LABELS.PENDENTE;

  // Travas: encerrado bloqueia edicao para todos exceto ADMIN.
  const isEncerrado = !!data.encerradoEm;
  const editLocked = isEncerrado && !isAdmin;
  const reportStatus = data.monthlyReport?.status ?? null;
  const isPublished = reportStatus === "PUBLISHED";
  // Mostra "Encerrar de novo" so quando: tem comprovante anexado +
  // mes esta reaberto + usuario eh ADMIN. Cobre o caso "ADMIN reabriu,
  // editou, e quer travar de volta sem ter que remover/re-uploadar".
  const podeReencerrar =
    !!data.comprovantePagamentoUrl && !isEncerrado && isAdmin;

  return (
    <div className="space-y-4 max-w-5xl">
      <Link
        href={`/admin/faturamento/usinas/${mesParam}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </Link>

      {isEncerrado && (
        <Card className="border-slate-300 bg-slate-50 dark:bg-slate-900/40">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-start gap-3">
              <Lock className="h-5 w-5 text-slate-700 dark:text-slate-300 mt-0.5" />
              <div>
                <p className="font-semibold text-sm">
                  {data.semPagamentoMotivo
                    ? "Mês encerrado sem pagamento"
                    : "Mês encerrado"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {data.semPagamentoMotivo ? (
                    <>
                      Formalizado em{" "}
                      {data.encerradoEm
                        ? new Date(data.encerradoEm).toLocaleString("pt-BR")
                        : "—"}
                      . Motivo:{" "}
                      <span className="font-medium">
                        {data.semPagamentoMotivo}
                      </span>
                      . Edições travadas — apenas ADMIN pode mexer.
                    </>
                  ) : (
                    <>
                      Comprovante de pagamento anexado em{" "}
                      {data.encerradoEm
                        ? new Date(data.encerradoEm).toLocaleString("pt-BR")
                        : "—"}
                      . Edições travadas — apenas ADMIN pode mexer.
                    </>
                  )}
                </p>
              </div>
            </div>
            {isAdmin && (
              <button
                type="button"
                onClick={handleReabrir}
                disabled={reabrindo}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-400 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-100 disabled:opacity-50"
              >
                {reabrindo ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LockOpen className="h-4 w-4" />
                )}
                Reabrir mês
              </button>
            )}
          </CardContent>
        </Card>
      )}

      {!isEncerrado && podeReencerrar && (
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/30">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-start gap-3">
              <LockOpen className="h-5 w-5 text-amber-700 mt-0.5" />
              <div>
                <p className="font-semibold text-sm text-amber-900 dark:text-amber-200">
                  Mês reaberto temporariamente
                </p>
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  Comprovante já anexado, mas o lock foi removido para edição.
                  Quando terminar, encerre de novo para travar.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleEncerrar}
              disabled={encerrando}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {encerrando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Lock className="h-4 w-4" />
              )}
              Encerrar mês
            </button>
          </CardContent>
        </Card>
      )}

      <div className="flex items-start gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{data.plant.name}</h1>
          <p className="text-sm text-muted-foreground">
            Faturamento — {formatMonthYear(data.mes, data.ano)}
            {data.plant.numeroUsina && ` · Nº ${data.plant.numeroUsina}`}
          </p>
        </div>
        <Badge className={`${st.className} text-white`}>{st.label}</Badge>
      </div>

      <Card>
        <CardContent className="grid gap-4 p-4 md:grid-cols-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">CPF/CNPJ</p>
            <p className="font-medium">{data.plant.cpfCnpj ?? "-"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Distribuidora</p>
            <p className="font-medium">{data.plant.distribuidora ?? "-"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Potência</p>
            <p className="font-medium">
              {data.plant.potenciaInstalada ? `${data.plant.potenciaInstalada} kWp` : "-"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Valor do faturamento</p>
            <p className="font-medium">
              {data.valorTotal != null ? formatBRL(data.valorTotal) : "-"}
            </p>
          </div>
        </CardContent>
      </Card>

      <GeracaoInversorCard
        plantId={data.plantId}
        ano={data.ano}
        mes={data.mes}
        disabled={editLocked}
      />

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Receipt className="h-4 w-4 text-amber-600" />
                Despesas fixas do mês
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Estes valores serão descontados do bruto na hora de gerar o relatório do investidor.
              </p>
            </div>
            {data.isPrimeiroRelatorio && data.faturasUsinaDescontadas.length > 1 && (
              <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-xs font-semibold">
                1º RELATÓRIO — INCLUI FATURAS ANTERIORES
              </span>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Conta de energia da usina
              </p>
              <p className="text-lg font-semibold tabular-nums mt-0.5">
                {data.valorContaUcUsina != null
                  ? formatBRL(data.valorContaUcUsina)
                  : "—"}
              </p>
              {data.faturasUsinaDescontadas.length > 1 ? (
                <div className="mt-2 space-y-0.5 border-t pt-1.5">
                  {data.faturasUsinaDescontadas.map((f) => (
                    <div
                      key={f.id}
                      className="flex justify-between items-center gap-2 text-xs text-muted-foreground"
                    >
                      <span>
                        {MES_ABREV[f.mes - 1]}/{String(f.ano).slice(-2)}
                      </span>
                      <EditableFaturaValor
                        billId={f.id}
                        valor={f.valor}
                        onSaved={reload}
                        disabled={editLocked}
                      />
                    </div>
                  ))}
                </div>
              ) : data.faturasUsinaDescontadas[0] ? (
                <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>UC geradora · {formatMonthYear(data.mes, data.ano)}</span>
                  <EditableFaturaValor
                    billId={data.faturasUsinaDescontadas[0].id}
                    valor={data.faturasUsinaDescontadas[0].valor}
                    onSaved={reload}
                    disabled={editLocked}
                  />
                </div>
              ) : (
                <p className="text-xs text-muted-foreground mt-0.5">
                  UC geradora · {formatMonthYear(data.mes, data.ano)} (sem fatura registrada)
                </p>
              )}
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Gestão de energia
              </p>
              <p className="text-lg font-semibold tabular-nums mt-0.5">
                {data.gestaoFixaMensal != null
                  ? formatBRL(data.gestaoFixaMensal)
                  : "—"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Apenas mês de competência ({MES_ABREV[data.mes - 1]}/
                {String(data.ano).slice(-2)}) · não cobrada nos meses sem compensação
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-emerald-600" />
              Resumo do faturamento mensal da usina
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {data.ucsCompensacao.length} UC(s) no rateio do período
            </p>
          </div>
          {data.ucsCompensacao.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              Nenhum crédito destinado neste mês. Verifique se as faturas das UCs do
              rateio já foram cadastradas.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">UC</th>
                    <th className="px-3 py-2 text-right font-medium">kWh compensado</th>
                    <th className="px-3 py-2 text-right font-medium">Valor (líquido)</th>
                    <th className="px-3 py-2 text-right font-medium">Valor pago</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.ucsCompensacao.map((uc) => {
                    const badge =
                      PAYABLE_STATUS_BADGE[uc.payableStatus] ?? {
                        label: uc.payableStatus,
                        className: "bg-slate-100 text-slate-800",
                      };
                    const podePagarManual =
                      uc.payableStatus === "AGUARDANDO_PAGAMENTO" ||
                      uc.payableStatus === "EM_COBRANCA_JUDICIAL";
                    const jaPago = !!uc.pagoEm;
                    const isEmptyRow = uc.payableStatus === "SEM_COMPENSACAO";
                    const podeEditarKwh =
                      !isEmptyRow &&
                      uc.payableStatus !== "PAGO" &&
                      uc.payableStatus !== "EM_COBRANCA_JUDICIAL" &&
                      !editLocked;
                    return (
                      <tr
                        key={uc.payableId}
                        className={`border-t ${uc.isSaldo ? "bg-amber-50/40 dark:bg-amber-950/10" : ""}`}
                      >
                        <td className="px-3 py-2">
                          <div className="font-medium">{uc.nome ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">
                            {uc.codigoUc ?? "—"}
                            <span className="ml-1.5 text-muted-foreground/70">
                              · compensou em {MES_ABREV[uc.compensouMes - 1]}/{String(uc.compensouAno).slice(-2)}
                            </span>
                          </div>
                          {uc.isSaldo && uc.origemAno != null && uc.origemMes != null && (
                            <div className="mt-0.5 inline-flex items-center rounded bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-200 uppercase tracking-wide">
                              saldo de {MES_ABREV[uc.origemMes - 1]}/{String(uc.origemAno).slice(-2)}
                            </div>
                          )}
                          {uc.wasCarriedForward && uc.carriedToAno != null && uc.carriedToMes != null && (
                            <div className="mt-0.5 inline-flex items-center rounded bg-blue-100 dark:bg-blue-900/40 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800 dark:text-blue-200 uppercase tracking-wide">
                              → carregado pra {MES_ABREV[uc.carriedToMes - 1]}/{String(uc.carriedToAno).slice(-2)}{" "}
                              ({uc.kwhCompensado.toLocaleString("pt-BR", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}{" "}
                              kWh)
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          <EditableUcKwh
                            payableId={uc.payableId}
                            kwh={uc.kwhCompensadoBase}
                            disabled={!podeEditarKwh}
                            onSaved={reload}
                          />
                          {uc.kwhCreditoLegadoAbatido > 0 && (
                            <div className="text-[10px] text-amber-700 mt-0.5">
                              bruto{" "}
                              {uc.kwhCompensadoBruto.toLocaleString("pt-BR", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                              {" "}− legado{" "}
                              {uc.kwhCreditoLegadoAbatido.toLocaleString("pt-BR", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {uc.valorLiquido != null ? formatBRL(uc.valorLiquido) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {uc.valorPago > 0 ? (
                            <div>
                              <div className="font-medium text-emerald-700">
                                {formatBRL(uc.valorPago)}
                              </div>
                              {uc.formaPagamento && (
                                <div className="text-xs text-muted-foreground">
                                  {FORMA_LABEL[uc.formaPagamento] ?? uc.formaPagamento}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
                            >
                              {badge.label}
                            </span>
                            {podePagarManual && !jaPago && !editLocked && (
                              <button
                                type="button"
                                onClick={() => abrirPagamentoManual(uc)}
                                className="inline-flex items-center gap-1 rounded-md border border-emerald-600 px-2 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 transition-colors"
                                title="Marcar pagamento manualmente (PIX direto, dinheiro, etc.)"
                              >
                                <CircleCheck className="h-3 w-3" />
                                Marcar pago
                              </button>
                            )}
                            {jaPago && !editLocked && (
                              <button
                                type="button"
                                onClick={() => abrirEdicaoPagamento(uc)}
                                className="inline-flex items-center gap-1 rounded-md border border-slate-400 px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                                title="Editar forma/data/observação do pagamento (corrigir digitação)"
                              >
                                <Pencil className="h-3 w-3" />
                                Editar pagamento
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-muted/30 text-sm font-semibold">
                  <tr className="border-t">
                    <td className="px-3 py-2">Total</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {data.ucsCompensacao
                        .reduce((s, u) => s + u.kwhCompensado, 0)
                        .toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{" "}
                      kWh
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatBRL(
                        data.ucsCompensacao.reduce(
                          (s, u) => s + (u.valorLiquido ?? 0),
                          0,
                        ),
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                      {formatBRL(
                        data.ucsCompensacao.reduce((s, u) => s + u.valorPago, 0),
                      )}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-emerald-200 bg-emerald-50/30 dark:bg-emerald-950/20">
        <CardContent className="p-4 space-y-3">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Wallet className="h-4 w-4 text-emerald-600" />
              Valor líquido a pagar ao investidor
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Bruto realizado (UCs com pagamento liberado) menos as despesas fixas. Mesma fórmula do PDF do investidor.
            </p>
          </div>
          <div className="space-y-1.5 text-sm">
            <div className="flex items-center justify-between">
              <span>Bruto realizado (UCs disponíveis ou pagas)</span>
              <span className="tabular-nums font-medium">
                {formatBRL(data.valorBrutoRealizado)}
              </span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>− Conta de energia da usina</span>
              <span className="tabular-nums">
                {formatBRL(data.valorContaUcUsina ?? 0)}
              </span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>− Gestão de energia</span>
              <span className="tabular-nums">
                {formatBRL(data.gestaoFixaMensal ?? 0)}
              </span>
            </div>
            <div
              className="flex items-center justify-between text-muted-foreground"
              title="Amortização de saldos negativos anteriores e ajustes diversos"
            >
              <span>− Multas, negociações, gestão, outros</span>
              <span className="tabular-nums">
                {formatBRL(data.valorAjustesGerais ?? 0)}
              </span>
            </div>
            <div className="flex items-center justify-between border-t pt-2 mt-1.5 text-base">
              <span className="font-semibold">Líquido ao investidor</span>
              <span className="font-bold tabular-nums text-emerald-700">
                {formatBRL(data.valorLiquidoInvestidor)}
              </span>
            </div>
          </div>
          {data.valorSaldoCarregadoProximo > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-1 text-sm">
              <p className="font-semibold text-amber-800 dark:text-amber-200">
                ⚠ Saldo negativo carregado para o próximo mês
              </p>
              <div className="flex items-center justify-between text-xs">
                <span className="text-amber-700 dark:text-amber-300">
                  Custos do mês excederam a compensação. Valor a amortizar:
                </span>
                <span className="tabular-nums font-medium text-amber-800 dark:text-amber-200">
                  {formatBRL(data.valorSaldoCarregadoProximo)}
                </span>
              </div>
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Ao publicar o relatório, esse valor vira um débito do
                investidor e é abatido automaticamente nas próximas remunerações.
              </p>
            </div>
          )}
          {data.kwhCreditoLegadoTotal > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-1 text-sm">
              <p className="font-semibold text-amber-800 dark:text-amber-200">
                ⚠ Crédito legado abatido — não cobrado do investidor
              </p>
              <div className="flex items-center justify-between text-xs">
                <span className="text-amber-700 dark:text-amber-300">
                  kWh excedente ao cap (saldo + injeção do mês)
                </span>
                <span className="tabular-nums font-medium text-amber-800 dark:text-amber-200">
                  {data.kwhCreditoLegadoTotal.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{" "}
                  kWh
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-amber-700 dark:text-amber-300">
                  Valor não remunerável (créditos pré-existentes nas UCs)
                </span>
                <span className="tabular-nums font-medium text-amber-800 dark:text-amber-200">
                  {formatBRL(data.valorCreditoLegadoTotal)}
                </span>
              </div>
            </div>
          )}
          <div className="border-t pt-3 flex flex-wrap items-center justify-end gap-2">
            {isPublished && (
              <span
                className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800"
                title={
                  data.monthlyReport?.publishedAt
                    ? `Publicado em ${new Date(data.monthlyReport.publishedAt).toLocaleString("pt-BR")}`
                    : "Publicado"
                }
              >
                <CircleCheck className="h-3 w-3" />
                Publicado
                {data.monthlyReport?.publishedAt &&
                  ` em ${new Date(data.monthlyReport.publishedAt).toLocaleDateString("pt-BR")}`}
              </span>
            )}
            {!isPublished && reportStatus === "DRAFT" && (
              <span
                className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800"
                title="Rascunho — números recalculam toda vez que você gera"
              >
                <Pencil className="h-3 w-3" />
                Rascunho
              </span>
            )}

            {isPublished ? (
              <>
                <button
                  type="button"
                  onClick={handlePreview}
                  disabled={generatingReport}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                  title="Baixa o PDF a partir do snapshot publicado (não recalcula)."
                >
                  {generatingReport ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Abrindo...
                    </>
                  ) : (
                    <>
                      <FileDown className="h-4 w-4" />
                      Baixar PDF publicado
                    </>
                  )}
                </button>
                {isAdmin && !isEncerrado && (
                  <button
                    type="button"
                    onClick={handleRevertPublish}
                    disabled={revertingPublish}
                    className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium border border-rose-300 text-rose-700 bg-white rounded-lg hover:bg-rose-50 disabled:opacity-50"
                    title="Volta o relatório para rascunho e descarta o snapshot."
                  >
                    {revertingPublish ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RotateCcw className="h-4 w-4" />
                    )}
                    Reverter publicação
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handlePreview}
                  disabled={generatingReport || editLocked}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-emerald-600 text-emerald-700 bg-white rounded-lg hover:bg-emerald-50 transition-colors disabled:opacity-50"
                  title={
                    editLocked
                      ? "Mês encerrado — apenas ADMIN edita"
                      : "Recalcula e gera um PDF de rascunho. Não trava nada."
                  }
                >
                  {generatingReport ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Gerando...
                    </>
                  ) : (
                    <>
                      <FileDown className="h-4 w-4" />
                      Gerar pré-visualização
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handlePublish}
                  disabled={publishing || editLocked}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                  title={
                    editLocked
                      ? "Mês encerrado — apenas ADMIN edita"
                      : "Trava os números (snapshot) e marca como publicado. PDF imutável."
                  }
                >
                  {publishing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Publicando...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Publicar relatório
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <BalancoHistoricoInvestidor
        plantId={data.plantId}
        destacarMes={{ ano: data.ano, mes: data.mes }}
      />

      <Card>
        <CardContent className="p-4 space-y-3">
          <h2 className="text-sm font-semibold">Relatório do investidor (fallback)</h2>
          <p className="text-xs text-muted-foreground">
            Após confirmar os pagamentos das UCs (Asaas + manuais), clique em
            <strong className="text-foreground"> Gerar PDF do investidor</strong>{" "}
            (botão no card de Valor líquido acima) para recalcular kWh injetado,
            compensado, crédito e valor a receber. O relatório é salvo como
            PUBLISHED e aberto em nova aba.
          </p>
          <UploadSlot
            label="Relatório de faturamento (upload manual — fallback)"
            description="Use apenas se o gerador automático falhar."
            currentUrl={data.relatorioGeradoUrl}
            uploadedAt={data.relatorioGeradoAt}
            disabled={editLocked}
            disabledReason={editLocked ? "Mês encerrado — apenas ADMIN edita." : undefined}
            onUpload={(f) => upload("relatorio", f)}
            onDelete={() => removeFile("relatorio")}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <h2 className="text-sm font-semibold">Documentos do proprietário da usina</h2>
          <div className="grid gap-3 md:grid-cols-3">
            <UploadSlot
              label="Nota Fiscal"
              description="NF emitida pelo dono da usina."
              currentUrl={data.notaFiscalUrl}
              uploadedAt={data.notaFiscalAt}
              disabled={editLocked}
              disabledReason={editLocked ? "Mês encerrado — apenas ADMIN edita." : undefined}
              onUpload={(f) => upload("nota_fiscal", f)}
              onDelete={() => removeFile("nota_fiscal")}
            />
            <UploadSlot
              label="Recibo de Terra"
              description="Comprovante de pagamento de arrendamento de terra."
              currentUrl={data.reciboTerraUrl}
              uploadedAt={data.reciboTerraAt}
              disabled={editLocked}
              disabledReason={editLocked ? "Mês encerrado — apenas ADMIN edita." : undefined}
              onUpload={(f) => upload("recibo_terra", f)}
              onDelete={() => removeFile("recibo_terra")}
            />
            <UploadSlot
              label="Recibo de Aluguel de Equipamento"
              description="Comprovante de aluguel dos equipamentos."
              currentUrl={data.reciboAluguelUrl}
              uploadedAt={data.reciboAluguelAt}
              disabled={editLocked}
              disabledReason={editLocked ? "Mês encerrado — apenas ADMIN edita." : undefined}
              onUpload={(f) => upload("recibo_aluguel", f)}
              onDelete={() => removeFile("recibo_aluguel")}
            />
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={pagamentoUc !== null}
        onOpenChange={(open) => !open && setPagamentoUc(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {pagamentoUc?.pagoEm
                ? "Editar pagamento"
                : "Registrar pagamento manual"}
            </DialogTitle>
            <DialogDescription>
              {pagamentoUc?.nome ?? "—"} ({pagamentoUc?.codigoUc ?? "—"}) —{" "}
              {pagamentoUc?.valorLiquido != null
                ? formatBRL(pagamentoUc.valorLiquido)
                : "—"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <FormField label="Forma de pagamento">
              <select
                value={pagamentoForma}
                onChange={(e) => setPagamentoForma(e.target.value)}
                className={inputClass}
              >
                {FORMAS_PAGAMENTO.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Data do pagamento">
              <input
                type="date"
                value={pagamentoData}
                onChange={(e) => setPagamentoData(e.target.value)}
                className={inputClass}
              />
            </FormField>
            <FormField label="Observação (opcional)">
              <textarea
                value={pagamentoNota}
                onChange={(e) => setPagamentoNota(e.target.value)}
                rows={2}
                placeholder="Ex.: PIX recebido no Banco do Brasil, ref. 12345"
                className={inputClass}
              />
            </FormField>
          </div>
          <DialogFooter className="flex-wrap gap-2 sm:gap-0">
            {pagamentoUc?.pagoEm && (
              <button
                type="button"
                onClick={cancelarPagamento}
                disabled={pagamentoSaving || cancelandoPagamento}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium border border-rose-300 text-rose-700 bg-white rounded-lg hover:bg-rose-50 transition-colors disabled:opacity-50 sm:mr-auto"
                title="Reverte o pagamento — cobrança volta para 'Aguardando pagamento' e payable do investidor reverte"
              >
                {cancelandoPagamento ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Cancelando...
                  </>
                ) : (
                  <>
                    <X className="h-4 w-4" /> Cancelar pagamento
                  </>
                )}
              </button>
            )}
            <button
              type="button"
              onClick={() => setPagamentoUc(null)}
              disabled={pagamentoSaving || cancelandoPagamento}
              className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Fechar
            </button>
            <button
              type="button"
              onClick={confirmarPagamentoManual}
              disabled={pagamentoSaving || cancelandoPagamento}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              {pagamentoSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Salvando...
                </>
              ) : (
                <>
                  <CircleCheck className="h-4 w-4" />{" "}
                  {pagamentoUc?.pagoEm
                    ? "Salvar alterações"
                    : "Confirmar pagamento"}
                </>
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardContent className="p-4 space-y-3">
          <h2 className="text-sm font-semibold">Comprovante de pagamento (Financeiro)</h2>
          {isEncerrado && data.semPagamentoMotivo && (
            <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs">
              <p className="font-semibold text-amber-900 dark:text-amber-200 mb-0.5">
                Encerrado sem pagamento
              </p>
              <p className="text-amber-800 dark:text-amber-300">
                Motivo: <span className="font-medium">{data.semPagamentoMotivo}</span>
              </p>
            </div>
          )}
          <UploadSlot
            label="Comprovante de pagamento"
            description={
              canPayment
                ? "Anexado pelo time financeiro após confirmação dos 3 documentos. Subir o comprovante encerra o mês automaticamente."
                : "Apenas o time financeiro pode anexar este comprovante."
            }
            currentUrl={data.comprovantePagamentoUrl}
            uploadedAt={data.comprovantePagamentoAt}
            disabled={!canPayment || (!docsCompletos && !isAdmin) || (isEncerrado && !isAdmin)}
            disabledReason={
              !canPayment
                ? "Disponível apenas para usuários do financeiro."
                : (!docsCompletos && !isAdmin)
                  ? "Aguardando NF, Recibo de Terra e Recibo de Aluguel."
                  : (isEncerrado && !isAdmin)
                    ? "Mês encerrado — apenas ADMIN troca o comprovante."
                    : undefined
            }
            onUpload={(f) => upload("comprovante_pagamento", f)}
            onDelete={canPayment && !(isEncerrado && !isAdmin) ? () => removeFile("comprovante_pagamento") : undefined}
          />
          {canPayment && !isEncerrado && !data.comprovantePagamentoUrl && (
            <div className="border-t pt-3">
              <button
                type="button"
                onClick={abrirSemPagamento}
                className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-amber-700 transition-colors"
                title="Quando o relatório do mês não gera valor a pagar (saldo negativo, sem geração, etc), formalize aqui."
              >
                <Ban className="h-3.5 w-3.5" />
                Não houve pagamento neste mês — formalizar e encerrar →
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={semPagamentoOpen}
        onOpenChange={(open) => !open && setSemPagamentoOpen(false)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Encerrar mês sem pagamento</DialogTitle>
            <DialogDescription>
              Formaliza que este mês não teve valor a pagar ao investidor.
              Mesma trava do comprovante: edições ficam bloqueadas exceto pra ADMIN.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <FormField label="Motivo">
              <select
                value={semPagamentoTipo}
                onChange={(e) => setSemPagamentoTipo(e.target.value)}
                className={inputClass}
              >
                <option value="Saldo negativo (custos > compensação)">
                  Saldo negativo (custos &gt; compensação)
                </option>
                <option value="Sem geração no período">
                  Sem geração no período
                </option>
                <option value="Sem compensação nas UCs do rateio">
                  Sem compensação nas UCs do rateio
                </option>
                <option value="Pausa contratual">Pausa contratual</option>
                <option value="OUTRO">Outro motivo (descrever)</option>
              </select>
            </FormField>
            <FormField
              label={
                semPagamentoTipo === "OUTRO"
                  ? "Descrição do motivo (obrigatório)"
                  : "Observação adicional (opcional)"
              }
            >
              <textarea
                value={semPagamentoTexto}
                onChange={(e) => setSemPagamentoTexto(e.target.value)}
                rows={3}
                placeholder={
                  semPagamentoTipo === "OUTRO"
                    ? "Descreva o motivo do não pagamento."
                    : "Ex.: usina com problema técnico desde 12/10; geração zero no período."
                }
                maxLength={500}
                className={inputClass}
              />
            </FormField>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setSemPagamentoOpen(false)}
              disabled={semPagamentoSaving}
              className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmarSemPagamento}
              disabled={semPagamentoSaving}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50"
            >
              {semPagamentoSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Encerrando...
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4" /> Encerrar sem pagamento
                </>
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EditableFaturaValor({
  billId,
  valor,
  onSaved,
  disabled,
}: {
  billId: string;
  valor: number | null;
  onSaved: () => Promise<void> | void;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(
    valor != null ? valor.toFixed(2).replace(".", ",") : "",
  );
  const [saving, setSaving] = useState(false);

  function startEdit() {
    setInput(valor != null ? valor.toFixed(2).replace(".", ",") : "");
    setEditing(true);
  }

  async function handleSave() {
    const v = parseFloat(input.replace(",", "."));
    if (input.trim() !== "" && (!Number.isFinite(v) || v < 0)) {
      toast.error("Valor inválido");
      return;
    }
    setSaving(true);
    try {
      const body =
        input.trim() === "" ? { valorTotal: null } : { valorTotal: v };
      const res = await fetch(`/api/admin/faturas-energia/${billId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error("Erro ao salvar", { description: err.error });
        return;
      }
      toast.success("Valor atualizado");
      setEditing(false);
      await onSaved();
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={startEdit}
        disabled={disabled}
        className="inline-flex items-center gap-1 tabular-nums hover:text-foreground transition-colors group disabled:opacity-50 disabled:cursor-not-allowed"
        title={disabled ? "Mês encerrado — apenas ADMIN edita" : "Editar valor manualmente"}
      >
        {valor != null ? formatBRL(valor) : "—"}
        {!disabled && <Pencil className="h-3 w-3 opacity-50 group-hover:opacity-100" />}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-muted-foreground">R$</span>
      <input
        type="text"
        inputMode="decimal"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSave();
          if (e.key === "Escape") setEditing(false);
        }}
        autoFocus
        disabled={saving}
        placeholder="0,00"
        className="w-24 text-right text-xs border rounded px-1.5 py-0.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none tabular-nums"
      />
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
        title="Salvar"
      >
        {saving ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <CircleCheck className="h-3.5 w-3.5" />
        )}
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        disabled={saving}
        className="text-muted-foreground hover:text-foreground disabled:opacity-50"
        title="Cancelar"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

function EditableUcKwh({
  payableId,
  kwh,
  disabled,
  onSaved,
}: {
  payableId: string;
  kwh: number;
  disabled?: boolean;
  onSaved: () => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(kwh.toFixed(2).replace(".", ","));
  const [saving, setSaving] = useState(false);

  function startEdit() {
    setInput(kwh.toFixed(2).replace(".", ","));
    setEditing(true);
  }

  async function handleSave() {
    const v = parseFloat(input.replace(",", "."));
    if (!Number.isFinite(v) || v < 0) {
      toast.error("Valor inválido");
      return;
    }
    if (v > kwh + 0.001) {
      toast.error("Só é possível reduzir o kWh", {
        description:
          "Pra restaurar, edite a linha de saldo do mês seguinte (cascateia pra trás).",
      });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        `/api/admin/investor-payables/${payableId}/edit-kwh`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kwh: v }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error("Erro ao salvar", { description: err.error });
        return;
      }
      const data = await res.json();
      const restante = kwh - v;
      if (restante > 0.001) {
        toast.success(
          `kWh atualizado · ${restante.toFixed(2).replace(".", ",")} kWh foram pro mês seguinte`,
        );
      } else {
        toast.success("kWh atualizado");
      }
      setEditing(false);
      await onSaved();
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={startEdit}
        disabled={disabled}
        className="inline-flex items-center gap-1 tabular-nums hover:text-foreground transition-colors group disabled:opacity-50 disabled:cursor-not-allowed"
        title={disabled ? "Payable já finalizado" : "Editar kWh manualmente"}
      >
        {kwh.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kWh
        {!disabled && <Pencil className="h-3 w-3 opacity-50 group-hover:opacity-100" />}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="text"
        inputMode="decimal"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSave();
          if (e.key === "Escape") setEditing(false);
        }}
        autoFocus
        disabled={saving}
        placeholder="0,00"
        className="w-24 text-right text-xs border rounded px-1.5 py-0.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none tabular-nums"
      />
      <span className="text-xs text-muted-foreground">kWh</span>
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
        title="Salvar"
      >
        {saving ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <CircleCheck className="h-3.5 w-3.5" />
        )}
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        disabled={saving}
        className="text-muted-foreground hover:text-foreground disabled:opacity-50"
        title="Cancelar"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
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

interface UcGeradoraBill {
  id: string;
  anoReferencia: number;
  mesReferencia: number;
  energiaInjetadaMedidorKwh: number | null;
  energiaCompensada: number | null;
  geracaoInversorKwh: number | null;
  geracaoInversorOrigem: string | null;
  consumoInstantaneoKwh: number | null;
  tarifaTE: number | null;
  tarifaTUSD: number | null;
}

interface UcGeradoraResp {
  bill: UcGeradoraBill | null;
  uc?: { id: string; codigoUc: string; nome: string };
  reason?: string;
  regraInstalacao?: string | null;
}

function GeracaoInversorCard({
  plantId,
  ano,
  mes,
  disabled,
}: {
  plantId: string;
  ano: number;
  mes: number;
  disabled?: boolean;
}) {
  const [data, setData] = useState<UcGeradoraResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [geracaoInput, setGeracaoInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(
        `/api/plants/${plantId}/uc-geradora-bill?ano=${ano}&mes=${mes}`,
      );
      if (r.ok) {
        const j = (await r.json()) as UcGeradoraResp;
        setData(j);
        if (j.bill?.geracaoInversorKwh != null) {
          setGeracaoInput(
            j.bill.geracaoInversorKwh.toFixed(2).replace(".", ","),
          );
        } else {
          setGeracaoInput("");
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plantId, ano, mes]);

  // Só renderiza se a plant for DESCONTADO (a API informa via reason/regraInstalacao).
  const skipRegra =
    data?.regraInstalacao && data.regraInstalacao !== "USINA_CONSUMO_DESCONTADO";
  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando geração do inversor...
        </CardContent>
      </Card>
    );
  }
  if (skipRegra) return null;

  async function handleSave() {
    if (!data?.bill) return;
    const v = parseFloat(geracaoInput.replace(",", "."));
    if (!Number.isFinite(v) || v < 0) {
      toast.error("Valor inválido");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch(`/api/admin/faturas-energia/${data.bill.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ geracaoInversorKwh: v }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        toast.error(j.error || "Falha ao salvar");
        return;
      }
      toast.success("Geração atualizada e cobrança recalculada");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleSync() {
    if (!data?.bill) return;
    setSyncing(true);
    try {
      const r = await fetch(`/api/admin/faturas-energia/${data.bill.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sincronizarGeracao: true }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(j.error || "Falha ao sincronizar");
        return;
      }
      const sync = j.sync as { skipped?: string; erros?: string[] } | null;
      if (sync?.skipped) {
        toast.warning(sync.skipped, {
          description: sync.erros?.length
            ? sync.erros.slice(0, 2).join("; ")
            : undefined,
        });
      } else {
        toast.success("Geração sincronizada do inversor");
      }
      await load();
    } finally {
      setSyncing(false);
    }
  }

  async function handleClearManual() {
    if (!data?.bill) return;
    if (!confirm("Limpar valor manual? O próximo sync automático poderá preencher.")) return;
    setSaving(true);
    try {
      await fetch(`/api/admin/faturas-energia/${data.bill.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ geracaoInversorKwh: null }),
      });
      toast.success("Valor manual removido");
      await load();
    } finally {
      setSaving(false);
    }
  }

  if (!data?.bill) {
    return (
      <Card className="border-amber-200 bg-amber-50/40 dark:bg-amber-950/20">
        <CardContent className="p-4 space-y-1 text-sm">
          <div className="flex items-center gap-2 font-semibold">
            <Zap className="h-4 w-4 text-amber-600" />
            UC geradora (DESCONTADO)
          </div>
          <p className="text-muted-foreground">
            {data?.reason ?? "Sem dados."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const bill = data.bill;
  const origem = bill.geracaoInversorOrigem;
  const injetada = bill.energiaInjetadaMedidorKwh ?? 0;
  const geracao = bill.geracaoInversorKwh;
  const instantaneo = bill.consumoInstantaneoKwh;

  return (
    <Card className="border-emerald-200 bg-emerald-50/30 dark:bg-emerald-950/20">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Zap className="h-4 w-4 text-emerald-600" />
              UC geradora — {data.uc?.codigoUc} {data.uc?.nome}
            </h2>
            <p className="text-xs text-muted-foreground">
              DESCONTADO: a cobrança inclui consumo compensado + consumo instantâneo.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing || saving || disabled}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
            title={disabled ? "Mês encerrado — apenas ADMIN edita" : "Busca a geração do período via API do inversor (Fronius/Huawei/etc.)"}
          >
            {syncing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Sincronizar do inversor
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div className="rounded border bg-background p-2">
            <p className="text-xs text-muted-foreground">Geração do inversor</p>
            <p className="font-semibold">
              {geracao != null ? `${geracao.toFixed(0)} kWh` : "—"}
            </p>
            {origem && (
              <span
                className={`inline-block mt-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                  origem === "MANUAL"
                    ? "bg-amber-200 text-amber-900"
                    : "bg-emerald-200 text-emerald-900"
                }`}
              >
                {origem === "MANUAL" ? "Manual" : "Auto (inversor)"}
              </span>
            )}
          </div>
          <div className="rounded border bg-background p-2">
            <p className="text-xs text-muted-foreground">Injetada no medidor</p>
            <p className="font-semibold">{injetada.toFixed(0)} kWh</p>
          </div>
          <div className="rounded border bg-background p-2">
            <p className="text-xs text-muted-foreground">
              Consumo instantâneo (derivado)
            </p>
            <p className="font-semibold">
              {instantaneo != null ? `${instantaneo.toFixed(0)} kWh` : "—"}
            </p>
          </div>
        </div>

        <div className="border-t pt-3 space-y-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Preencher manualmente (quando o inversor estiver offline)
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              inputMode="decimal"
              value={geracaoInput}
              onChange={(e) => setGeracaoInput(e.target.value)}
              placeholder="kWh gerados no período"
              disabled={disabled}
              className="w-48 text-sm border rounded-lg px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || syncing || disabled}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CircleCheck className="h-3.5 w-3.5" />
              )}
              Salvar manual
            </button>
            {origem === "MANUAL" && !disabled && (
              <button
                type="button"
                onClick={handleClearManual}
                disabled={saving || syncing}
                className="text-xs text-muted-foreground hover:text-destructive"
              >
                Limpar manual
              </button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

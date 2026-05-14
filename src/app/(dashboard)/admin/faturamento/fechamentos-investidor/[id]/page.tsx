"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  RefreshCcw,
  Save,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { formatBRL, formatMonthYear } from "@/lib/formatters";

interface PayableRow {
  id: string;
  status: string;
  anoReferencia: number;
  mesReferencia: number;
  sharePercent: number;
  valorKwhContrato: number;
  kwhCompensadoBase: number;
  kwhCompensadoAjuste: number;
  kwhCreditoLegadoAbatido: number;
  valorBruto: number;
  valorAjuste: number;
  valorLiquido: number;
  motivoAjuste: string | null;
  plant: { id: string; name: string; numeroUsina: string | null };
  consumerUnit: { id: string; codigoUc: string | null; nome: string | null };
}

interface SettlementDetail {
  id: string;
  investorId: string;
  anoFechamento: number;
  mesFechamento: number;
  status: string;
  totalKwh: number;
  totalBruto: number;
  totalAjuste: number;
  totalLiquido: number;
  totalPayables: number;
  gestaoFixaAplicada: number;
  outrosAjustes: number;
  outrosNotas: string | null;
  valorAPagar: number;
  geradoEm: string;
  publicadoEm: string | null;
  pagoEm: string | null;
  pagoComprovante: string | null;
  observacoes: string | null;
  investor: {
    id: string;
    chavePix: string | null;
    user: { name: string | null; email: string | null };
  };
  payables: PayableRow[];
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "Rascunho", className: "bg-amber-100 text-amber-800" },
  PUBLISHED: { label: "Publicado", className: "bg-emerald-100 text-emerald-800" },
  CANCELED: { label: "Cancelado", className: "bg-slate-200 text-slate-700" },
};

const inputClass =
  "w-full text-sm border rounded-lg px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all";

export default function FechamentoDetalhePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [data, setData] = useState<SettlementDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [gestaoFixa, setGestaoFixa] = useState("");
  const [outrosAjustes, setOutrosAjustes] = useState("");
  const [outrosNotas, setOutrosNotas] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [pagoEm, setPagoEm] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [pagoComprovante, setPagoComprovante] = useState("");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [recomputing, setRecomputing] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/fechamentos-investidor/${id}`);
      if (r.ok) {
        const d = (await r.json()) as SettlementDetail;
        setData(d);
        setGestaoFixa(d.gestaoFixaAplicada?.toString() ?? "");
        setOutrosAjustes(d.outrosAjustes?.toString() ?? "");
        setOutrosNotas(d.outrosNotas ?? "");
        setObservacoes(d.observacoes ?? "");
      } else {
        const err = await r.json().catch(() => ({}));
        toast.error("Erro ao carregar", { description: err.error });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const r = await fetch(`/api/admin/fechamentos-investidor/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gestaoFixaAplicada: gestaoFixa === "" ? 0 : Number(gestaoFixa),
          outrosAjustes: outrosAjustes === "" ? 0 : Number(outrosAjustes),
          outrosNotas,
          observacoes,
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        toast.error("Erro ao salvar", { description: err.error });
        return;
      }
      toast.success("Ajustes salvos");
      await reload();
    } finally {
      setSaving(false);
    }
  };

  const handleRecompute = async () => {
    setRecomputing(true);
    try {
      const r = await fetch(
        `/api/admin/fechamentos-investidor/${id}/recalcular`,
        { method: "POST" },
      );
      if (r.ok) {
        toast.success("Totais recalculados");
        await reload();
      }
    } finally {
      setRecomputing(false);
    }
  };

  const handlePublish = async () => {
    if (!data) return;
    if (
      !confirm(
        `Confirmar pagamento de ${formatBRL(data.valorAPagar)} ao investidor?\n\n` +
          `Esta ação marca todos os ${data.totalPayables} payables como PAGO e não pode ser desfeita pelo sistema.`,
      )
    )
      return;
    setPublishing(true);
    try {
      const r = await fetch(
        `/api/admin/fechamentos-investidor/${id}/publicar`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pagoEm: pagoEm ? `${pagoEm}T12:00:00.000Z` : undefined,
            pagoComprovante: pagoComprovante || null,
          }),
        },
      );
      const result = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error("Erro ao publicar", { description: result.error });
        return;
      }
      toast.success("Fechamento publicado", {
        description: `${result.paidCount} payables marcados como PAGO. Total: ${formatBRL(result.totalAPagar)}`,
      });
      await reload();
    } finally {
      setPublishing(false);
    }
  };

  const handleCancel = async () => {
    if (
      !confirm(
        "Cancelar este fechamento?\n\nOs payables vinculados voltam para DISPONIVEL e podem ser incluídos em outro fechamento.",
      )
    )
      return;
    setCanceling(true);
    try {
      const r = await fetch(
        `/api/admin/fechamentos-investidor/${id}/cancelar`,
        { method: "POST" },
      );
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        toast.error("Erro ao cancelar", { description: err.error });
        return;
      }
      toast.success("Fechamento cancelado");
      router.push("/admin/faturamento/fechamentos-investidor");
    } finally {
      setCanceling(false);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-sm text-muted-foreground">
        Carregando...
      </div>
    );
  }
  if (!data) {
    return (
      <div className="p-12 text-center text-sm text-muted-foreground">
        Fechamento não encontrado
      </div>
    );
  }

  const editavel = data.status === "DRAFT";
  const badge =
    STATUS_BADGE[data.status] ?? {
      label: data.status,
      className: "bg-slate-100 text-slate-800",
    };

  return (
    <div className="space-y-4 max-w-6xl">
      <Link
        href="/admin/faturamento/fechamentos-investidor"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </Link>

      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1">
          <h1 className="text-2xl font-bold">
            {data.investor.user.name ?? data.investor.user.email ?? "Investidor"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Fechamento de {formatMonthYear(data.mesFechamento, data.anoFechamento)} ·{" "}
            {data.totalPayables} payables · gerado em{" "}
            {new Date(data.geradoEm).toLocaleString("pt-BR")}
          </p>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${badge.className}`}
        >
          {badge.label}
        </span>
      </div>

      <Card>
        <CardContent className="p-4 grid gap-4 md:grid-cols-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              Total kWh
            </p>
            <p className="font-semibold tabular-nums">
              {data.totalKwh.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kWh
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              Bruto
            </p>
            <p className="font-semibold tabular-nums">{formatBRL(data.totalLiquido)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              Gestão fixa
            </p>
            <p className="font-semibold tabular-nums text-rose-700">
              {data.gestaoFixaAplicada > 0
                ? `− ${formatBRL(data.gestaoFixaAplicada)}`
                : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              Valor a pagar
            </p>
            <p className="font-semibold tabular-nums text-emerald-700 text-lg">
              {formatBRL(data.valorAPagar)}
            </p>
          </div>
          {data.investor.chavePix && (
            <div className="md:col-span-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                Chave PIX do investidor
              </p>
              <p className="font-mono text-sm">{data.investor.chavePix}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h2 className="text-sm font-semibold">
              Payables incluídos ({data.payables.length})
            </h2>
            {editavel && (
              <button
                type="button"
                onClick={handleRecompute}
                disabled={recomputing}
                className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium border rounded-md hover:bg-muted transition-colors disabled:opacity-50"
                title="Recalcula totais a partir dos payables (útil se ajustou kwhCompensadoAjuste/valorAjuste)"
              >
                {recomputing ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCcw className="h-3 w-3" />
                )}
                Recalcular totais
              </button>
            )}
          </div>
          {(() => {
            const totalAbatido = data.payables.reduce(
              (a, p) => a + (p.kwhCreditoLegadoAbatido ?? 0),
              0,
            );
            const qtdAfetadas = data.payables.filter(
              (p) => (p.kwhCreditoLegadoAbatido ?? 0) > 0.0001,
            ).length;
            if (totalAbatido <= 0.0001) return null;
            return (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <strong>⚠ Cap de injeção aplicado:</strong>{" "}
                {totalAbatido.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}{" "}
                kWh foram descartados em {qtdAfetadas} payable(s) por exceder o
                acumulado de injeção da usina. Possíveis créditos legados
                compensados por essas UCs — confira o histórico antes de publicar.
              </div>
            );
          })()}
          {data.payables.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              Nenhum payable vinculado.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Usina / UC</th>
                    <th className="px-3 py-2 text-left font-medium">Ref.</th>
                    <th className="px-3 py-2 text-right font-medium">kWh</th>
                    <th className="px-3 py-2 text-right font-medium">R$/kWh</th>
                    <th className="px-3 py-2 text-right font-medium">Bruto</th>
                    <th className="px-3 py-2 text-right font-medium">Ajuste</th>
                    <th className="px-3 py-2 text-right font-medium">Líquido</th>
                  </tr>
                </thead>
                <tbody>
                  {data.payables.map((p) => {
                    const kwhEfet = p.kwhCompensadoBase + p.kwhCompensadoAjuste;
                    const temAbateLegado = p.kwhCreditoLegadoAbatido > 0.0001;
                    return (
                      <tr key={p.id} className="border-t">
                        <td className="px-3 py-2">
                          <div className="font-medium flex items-center gap-1.5">
                            {p.plant.name}
                            {temAbateLegado && (
                              <span
                                title={`Cap aplicado: ${p.kwhCreditoLegadoAbatido.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kWh foram descartados por exceder o acumulado de injeção da usina (créditos legados não remuneráveis).`}
                                className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800"
                              >
                                ⚠ cap −
                                {p.kwhCreditoLegadoAbatido.toLocaleString("pt-BR", {
                                  maximumFractionDigits: 0,
                                })}{" "}
                                kWh
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {p.consumerUnit.nome ?? "—"} · UC{" "}
                            {p.consumerUnit.codigoUc ?? "—"}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {formatMonthYear(p.mesReferencia, p.anoReferencia)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {kwhEfet.toLocaleString("pt-BR", {
                            maximumFractionDigits: 0,
                          })}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-xs">
                          {formatBRL(p.valorKwhContrato)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatBRL(p.valorBruto)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {p.valorAjuste !== 0 ? formatBRL(p.valorAjuste) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">
                          {formatBRL(p.valorLiquido)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-muted/30 text-sm font-semibold">
                  <tr className="border-t">
                    <td className="px-3 py-2" colSpan={2}>
                      Total
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {data.totalKwh.toLocaleString("pt-BR", {
                        maximumFractionDigits: 0,
                      })}
                    </td>
                    <td />
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatBRL(data.totalBruto)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {data.totalAjuste !== 0 ? formatBRL(data.totalAjuste) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatBRL(data.totalLiquido)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <h2 className="text-sm font-semibold">Ajustes do fechamento</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Gestão fixa aplicada (R$)
              </label>
              <input
                type="number"
                step="0.01"
                value={gestaoFixa}
                onChange={(e) => setGestaoFixa(e.target.value)}
                disabled={!editavel}
                className={inputClass}
              />
              <p className="text-xs text-muted-foreground">
                Sugerido a partir de InvestorPlant.gestaoFixaContrato. Subtrai do
                líquido.
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Outros ajustes (R$)
              </label>
              <input
                type="number"
                step="0.01"
                value={outrosAjustes}
                onChange={(e) => setOutrosAjustes(e.target.value)}
                disabled={!editavel}
                className={inputClass}
              />
              <p className="text-xs text-muted-foreground">
                Soma livre (positivo ou negativo): acordos, retenções, descontos.
              </p>
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Notas dos outros ajustes
              </label>
              <textarea
                rows={2}
                value={outrosNotas}
                onChange={(e) => setOutrosNotas(e.target.value)}
                disabled={!editavel}
                className={inputClass}
              />
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Observações gerais
              </label>
              <textarea
                rows={3}
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                disabled={!editavel}
                className={inputClass}
              />
            </div>
          </div>
          {editavel && (
            <div>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Salvar ajustes
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {editavel && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h2 className="text-sm font-semibold">Confirmar pagamento</h2>
            <p className="text-xs text-muted-foreground">
              Após confirmar a transferência ao investidor, registre a data e
              (opcional) link do comprovante. Isso publica o fechamento e marca
              todos os payables como PAGO.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Data do pagamento
                </label>
                <input
                  type="date"
                  value={pagoEm}
                  onChange={(e) => setPagoEm(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Comprovante (URL — opcional)
                </label>
                <input
                  type="text"
                  value={pagoComprovante}
                  onChange={(e) => setPagoComprovante(e.target.value)}
                  placeholder="https://..."
                  className={inputClass}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap pt-2">
              <button
                type="button"
                onClick={handlePublish}
                disabled={publishing}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {publishing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Publicar fechamento e marcar como pago
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={canceling}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-rose-300 text-rose-700 rounded-lg hover:bg-rose-50 transition-colors disabled:opacity-50"
              >
                {canceling ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                Cancelar fechamento
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {data.status === "PUBLISHED" && (
        <Card>
          <CardContent className="p-4 grid gap-4 md:grid-cols-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                Publicado em
              </p>
              <p>
                {data.publicadoEm
                  ? new Date(data.publicadoEm).toLocaleString("pt-BR")
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                Pago em
              </p>
              <p>
                {data.pagoEm
                  ? new Date(data.pagoEm).toLocaleDateString("pt-BR")
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                Comprovante
              </p>
              {data.pagoComprovante ? (
                <a
                  href={data.pagoComprovante}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline break-all"
                >
                  {data.pagoComprovante}
                </a>
              ) : (
                <p>—</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

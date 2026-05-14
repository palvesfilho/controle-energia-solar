"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Pencil, ScrollText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Linha {
  payableId: string;
  anoReferencia: number;
  mesReferencia: number;
  parcelaIndex: number;
  ucCodigo: string | null;
  ucNome: string;
  kwh: number;
  valorBruto: number;
  valorAjuste: number;
  valorAbatidoDebito: number;
  valorLiquido: number;
  valorRealPago: number | null;
  motivoValorRealPago: string | null;
  delta: number | null;
  saldoAcumulado: number;
  status: string;
  pagoInvestidorEm: string | null;
}

interface InvestidorBloco {
  investorId: string;
  investorNome: string;
  totalDevido: number;
  totalPago: number;
  saldoAcumulado: number;
  linhas: Linha[];
}

interface BalancoResponse {
  plant: { id: string; name: string; numeroUsina: string | null };
  investidores: InvestidorBloco[];
}

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const MES_LABEL = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

export function BalancoHistoricoInvestidor({
  plantId,
  destacarMes,
}: {
  plantId: string;
  /** {ano,mes} a destacar visualmente (linha em fundo emerald). */
  destacarMes?: { ano: number; mes: number };
}) {
  const [data, setData] = useState<BalancoResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [editLinha, setEditLinha] = useState<Linha | null>(null);
  const [valorPagoInput, setValorPagoInput] = useState("");
  const [motivoInput, setMotivoInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/plants/${plantId}/balanco-investidor`);
      if (r.ok) {
        setData(await r.json());
      } else {
        setData(null);
      }
    } finally {
      setLoading(false);
    }
  }, [plantId]);

  useEffect(() => {
    load();
  }, [load]);

  function openEdit(l: Linha) {
    setEditLinha(l);
    setValorPagoInput(
      l.valorRealPago != null
        ? l.valorRealPago.toFixed(2).replace(".", ",")
        : l.valorLiquido.toFixed(2).replace(".", ","),
    );
    setMotivoInput(l.motivoValorRealPago ?? "");
    setErr(null);
  }

  async function handleSave() {
    if (!editLinha) return;
    setErr(null);
    const v = parseFloat(valorPagoInput.replace(",", "."));
    if (!Number.isFinite(v) || v < 0) {
      setErr("Valor inválido.");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch(
        `/api/admin/investor-payables/${editLinha.payableId}/mark-paid`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            valorRealPago: v,
            motivo: motivoInput.trim() || undefined,
          }),
        },
      );
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErr(j.error || "Falha ao salvar.");
        return;
      }
      const res = await r.json();
      if (res.warning) alert(res.warning);
      setEditLinha(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <ScrollText className="h-4 w-4 text-slate-600" />
            Balanço histórico de pagamento ao investidor
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Mês a mês: valor devido × valor efetivamente pago × saldo acumulado.
            Pagamento a maior gera débito automático; pagamento a menos fica como aviso.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando histórico...
          </div>
        ) : !data || data.investidores.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground italic">
            Nenhuma payable encontrada pra esta usina ainda.
          </div>
        ) : (
          <div className="space-y-4">
            {data.investidores.map((bloco) => (
              <div
                key={bloco.investorId}
                className="rounded-lg border bg-muted/10 p-3 space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-semibold">{bloco.investorNome}</p>
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <span>
                      Devido: <b>{brl(bloco.totalDevido)}</b>
                    </span>
                    <span>
                      Pago: <b>{brl(bloco.totalPago)}</b>
                    </span>
                    <span>
                      Saldo:{" "}
                      <b
                        className={
                          Math.abs(bloco.saldoAcumulado) < 0.01
                            ? "text-emerald-600"
                            : bloco.saldoAcumulado > 0
                              ? "text-amber-600"
                              : "text-destructive"
                        }
                      >
                        {brl(bloco.saldoAcumulado)}
                      </b>
                    </span>
                  </div>
                </div>
                <div className="overflow-x-auto rounded border bg-background">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 px-2 text-left">Mês</th>
                        <th className="py-2 px-2 text-left">UC</th>
                        <th className="py-2 px-2 text-right">kWh</th>
                        <th className="py-2 px-2 text-right">Devido</th>
                        <th className="py-2 px-2 text-right">Pago</th>
                        <th className="py-2 px-2 text-right">Diferença</th>
                        <th className="py-2 px-2 text-right">Saldo</th>
                        <th className="py-2 px-2 text-center">Status</th>
                        <th className="py-2 px-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {bloco.linhas.map((l) => {
                        const isDestaque =
                          destacarMes &&
                          l.anoReferencia === destacarMes.ano &&
                          l.mesReferencia === destacarMes.mes;
                        return (
                          <tr
                            key={l.payableId}
                            className={`border-t hover:bg-muted/30 ${isDestaque ? "bg-emerald-50/60 dark:bg-emerald-950/20" : ""}`}
                          >
                            <td className="py-2 px-2 whitespace-nowrap">
                              {MES_LABEL[l.mesReferencia - 1]}/{l.anoReferencia}
                            </td>
                            <td className="py-2 px-2">
                              <div className="font-mono text-xs">{l.ucCodigo ?? "—"}</div>
                              <div className="text-xs text-muted-foreground">
                                {l.ucNome}
                              </div>
                            </td>
                            <td className="py-2 px-2 text-right font-mono text-xs">
                              {l.kwh.toFixed(0)}
                            </td>
                            <td className="py-2 px-2 text-right font-mono">
                              {brl(l.valorLiquido)}
                            </td>
                            <td className="py-2 px-2 text-right font-mono">
                              {l.valorRealPago != null ? brl(l.valorRealPago) : "—"}
                            </td>
                            <td
                              className={`py-2 px-2 text-right font-mono ${
                                l.delta == null
                                  ? ""
                                  : Math.abs(l.delta) < 0.01
                                    ? "text-emerald-600"
                                    : l.delta > 0
                                      ? "text-amber-600"
                                      : "text-destructive"
                              }`}
                            >
                              {l.delta != null ? brl(l.delta) : "—"}
                            </td>
                            <td
                              className={`py-2 px-2 text-right font-mono ${
                                Math.abs(l.saldoAcumulado) < 0.01
                                  ? "text-muted-foreground"
                                  : l.saldoAcumulado > 0
                                    ? "text-amber-600"
                                    : "text-destructive"
                              }`}
                            >
                              {brl(l.saldoAcumulado)}
                            </td>
                            <td className="py-2 px-2 text-center">
                              <StatusBadge status={l.status} />
                            </td>
                            <td className="py-2 px-2 text-right">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => openEdit(l)}
                              >
                                {l.valorRealPago != null ? (
                                  <Pencil className="h-3.5 w-3.5" />
                                ) : (
                                  <Check className="h-3.5 w-3.5" />
                                )}
                                {l.valorRealPago != null ? "Editar" : "Marcar pago"}
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}

        <Dialog open={!!editLinha} onOpenChange={(v) => !v && setEditLinha(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editLinha
                  ? `${MES_LABEL[editLinha.mesReferencia - 1]}/${editLinha.anoReferencia} — UC ${editLinha.ucCodigo}`
                  : "Marcar pago"}
              </DialogTitle>
            </DialogHeader>
            {editLinha && (
              <div className="space-y-3">
                <div className="rounded border bg-muted/30 p-3 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Valor devido:</span>
                    <span className="font-mono">{brl(editLinha.valorLiquido)}</span>
                  </div>
                  {editLinha.valorAbatidoDebito > 0 && (
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>(já abatido de débitos anteriores:</span>
                      <span className="font-mono">
                        {brl(editLinha.valorAbatidoDebito)})
                      </span>
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="valorPago">Valor realmente pago (R$)</Label>
                  <Input
                    id="valorPago"
                    type="text"
                    inputMode="decimal"
                    value={valorPagoInput}
                    onChange={(e) => setValorPagoInput(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Se diferente do devido, a diferença vira débito/crédito automático. Default = valor devido.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="motivo">Motivo / observação (opcional)</Label>
                  <Textarea
                    id="motivo"
                    value={motivoInput}
                    onChange={(e) => setMotivoInput(e.target.value)}
                    rows={2}
                    placeholder="Ex.: PIX enviado por engano com valor redondo"
                  />
                </div>
                {err && <p className="text-sm text-destructive">{err}</p>}
              </div>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditLinha(null)}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button type="button" onClick={handleSave} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Confirmar"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "PAGO") return <Badge className="bg-emerald-600">Pago</Badge>;
  if (status === "DISPONIVEL") return <Badge variant="secondary">Disponível</Badge>;
  if (status === "AGUARDANDO_PAGAMENTO")
    return <Badge variant="outline">Aguardando</Badge>;
  if (status === "AGUARDANDO_COMPENSACAO")
    return <Badge variant="outline">Compensação</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}

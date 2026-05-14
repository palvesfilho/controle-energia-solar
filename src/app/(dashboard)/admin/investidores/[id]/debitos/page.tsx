"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

interface Application {
  id: string;
  valorAbatido: number;
  aplicadoEm: string;
  payable: {
    id: string;
    anoReferencia: number;
    mesReferencia: number;
    consumerUnit: { codigoUc: string | null; nome: string };
  };
}

interface Debit {
  id: string;
  valorOriginal: number;
  valorRestante: number;
  motivo: string | null;
  status: "ABERTO" | "QUITADO" | "CANCELADO";
  criadoEm: string;
  quitadoEm: string | null;
  canceladoEm: string | null;
  applications: Application[];
}

interface DebitsResponse {
  investor: { id: string; nome: string };
  saldoDevedorTotal: number;
  debits: Debit[];
}

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function DebitosInvestidorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: investorId } = use(params);

  const [data, setData] = useState<DebitsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/investors/${investorId}/debits`);
      if (r.ok) {
        setData(await r.json());
      } else {
        setData(null);
      }
    } finally {
      setLoading(false);
    }
  }, [investorId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate() {
    setErr(null);
    const n = parseFloat(valor.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) {
      setErr("Informe um valor maior que zero.");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch(`/api/investors/${investorId}/debits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valor: n, motivo: motivo.trim() || undefined }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErr(j.error || "Falha ao criar débito.");
        return;
      }
      setValor("");
      setMotivo("");
      setCreateOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel(debitId: string) {
    if (
      !confirm(
        "Cancelar este débito? Todas as aplicações serão estornadas e o valor devolvido às payables afetadas.",
      )
    )
      return;
    setCancelingId(debitId);
    try {
      const r = await fetch(
        `/api/investors/${investorId}/debits/${debitId}`,
        { method: "DELETE" },
      );
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        alert(j.error || "Falha ao cancelar.");
        return;
      }
      await load();
    } finally {
      setCancelingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link href={`/admin/investidores/${investorId}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">
            Débitos {data ? `— ${data.investor.nome}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground">
            Valores pagos a maior ou outros saldos devedores. São abatidos
            automaticamente das próximas payables (FIFO).
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">
              Saldo devedor total:{" "}
              {data ? (
                <span
                  className={
                    data.saldoDevedorTotal > 0
                      ? "text-amber-600"
                      : "text-emerald-600"
                  }
                >
                  {brl(data.saldoDevedorTotal)}
                </span>
              ) : (
                "—"
              )}
            </CardTitle>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              Registrar débito
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : !data || data.debits.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum débito registrado.
            </p>
          ) : (
            <div className="space-y-3">
              {data.debits.map((d) => (
                <DebitCard
                  key={d.id}
                  debit={d}
                  onCancel={() => handleCancel(d.id)}
                  canceling={cancelingId === d.id}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar novo débito</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="valor">Valor (R$)</Label>
              <Input
                id="valor"
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="motivo">Motivo (opcional)</Label>
              <Textarea
                id="motivo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={3}
                placeholder="Ex.: pagamento a maior feito em mar/2026 por erro no rateio"
              />
            </div>
            {err && <p className="text-sm text-destructive">{err}</p>}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={handleCreate} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Registrar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DebitCard({
  debit,
  onCancel,
  canceling,
}: {
  debit: Debit;
  onCancel: () => void;
  canceling: boolean;
}) {
  const badge =
    debit.status === "ABERTO" ? (
      <Badge variant="secondary">Em aberto</Badge>
    ) : debit.status === "QUITADO" ? (
      <Badge className="bg-emerald-600">Quitado</Badge>
    ) : (
      <Badge variant="destructive">Cancelado</Badge>
    );

  const totalAbatido = debit.applications.reduce(
    (s, a) => s + a.valorAbatido,
    0,
  );

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm">
            {badge}
            <span className="text-muted-foreground">
              criado em{" "}
              {new Date(debit.criadoEm).toLocaleDateString("pt-BR")}
            </span>
          </div>
          {debit.motivo && (
            <p className="text-sm text-muted-foreground italic">
              &ldquo;{debit.motivo}&rdquo;
            </p>
          )}
        </div>
        {debit.status !== "CANCELADO" && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={canceling}
            onClick={onCancel}
            title="Cancelar débito (estorna aplicações)"
          >
            {canceling ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            Cancelar
          </Button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Valor original
          </p>
          <p className="font-semibold">{brl(debit.valorOriginal)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Já abatido
          </p>
          <p className="font-semibold">{brl(totalAbatido)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Restante
          </p>
          <p
            className={
              debit.valorRestante > 0
                ? "font-semibold text-amber-600"
                : "font-semibold text-emerald-600"
            }
          >
            {brl(debit.valorRestante)}
          </p>
        </div>
      </div>

      {debit.applications.length > 0 && (
        <div className="space-y-1 text-xs">
          <p className="font-semibold uppercase tracking-wide text-muted-foreground">
            Aplicações ({debit.applications.length})
          </p>
          <div className="rounded border">
            <table className="w-full">
              <tbody>
                {debit.applications.map((a) => (
                  <tr key={a.id} className="border-b last:border-0">
                    <td className="px-2 py-1">
                      {a.payable.consumerUnit.codigoUc} — {a.payable.consumerUnit.nome}
                    </td>
                    <td className="px-2 py-1 text-muted-foreground">
                      {String(a.payable.mesReferencia).padStart(2, "0")}/
                      {a.payable.anoReferencia}
                    </td>
                    <td className="px-2 py-1 text-right font-mono">
                      {brl(a.valorAbatido)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

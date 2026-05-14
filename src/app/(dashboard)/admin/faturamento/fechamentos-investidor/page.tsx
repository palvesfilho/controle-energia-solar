"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { CalendarCheck, Loader2, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { formatBRL, formatMonthYear } from "@/lib/formatters";

interface SettlementRow {
  id: string;
  investorId: string;
  anoFechamento: number;
  mesFechamento: number;
  status: string;
  totalKwh: number;
  totalLiquido: number;
  totalPayables: number;
  gestaoFixaAplicada: number;
  outrosAjustes: number;
  valorAPagar: number;
  geradoEm: string;
  publicadoEm: string | null;
  pagoEm: string | null;
  investor: {
    id: string;
    user: { name: string | null; email: string | null };
  };
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "Rascunho", className: "bg-amber-100 text-amber-800" },
  PUBLISHED: { label: "Publicado", className: "bg-emerald-100 text-emerald-800" },
  CANCELED: { label: "Cancelado", className: "bg-slate-200 text-slate-700" },
};

const inputClass =
  "w-full text-sm border rounded-lg px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all";

export default function FechamentosInvestidorPage() {
  const now = new Date();
  const [ano, setAno] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [items, setItems] = useState<SettlementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("ano", String(ano));
      qs.set("mes", String(mes));
      if (statusFilter) qs.set("status", statusFilter);
      const r = await fetch(`/api/admin/fechamentos-investidor?${qs.toString()}`);
      if (r.ok) {
        const d = await r.json();
        setItems(d.settlements ?? []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ano, mes, statusFilter]);

  const rodarFechamento = async () => {
    setRunning(true);
    try {
      const r = await fetch("/api/admin/fechamentos-investidor/gerar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ano, mes }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error("Erro ao rodar fechamento", { description: d.error });
        return;
      }
      const c = d.closing;
      toast.success("Fechamento processado", {
        description: `${c.results.length} fechamento(s) gerado(s)/atualizado(s); ${c.skippedInvestors.length} pulado(s).`,
      });
      await reload();
    } finally {
      setRunning(false);
    }
  };

  const totalAPagar = items
    .filter((i) => i.status !== "CANCELED")
    .reduce((s, i) => s + (i.valorAPagar ?? 0), 0);
  const draftCount = items.filter((i) => i.status === "DRAFT").length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CalendarCheck className="h-6 w-6 text-emerald-600" />
          Fechamento Investidores
        </h1>
        <p className="text-sm text-muted-foreground">
          Job mensal (dia 15) que agrupa os créditos disponíveis por investidor.
          Revise os rascunhos, ajuste valores e publique para confirmar o pagamento.
        </p>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="grid gap-3 md:grid-cols-[140px_140px_180px_1fr_auto] items-end">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Ano
              </label>
              <input
                type="number"
                value={ano}
                onChange={(e) => setAno(Number(e.target.value))}
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Mês
              </label>
              <select
                value={mes}
                onChange={(e) => setMes(Number(e.target.value))}
                className={inputClass}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {formatMonthYear(m, ano)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className={inputClass}
              >
                <option value="">Todos</option>
                <option value="DRAFT">Rascunho</option>
                <option value="PUBLISHED">Publicado</option>
                <option value="CANCELED">Cancelado</option>
              </select>
            </div>
            <div />
            <button
              type="button"
              onClick={rodarFechamento}
              disabled={running}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
              title="Varre InvestorPayable DISPONIVEL e cria/atualiza rascunho por investidor."
            >
              {running ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Rodando...
                </>
              ) : (
                <>
                  <PlayCircle className="h-4 w-4" />
                  Rodar fechamento de {formatMonthYear(mes, ano)}
                </>
              )}
            </button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Fechamentos
            </p>
            <p className="text-2xl font-semibold">{items.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Em rascunho
            </p>
            <p className="text-2xl font-semibold text-amber-700">{draftCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Total a pagar (excl. cancelados)
            </p>
            <p className="text-2xl font-semibold text-emerald-700">
              {formatBRL(totalAPagar)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              Carregando...
            </div>
          ) : items.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              Nenhum fechamento para {formatMonthYear(mes, ano)}.{" "}
              <button
                type="button"
                onClick={rodarFechamento}
                className="text-emerald-700 underline hover:text-emerald-800"
              >
                Rodar agora?
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Investidor</th>
                    <th className="px-3 py-2 text-right font-medium">UCs</th>
                    <th className="px-3 py-2 text-right font-medium">kWh</th>
                    <th className="px-3 py-2 text-right font-medium">Bruto</th>
                    <th className="px-3 py-2 text-right font-medium">Gestão fixa</th>
                    <th className="px-3 py-2 text-right font-medium">A pagar</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((s) => {
                    const badge =
                      STATUS_BADGE[s.status] ?? {
                        label: s.status,
                        className: "bg-slate-100 text-slate-800",
                      };
                    return (
                      <tr key={s.id} className="border-t hover:bg-muted/30 transition-colors">
                        <td className="px-3 py-2">
                          <div className="font-medium">
                            {s.investor.user.name ?? s.investor.user.email ?? "—"}
                          </div>
                          {s.investor.user.email && (
                            <div className="text-xs text-muted-foreground">
                              {s.investor.user.email}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {s.totalPayables}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {s.totalKwh.toLocaleString("pt-BR", {
                            maximumFractionDigits: 0,
                          })}{" "}
                          kWh
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatBRL(s.totalLiquido)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-rose-700">
                          {s.gestaoFixaAplicada > 0 ? `− ${formatBRL(s.gestaoFixaAplicada)}` : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-700">
                          {formatBRL(s.valorAPagar)}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                          {s.pagoEm && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              pago em{" "}
                              {new Date(s.pagoEm).toLocaleDateString("pt-BR")}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Link
                            href={`/admin/faturamento/fechamentos-investidor/${s.id}`}
                            className="text-xs font-medium text-primary hover:underline"
                          >
                            Abrir →
                          </Link>
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
    </div>
  );
}

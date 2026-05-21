"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  CheckCheck,
  ClipboardCopy,
  Clock4,
  CreditCard,
  Download,
  Loader2,
  Minus,
  Check,
  X,
  Wallet,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type { FaturasEnergiaRow, FaturaCell } from "@/app/api/admin/faturas-energia/route";

const MESES_LABEL = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const selectClass =
  "text-sm border rounded-lg px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all";

// 5 estados de pagamento:
//  - conferida  → pago interno + RGE confirmou (✅)
//  - so-interno → pago interno, RGE ainda não confirmou (🟦 — aguardando concessionária)
//  - so-rge     → RGE diz pago, sem registro interno (🟩 — anomalia, investigar)
//  - aberta     → nem nós pagamos, nem RGE confirmou (🔴)
//  - missing    → fatura não sincronizada (⬜)
type Pagamento = "conferida" | "so-interno" | "so-rge" | "aberta" | "missing";

function getPagamento(cell: FaturaCell | undefined): Pagamento {
  if (!cell || cell.status === "missing") return "missing";
  const interno = !!cell.pagoEm;
  const rge = cell.contaPaga;
  if (interno && rge) return "conferida";
  if (interno && !rge) return "so-interno";
  if (!interno && rge) return "so-rge";
  return "aberta";
}

function formatBRL(v: number | null): string {
  if (v == null) return "-";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("pt-BR");
}

function buildCellTooltip(cell: FaturaCell, pag: Pagamento): string {
  const base = `${formatBRL(cell.valorTotal)} • Venc: ${formatDate(cell.vencimento)}`;
  if (pag === "conferida") {
    return `Conferido — pago em ${formatDate(cell.pagoEm)} e confirmado pela concessionária • ${base}`;
  }
  if (pag === "so-interno") {
    return `Pago em ${formatDate(cell.pagoEm)} (registro interno) — aguardando confirmação da concessionária • ${base}`;
  }
  if (pag === "so-rge") {
    return `Concessionária registra como pago, mas sem registro interno — verificar • ${base}`;
  }
  return `Em aberto • ${base}`;
}

function CellIcon({ cell }: { cell: FaturaCell | undefined }) {
  const pag = getPagamento(cell);
  const tooltip =
    cell && cell.status !== "missing"
      ? buildCellTooltip(cell, pag)
      : "Sem fatura sincronizada";

  const wrap = "inline-flex h-7 w-7 items-center justify-center rounded-md";

  if (pag === "conferida") {
    return (
      <span title={tooltip} className={`${wrap} bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300`}>
        <CheckCheck className="h-3.5 w-3.5" />
      </span>
    );
  }
  if (pag === "so-interno") {
    return (
      <span title={tooltip} className={`${wrap} bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300`}>
        <Clock4 className="h-3.5 w-3.5" />
      </span>
    );
  }
  if (pag === "so-rge") {
    return (
      <span title={tooltip} className={`${wrap} bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300`}>
        <Building2 className="h-3.5 w-3.5" />
      </span>
    );
  }
  if (pag === "aberta") {
    return (
      <span title={tooltip} className={`${wrap} bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300`}>
        <X className="h-3.5 w-3.5" />
      </span>
    );
  }
  return (
    <span title={tooltip} className={`${wrap} bg-muted text-muted-foreground`}>
      <Minus className="h-3.5 w-3.5" />
    </span>
  );
}

function OrigemBadge({ origem }: { origem: FaturasEnergiaRow["origem"] }) {
  const map = {
    cliente: { label: "Cliente", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
    usina: { label: "Usina", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  } as const;
  const it = map[origem];
  return <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs ${it.cls}`}>{it.label}</span>;
}

interface FaturaParaPagar {
  id: string;
  ano: number;
  mes: number;
  valorTotal: number | null;
  vencimento: string | null;
  codigoBarras: string | null;
  pixCopiaCola: string | null;
  pdfUrl: string | null;
  uc: { codigoUc: string; nome: string; distribuidora: string | null } | null;
}

const BANCOS = [
  { value: "C6_BANK", label: "C6 Bank" },
  { value: "BANRISUL", label: "Banrisul" },
  { value: "ASAAS", label: "Asaas" },
] as const;

export default function FaturasEnergiaGestaoFinanceiraPage() {
  const currentYear = new Date().getFullYear();
  const [ano, setAno] = useState(currentYear);
  const [rows, setRows] = useState<FaturasEnergiaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [origemFilter, setOrigemFilter] = useState<"all" | "cliente" | "usina">("all");
  const [apenasAtivas, setApenasAtivas] = useState(false);

  // Pagar Faturas modal — reusa o grid mês×UC do main, mas só abre células abertas.
  const [pagarOpen, setPagarOpen] = useState(false);
  const [pagarSearch, setPagarSearch] = useState("");
  const [pagarApenasAbertas, setPagarApenasAbertas] = useState(true);
  const [faturaParaPagar, setFaturaParaPagar] = useState<FaturaParaPagar | null>(null);
  const [carregandoFatura, setCarregandoFatura] = useState(false);
  const [pagPagoEm, setPagPagoEm] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [pagBanco, setPagBanco] = useState<string>("BANRISUL");
  const [pagComprovante, setPagComprovante] = useState<File | null>(null);
  const [pagSaving, setPagSaving] = useState(false);

  const abrirPagarFaturas = () => setPagarOpen(true);

  const abrirPagamentoCell = async (billId: string) => {
    setCarregandoFatura(true);
    setFaturaParaPagar({
      id: billId,
      ano: 0,
      mes: 0,
      valorTotal: null,
      vencimento: null,
      codigoBarras: null,
      pixCopiaCola: null,
      pdfUrl: null,
      uc: null,
    });
    setPagPagoEm(new Date().toISOString().slice(0, 10));
    setPagBanco("BANRISUL");
    setPagComprovante(null);
    try {
      const r = await fetch(`/api/admin/faturas-energia/${billId}`);
      if (r.ok) {
        const j = await r.json();
        setFaturaParaPagar(j as FaturaParaPagar);
      } else {
        toast.error("Erro ao carregar fatura");
        setFaturaParaPagar(null);
      }
    } finally {
      setCarregandoFatura(false);
    }
  };

  const recarregarRows = async () => {
    const r = await fetch(`/api/admin/faturas-energia?ano=${ano}`);
    if (r.ok) {
      const data = await r.json();
      setRows(data.rows ?? []);
    }
  };

  const confirmarPagamento = async () => {
    if (!faturaParaPagar) return;
    setPagSaving(true);
    try {
      const formData = new FormData();
      formData.append("pagoEm", pagPagoEm);
      formData.append("banco", pagBanco);
      if (pagComprovante) formData.append("comprovante", pagComprovante);
      const res = await fetch(
        `/api/admin/faturas-energia/${faturaParaPagar.id}/pagar`,
        { method: "POST", body: formData },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error("Erro ao registrar pagamento", { description: err.error });
        return;
      }
      toast.success("Pagamento registrado");
      setFaturaParaPagar(null);
      await recarregarRows();
    } finally {
      setPagSaving(false);
    }
  };

  const copiar = async (texto: string, label: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success(`${label} copiado`);
    } catch {
      toast.error("Falha ao copiar");
    }
  };

  // Filtra rows pro modal: search local + opção de mostrar só UCs com aberta.
  const pagarRows = useMemo(() => {
    const term = pagarSearch.trim().toLowerCase();
    return rows.filter((r) => {
      if (term) {
        const match =
          r.nome.toLowerCase().includes(term) ||
          r.codigoUc.toLowerCase().includes(term) ||
          r.proprietario.toLowerCase().includes(term) ||
          (r.distribuidora ?? "").toLowerCase().includes(term);
        if (!match) return false;
      }
      if (pagarApenasAbertas) {
        const temAberta = Object.values(r.meses).some(
          (c) => c.status !== "missing" && !c.pagoEm,
        );
        if (!temAberta) return false;
      }
      return true;
    });
  }, [rows, pagarSearch, pagarApenasAbertas]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/admin/faturas-energia?ano=${ano}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Falha ao carregar faturas"))))
      .then((data) => setRows(data.rows ?? []))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [ano]);

  const anos = useMemo(() => {
    const arr: number[] = [];
    for (let y = currentYear + 1; y >= currentYear - 4; y--) arr.push(y);
    return arr;
  }, [currentYear]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (apenasAtivas && !r.active) return false;
      if (origemFilter !== "all" && r.origem !== origemFilter) return false;
      if (!term) return true;
      return (
        r.nome.toLowerCase().includes(term) ||
        r.codigoUc.toLowerCase().includes(term) ||
        r.proprietario.toLowerCase().includes(term) ||
        (r.distribuidora ?? "").toLowerCase().includes(term)
      );
    });
  }, [rows, search, origemFilter, apenasAtivas]);

  const totals = useMemo(() => {
    let conferida = 0,
      aguardando = 0,
      anomalia = 0,
      aberta = 0,
      miss = 0,
      valorConferida = 0,
      valorAguardando = 0,
      valorAberta = 0;
    for (const r of filtered) {
      for (let m = 1; m <= 12; m++) {
        const c = r.meses[m];
        const p = getPagamento(c);
        if (p === "conferida") {
          conferida++;
          valorConferida += c?.valorTotal ?? 0;
        } else if (p === "so-interno") {
          aguardando++;
          valorAguardando += c?.valorTotal ?? 0;
        } else if (p === "so-rge") {
          anomalia++;
        } else if (p === "aberta") {
          aberta++;
          valorAberta += c?.valorTotal ?? 0;
        } else miss++;
      }
    }
    return {
      conferida,
      aguardando,
      anomalia,
      aberta,
      miss,
      valorConferida,
      valorAguardando,
      valorAberta,
    };
  }, [filtered]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <Wallet className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Faturas de Energia — Gestão Financeira</h1>
            <p className="text-sm text-muted-foreground">
              Dupla checagem: registro interno de pagamento × confirmação da concessionária (Infosimples).
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={abrirPagarFaturas}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 transition-colors"
        >
          <CreditCard className="h-4 w-4" />
          Pagar faturas
        </button>
      </div>

      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ano</label>
              <select value={ano} onChange={(e) => setAno(Number(e.target.value))} className={selectClass}>
                {anos.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Origem</label>
              <select
                value={origemFilter}
                onChange={(e) => setOrigemFilter(e.target.value as typeof origemFilter)}
                className={selectClass}
              >
                <option value="all">Todas</option>
                <option value="cliente">Clientes</option>
                <option value="usina">Usinas</option>
              </select>
            </div>
            <div className="space-y-1.5 flex-1 min-w-[200px]">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Buscar</label>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="UC, nome, proprietário, distribuidora..."
                className={`${selectClass} w-full`}
              />
            </div>
            <label className="flex items-center gap-2 text-sm h-9">
              <input
                type="checkbox"
                checked={apenasAtivas}
                onChange={(e) => setApenasAtivas(e.target.checked)}
                className="accent-primary"
              />
              Apenas ativas
            </label>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              <CheckCheck className="h-3.5 w-3.5 text-emerald-600" /> Conferidas
            </div>
            <div className="mt-1 text-2xl font-bold">{totals.conferida}</div>
            <div className="text-xs text-muted-foreground">{formatBRL(totals.valorConferida)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              <Clock4 className="h-3.5 w-3.5 text-sky-600" /> Aguardando RGE
            </div>
            <div className="mt-1 text-2xl font-bold">{totals.aguardando}</div>
            <div className="text-xs text-muted-foreground">{formatBRL(totals.valorAguardando)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              <Building2 className="h-3.5 w-3.5 text-amber-600" /> RGE sem registro
            </div>
            <div className="mt-1 text-2xl font-bold">{totals.anomalia}</div>
            <div className="text-xs text-muted-foreground">verificar</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              <X className="h-3.5 w-3.5 text-red-600" /> Em aberto
            </div>
            <div className="mt-1 text-2xl font-bold">{totals.aberta}</div>
            <div className="text-xs text-muted-foreground">{formatBRL(totals.valorAberta)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              <Minus className="h-3.5 w-3.5 text-muted-foreground/60" /> Sem dado
            </div>
            <div className="mt-1 text-2xl font-bold">{totals.miss}</div>
            <div className="text-xs text-muted-foreground">não sincronizado</div>
          </CardContent>
        </Card>
      </div>

      {loading && (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
          </CardContent>
        </Card>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {!loading && !error && (
        <Card>
          <CardContent className="p-3">
            <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
              <span className="font-medium uppercase tracking-wide">Legenda:</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-emerald-100 text-emerald-700">
                  <CheckCheck className="h-3 w-3" />
                </span>
                Conferida (interno + RGE)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-sky-100 text-sky-700">
                  <Clock4 className="h-3 w-3" />
                </span>
                Pago, aguardando RGE
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-amber-100 text-amber-700">
                  <Building2 className="h-3 w-3" />
                </span>
                RGE sem registro interno
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-red-100 text-red-700">
                  <X className="h-3 w-3" />
                </span>
                Em aberto
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-muted text-muted-foreground">
                  <Minus className="h-3 w-3" />
                </span>
                Sem fatura
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="sticky left-0 z-10 bg-background px-3 py-2 text-left font-medium text-xs uppercase tracking-wide">UC</th>
                    <th className="px-3 py-2 text-left font-medium text-xs uppercase tracking-wide">Nome</th>
                    <th className="px-3 py-2 text-left font-medium text-xs uppercase tracking-wide">Origem</th>
                    <th className="px-3 py-2 text-left font-medium text-xs uppercase tracking-wide">Distribuidora</th>
                    {MESES_LABEL.map((m) => (
                      <th key={m} className="px-2 py-2 text-center font-medium text-xs uppercase tracking-wide">
                        {m}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.ucId} className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${r.active ? "" : "opacity-60"}`}>
                      <td className="sticky left-0 z-10 bg-background px-3 py-2 font-mono text-xs">{r.codigoUc}</td>
                      <td className="px-3 py-2">{r.nome}</td>
                      <td className="px-3 py-2">
                        <OrigemBadge origem={r.origem} />
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{r.distribuidora ?? "-"}</td>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                        <td key={m} className="px-1 py-1 text-center">
                          <CellIcon cell={r.meses[m]} />
                        </td>
                      ))}
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={16} className="px-3 py-8 text-center text-sm text-muted-foreground">
                        Nenhuma UC encontrada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Modal: Pagar Faturas — replica o grid mês×UC. Células abertas (X) viram clicáveis. */}
      <Dialog open={pagarOpen} onOpenChange={setPagarOpen}>
        <DialogContent className="!max-w-[95vw] w-[95vw] max-h-[92vh] h-[92vh] overflow-hidden flex flex-col sm:!max-w-[95vw]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-emerald-600" />
              Pagar faturas — {ano}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 overflow-hidden flex flex-col">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <input
                value={pagarSearch}
                onChange={(e) => setPagarSearch(e.target.value)}
                placeholder="Buscar UC, nome ou distribuidora..."
                className={`${selectClass} flex-1 min-w-[200px]`}
              />
              <label className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={pagarApenasAbertas}
                  onChange={(e) => setPagarApenasAbertas(e.target.checked)}
                  className="accent-primary"
                />
                Apenas UCs com fatura sem pagamento interno
              </label>
              <span className="text-xs text-muted-foreground">
                Clique em <X className="inline h-3.5 w-3.5 text-red-700 mx-0.5" /> pra pagar.
              </span>
            </div>
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
              </div>
            ) : pagarRows.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                Nenhuma fatura em aberto.
              </div>
            ) : (
              <div className="overflow-auto flex-1 -mx-6 px-6">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background border-b z-10">
                    <tr className="text-muted-foreground">
                      <th className="sticky left-0 z-10 bg-background px-3 py-2 text-left font-medium text-xs uppercase tracking-wide">
                        UC
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-xs uppercase tracking-wide">
                        Nome
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-xs uppercase tracking-wide">
                        Distribuidora
                      </th>
                      {MESES_LABEL.map((m) => (
                        <th
                          key={m}
                          className="px-2 py-2 text-center font-medium text-xs uppercase tracking-wide"
                        >
                          {m}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pagarRows.map((r) => (
                      <tr
                        key={r.ucId}
                        className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${r.active ? "" : "opacity-60"}`}
                      >
                        <td className="sticky left-0 z-10 bg-background px-3 py-2 font-mono text-xs">
                          {r.codigoUc}
                        </td>
                        <td className="px-3 py-2">{r.nome}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {r.distribuidora ?? "-"}
                        </td>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                          const cell = r.meses[m];
                          const podePagar =
                            !!cell && cell.status !== "missing" && !cell.pagoEm;
                          return (
                            <td key={m} className="px-1 py-1 text-center">
                              {podePagar && cell.billId ? (
                                <button
                                  type="button"
                                  onClick={() => abrirPagamentoCell(cell.billId!)}
                                  title={`Pagar · ${formatBRL(cell.valorTotal)} · venc ${formatDate(cell.vencimento)}`}
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-red-100 text-red-700 hover:bg-red-200 hover:scale-110 transition-all dark:bg-red-900/40 dark:text-red-300 dark:hover:bg-red-900/60"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              ) : (
                                <CellIcon cell={cell} />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Sub-modal: Pagamento de uma fatura específica */}
      <Dialog
        open={faturaParaPagar !== null}
        onOpenChange={(open) => !open && setFaturaParaPagar(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Pagar fatura
              {faturaParaPagar && faturaParaPagar.mes > 0
                ? ` · ${MESES_LABEL[faturaParaPagar.mes - 1]}/${faturaParaPagar.ano}`
                : ""}
            </DialogTitle>
          </DialogHeader>
          {carregandoFatura ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando fatura...
            </div>
          ) : faturaParaPagar && faturaParaPagar.uc ? (
            <div className="space-y-3 text-sm">
              <div className="rounded border bg-muted/30 p-3 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">UC:</span>
                  <span className="font-medium">
                    {faturaParaPagar.uc.codigoUc} — {faturaParaPagar.uc.nome}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Vencimento:</span>
                  <span className="font-medium">
                    {faturaParaPagar.vencimento
                      ? formatDate(faturaParaPagar.vencimento)
                      : "-"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Valor:</span>
                  <span className="font-bold text-base">
                    {formatBRL(faturaParaPagar.valorTotal)}
                  </span>
                </div>
                {faturaParaPagar.pdfUrl && (
                  <div className="pt-1">
                    <a
                      href={faturaParaPagar.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-800"
                    >
                      <Download className="h-3 w-3" /> Baixar PDF da fatura
                    </a>
                  </div>
                )}
              </div>

              {faturaParaPagar.codigoBarras && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Código de barras
                  </label>
                  <div className="flex items-stretch gap-1.5">
                    <input
                      readOnly
                      value={faturaParaPagar.codigoBarras}
                      className={`${selectClass} w-full font-mono text-xs`}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        copiar(faturaParaPagar.codigoBarras!, "Código de barras")
                      }
                      className="inline-flex items-center gap-1 rounded border px-2 text-xs hover:bg-muted transition-colors"
                      title="Copiar"
                    >
                      <ClipboardCopy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {faturaParaPagar.pixCopiaCola && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    PIX Copia e Cola
                  </label>
                  <div className="flex items-stretch gap-1.5">
                    <textarea
                      readOnly
                      value={faturaParaPagar.pixCopiaCola}
                      rows={2}
                      className={`${selectClass} w-full font-mono text-[10px] leading-tight`}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        copiar(faturaParaPagar.pixCopiaCola!, "PIX")
                      }
                      className="inline-flex items-center gap-1 rounded border px-2 text-xs hover:bg-muted transition-colors"
                      title="Copiar"
                    >
                      <ClipboardCopy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {!faturaParaPagar.codigoBarras &&
                !faturaParaPagar.pixCopiaCola && (
                  <p className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                    Sem código de barras nem PIX cadastrado nessa fatura.
                  </p>
                )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Data do pagamento
                  </label>
                  <input
                    type="date"
                    value={pagPagoEm}
                    onChange={(e) => setPagPagoEm(e.target.value)}
                    className={`${selectClass} w-full`}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Pago via
                  </label>
                  <select
                    value={pagBanco}
                    onChange={(e) => setPagBanco(e.target.value)}
                    className={`${selectClass} w-full`}
                  >
                    {BANCOS.map((b) => (
                      <option key={b.value} value={b.value}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Comprovante (opcional)
                </label>
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={(e) => setPagComprovante(e.target.files?.[0] ?? null)}
                  className="block w-full text-xs file:mr-2 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-medium hover:file:bg-muted/80"
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <button
              type="button"
              onClick={() => setFaturaParaPagar(null)}
              disabled={pagSaving}
              className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmarPagamento}
              disabled={pagSaving}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              {pagSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Salvando...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" /> Confirmar pagamento
                </>
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

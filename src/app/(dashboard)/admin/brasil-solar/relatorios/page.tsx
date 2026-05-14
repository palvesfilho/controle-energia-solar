"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, X, Minus, Loader2, FileBarChart, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type {
  RelatorioVisaoGeralRow,
  RelatorioCell,
} from "@/app/api/brasil-solar/relatorios/visao-geral/route";

const MESES_LABEL = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const selectClass =
  "text-sm border rounded-lg px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all";

function fmtKwh(v: number | null) {
  if (v == null) return "—";
  return Math.round(v).toLocaleString("pt-BR");
}

function buildCellTooltip(cell: RelatorioCell, statusLine: string): string {
  const lines = [
    statusLine,
    "",
    `G  Geração inversor:    ${fmtKwh(cell.geracaoInversorKwh)} kWh`,
    `CI Consumo instantâneo: ${fmtKwh(cell.consumoInstantaneoKwh)} kWh`,
    `CR Consumo da rede:     ${fmtKwh(cell.consumoRedeKwh)} kWh`,
    `CT Consumo total:       ${fmtKwh(cell.consumoTotalKwh)} kWh`,
  ];
  if (cell.motivo) {
    lines.push("", cell.motivo);
  }
  return lines.join("\n");
}

function CellIcon({
  cell,
  proprietarioId,
  ucId,
  ano,
}: {
  cell: RelatorioCell;
  proprietarioId: string;
  ucId: string | null;
  ano: number;
}) {
  let badgeClass: string;
  let icon: React.ReactNode;
  let statusLine: string;
  if (cell.status === "missing") {
    badgeClass = "bg-muted text-muted-foreground";
    icon = <Minus className="h-3.5 w-3.5" />;
    statusLine = "Indisponível";
  } else if (cell.status === "error") {
    badgeClass = "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
    icon = <X className="h-3.5 w-3.5" />;
    statusLine = "Dados faltando — clique para corrigir";
  } else {
    badgeClass = "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
    icon = <CheckCircle2 className="h-3.5 w-3.5" />;
    statusLine = "Relatório gerável — clique para abrir";
  }

  const tooltip = buildCellTooltip(cell, statusLine);

  const badge = (
    <span
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md ${badgeClass}`}
    >
      {icon}
    </span>
  );

  const linkable = ucId && (cell.status === "ok" || cell.status === "error");
  if (linkable) {
    return (
      <Link
        href={`/admin/brasil-solar/proprietarios/${proprietarioId}/relatorios/${ucId}/${ano}/${cell.mes}`}
        title={tooltip}
        className="inline-flex items-center justify-center transition hover:opacity-80"
      >
        {badge}
      </Link>
    );
  }

  return (
    <span title={tooltip} className="inline-flex items-center justify-center">
      {badge}
    </span>
  );
}

export default function RelatoriosVisaoGeralPage() {
  const currentYear = new Date().getFullYear();
  const [ano, setAno] = useState(currentYear);
  const [rows, setRows] = useState<RelatorioVisaoGeralRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [escopo, setEscopo] = useState<"todos" | "comUc" | "semUc">("todos");

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/brasil-solar/relatorios/visao-geral?ano=${ano}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Falha ao carregar"))))
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
      if (escopo === "comUc" && !r.ucId) return false;
      if (escopo === "semUc" && r.ucId) return false;
      if (!term) return true;
      return (
        r.proprietarioNome.toLowerCase().includes(term) ||
        (r.cpfCnpj ?? "").toLowerCase().includes(term) ||
        (r.codigoUc ?? "").toLowerCase().includes(term) ||
        (r.ucNome ?? "").toLowerCase().includes(term) ||
        (r.distribuidora ?? "").toLowerCase().includes(term)
      );
    });
  }, [rows, search, escopo]);

  const totals = useMemo(() => {
    let ok = 0,
      err = 0,
      miss = 0,
      comUc = 0,
      semUc = 0;
    for (const r of filtered) {
      if (r.ucId) comUc++;
      else semUc++;
      for (let m = 1; m <= 12; m++) {
        const c = r.meses[m];
        if (!c) continue;
        if (c.status === "ok") ok++;
        else if (c.status === "error") err++;
        else miss++;
      }
    }
    return { ok, err, miss, comUc, semUc };
  }, [filtered]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          <FileBarChart className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Relatórios Brasil Solar — Visão Geral</h1>
          <p className="text-sm text-muted-foreground">
            Status mês-a-mês de cada proprietário Brasil Solar. Clique em um mês para abrir / corrigir o relatório.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-3 space-y-3">
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
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">UC vinculada</label>
              <select
                value={escopo}
                onChange={(e) => setEscopo(e.target.value as typeof escopo)}
                className={selectClass}
              >
                <option value="todos">Todos os proprietários</option>
                <option value="comUc">Com UC vinculada</option>
                <option value="semUc">Sem UC vinculada</option>
              </select>
            </div>
            <div className="space-y-1.5 flex-1 min-w-[220px]">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Buscar</label>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Proprietário, CPF/CNPJ, UC, distribuidora..."
                className={`${selectClass} w-full`}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm bg-emerald-500" />
              Relatório gerável ({totals.ok})
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm bg-red-500" />
              Dados faltando ({totals.err})
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm bg-muted-foreground/40" />
              Sem UC vinculada ({totals.miss})
            </div>
            <div className="border-l pl-4 text-muted-foreground/80">
              Passe o mouse na célula para ver geração e consumo do mês
            </div>
            <div className="ml-auto">
              {filtered.length} proprietário(s) — {totals.comUc} com UC · {totals.semUc} sem
            </div>
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando...
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              {error}
            </div>
          )}

          {!loading && !error && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="sticky left-0 z-10 bg-background px-3 py-2 text-left font-medium text-xs uppercase tracking-wide">
                      Proprietário Brasil Solar
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-xs uppercase tracking-wide">UC</th>
                    <th className="px-3 py-2 text-left font-medium text-xs uppercase tracking-wide">UC nome</th>
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
                  {filtered.map((r) => (
                    <tr
                      key={r.proprietarioId}
                      className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${
                        r.active ? "" : "opacity-60"
                      }`}
                    >
                      <td className="sticky left-0 z-10 bg-background px-3 py-2">
                        <Link
                          href={`/admin/brasil-solar/proprietarios/${r.proprietarioId}`}
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          {r.proprietarioNome}
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                        {r.cpfCnpj && (
                          <div className="text-[11px] text-muted-foreground font-mono">{r.cpfCnpj}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {r.codigoUc ? (
                          r.codigoUc
                        ) : (
                          <span className="inline-flex items-center rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                            sem UC
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">{r.ucNome ?? "-"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.distribuidora ?? "-"}</td>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                        <td key={m} className="px-1 py-1 text-center">
                          <CellIcon
                            cell={r.meses[m]}
                            proprietarioId={r.proprietarioId}
                            ucId={r.ucId}
                            ano={ano}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={16} className="px-3 py-8 text-center text-sm text-muted-foreground">
                        Nenhum proprietário encontrado com os filtros atuais.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

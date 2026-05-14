"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowUpDown, Search } from "lucide-react";
import { formatBRL, formatKWh, formatMonthYear } from "@/lib/formatters";

interface BalancoRow {
  id: string;
  codigoUc: string;
  nome: string;
  consumerName: string | null;
  consumoKwh: number | null;
  energiaCompensada: number | null;
  saldoCreditos: number | null;
  valorCobranca: number | null;
  valorEconomia: number | null;
}

type SortKey =
  | "codigoUc"
  | "nome"
  | "consumoKwh"
  | "energiaCompensada"
  | "valorCobranca"
  | "valorEconomia"
  | "saldoCreditos";
type SortDir = "asc" | "desc";

const selectClass =
  "text-sm border rounded-lg px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all";

export default function BalancoMensalPage() {
  const now = useMemo(() => new Date(), []);
  const [ano, setAno] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);

  const [rows, setRows] = useState<BalancoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "nome",
    dir: "asc",
  });

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ ano: String(ano), mes: String(mes) });
    fetch(`/api/credit-management/monthly-balance?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => setRows(Array.isArray(data?.rows) ? data.rows : []))
      .finally(() => setLoading(false));
  }, [ano, mes]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (!term) return true;
      return (
        r.nome.toLowerCase().includes(term) ||
        r.codigoUc.toLowerCase().includes(term) ||
        (r.consumerName ?? "").toLowerCase().includes(term)
      );
    });

    const dir = sort.dir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      const key = sort.key;
      if (key === "nome" || key === "codigoUc") {
        return a[key].localeCompare(b[key]) * dir;
      }
      const av = a[key] ?? -Infinity;
      const bv = b[key] ?? -Infinity;
      return (av - bv) * dir;
    });
    return list;
  }, [rows, search, sort]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.consumo += r.consumoKwh ?? 0;
        acc.compensada += r.energiaCompensada ?? 0;
        acc.faturamento += r.valorCobranca ?? 0;
        acc.economia += r.valorEconomia ?? 0;
        acc.saldo += r.saldoCreditos ?? 0;
        return acc;
      },
      { consumo: 0, compensada: 0, faturamento: 0, economia: 0, saldo: 0 }
    );
  }, [rows]);

  const toggleSort = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" }
    );

  const anos = useMemo(() => {
    const y = now.getFullYear();
    return [y - 2, y - 1, y, y + 1];
  }, [now]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Balanço Mensal</h1>
        <p className="text-sm text-muted-foreground">
          Balanço mensal de créditos e faturamento por unidade consumidora —{" "}
          {formatMonthYear(mes, ano)}
        </p>
      </div>

      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por UC, nome ou consumidor..."
                className="w-full pl-8 pr-3 py-1.5 text-sm border rounded-lg bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
              />
            </div>
            <select
              value={mes}
              onChange={(e) => setMes(Number(e.target.value))}
              className={selectClass}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {formatMonthYear(m, ano).split(" ")[0]}
                </option>
              ))}
            </select>
            <select
              value={ano}
              onChange={(e) => setAno(Number(e.target.value))}
              className={selectClass}
            >
              {anos.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <span className="ml-auto text-xs text-muted-foreground">
              {filtered.length} de {rows.length}
            </span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Carregando...
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {rows.length === 0
                ? "Nenhuma UC cadastrada."
                : "Nenhum resultado para a busca."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <SortHeader
                      label="Número UC"
                      active={sort.key === "codigoUc"}
                      dir={sort.dir}
                      onClick={() => toggleSort("codigoUc")}
                    />
                    <SortHeader
                      label="Nome"
                      active={sort.key === "nome"}
                      dir={sort.dir}
                      onClick={() => toggleSort("nome")}
                    />
                    <SortHeader
                      label="Consumida"
                      align="right"
                      active={sort.key === "consumoKwh"}
                      dir={sort.dir}
                      onClick={() => toggleSort("consumoKwh")}
                    />
                    <SortHeader
                      label="Compensada"
                      align="right"
                      active={sort.key === "energiaCompensada"}
                      dir={sort.dir}
                      onClick={() => toggleSort("energiaCompensada")}
                    />
                    <SortHeader
                      label="Faturamento"
                      align="right"
                      active={sort.key === "valorCobranca"}
                      dir={sort.dir}
                      onClick={() => toggleSort("valorCobranca")}
                    />
                    <SortHeader
                      label="Economia"
                      align="right"
                      active={sort.key === "valorEconomia"}
                      dir={sort.dir}
                      onClick={() => toggleSort("valorEconomia")}
                    />
                    <SortHeader
                      label="Saldo Créditos"
                      align="right"
                      active={sort.key === "saldoCreditos"}
                      dir={sort.dir}
                      onClick={() => toggleSort("saldoCreditos")}
                    />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="py-2.5 px-3 font-mono text-xs">
                        {r.codigoUc || "-"}
                      </td>
                      <td className="py-2.5 px-3 font-medium">
                        {r.nome}
                        {r.consumerName && (
                          <div className="text-xs text-muted-foreground font-normal">
                            {r.consumerName}
                          </div>
                        )}
                      </td>
                      <NumCell value={r.consumoKwh} unit="kwh" />
                      <NumCell value={r.energiaCompensada} unit="kwh" />
                      <NumCell value={r.valorCobranca} unit="brl" />
                      <NumCell value={r.valorEconomia} unit="brl" />
                      <NumCell value={r.saldoCreditos} unit="kwh" />
                    </tr>
                  ))}
                </tbody>
                {rows.length > 0 && (
                  <tfoot>
                    <tr className="border-t bg-muted/20 font-medium">
                      <td className="py-2.5 px-3" colSpan={2}>
                        Totais
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {formatKWh(totals.consumo)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {formatKWh(totals.compensada)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {formatBRL(totals.faturamento)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {formatBRL(totals.economia)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {formatKWh(totals.saldo)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function NumCell({
  value,
  unit,
}: {
  value: number | null;
  unit: "kwh" | "brl";
}) {
  if (value === null || value === undefined) {
    return (
      <td className="py-2.5 px-3 text-right text-muted-foreground">-</td>
    );
  }
  return (
    <td className="py-2.5 px-3 text-right tabular-nums">
      {unit === "kwh" ? formatKWh(value) : formatBRL(value)}
    </td>
  );
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
  align = "left",
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  align?: "left" | "center" | "right";
}) {
  const alignClass =
    align === "center"
      ? "text-center"
      : align === "right"
      ? "text-right"
      : "text-left";
  return (
    <th
      className={`py-2 px-3 font-medium text-xs uppercase tracking-wide ${alignClass}`}
    >
      <button
        onClick={onClick}
        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${
          active ? "text-foreground" : ""
        }`}
      >
        {label}
        <ArrowUpDown
          className={`h-3 w-3 ${active ? "opacity-100" : "opacity-40"} ${
            active && dir === "desc" ? "rotate-180" : ""
          } transition-transform`}
        />
      </button>
    </th>
  );
}

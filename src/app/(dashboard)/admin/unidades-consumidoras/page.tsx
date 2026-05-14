"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Pencil,
  Search,
  ArrowUpDown,
  Factory,
  CheckCircle2,
  Zap,
  Building,
} from "lucide-react";

interface UCData {
  id: string;
  nome: string;
  codigoUc: string;
  cpfCnpj: string | null;
  distribuidora: string | null;
  grupo: string | null;
  modalidade: string | null;
  consumoMedio: number | null;
  cidade: string | null;
  statusContrato: string | null;
  active: boolean;
  consumer: { id: string; name: string } | null;
  plant: { id: string; name: string } | null;
}

type SortKey = "nome" | "codigoUc" | "consumo" | "status";
type SortDir = "asc" | "desc";

export default function UnidadesConsumidorasPage() {
  const [ucs, setUcs] = useState<UCData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterDistribuidora, setFilterDistribuidora] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "nome", dir: "asc" });

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterDistribuidora) params.set("distribuidora", filterDistribuidora);
    if (filterStatus) params.set("status", filterStatus);

    fetch(`/api/consumer-units?${params.toString()}`)
      .then((res) => res.json())
      .then(setUcs)
      .finally(() => setLoading(false));
  }, [filterDistribuidora, filterStatus]);

  const distribuidoras = useMemo(
    () => Array.from(new Set(ucs.map((u) => u.distribuidora).filter(Boolean))) as string[],
    [ucs]
  );

  const stats = useMemo(() => {
    const ativas = ucs.filter((u) => u.statusContrato === "Ativo").length;
    const consumoTotal = ucs.reduce((acc, u) => acc + (u.consumoMedio ?? 0), 0);
    return { total: ucs.length, ativas, consumoTotal, distribuidoras: distribuidoras.length };
  }, [ucs, distribuidoras]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = ucs.filter((u) => {
      if (!term) return true;
      return (
        u.nome.toLowerCase().includes(term) ||
        u.codigoUc.toLowerCase().includes(term) ||
        (u.consumer?.name ?? "").toLowerCase().includes(term) ||
        (u.plant?.name ?? "").toLowerCase().includes(term)
      );
    });

    rows.sort((a, b) => {
      const dir = sort.dir === "asc" ? 1 : -1;
      switch (sort.key) {
        case "nome":
          return a.nome.localeCompare(b.nome) * dir;
        case "codigoUc":
          return a.codigoUc.localeCompare(b.codigoUc) * dir;
        case "consumo":
          return ((a.consumoMedio ?? 0) - (b.consumoMedio ?? 0)) * dir;
        case "status":
          return (a.statusContrato ?? "").localeCompare(b.statusContrato ?? "") * dir;
      }
    });
    return rows;
  }, [ucs, search, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Unidades Consumidoras</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie as UCs vinculadas a consumidores e usinas
          </p>
        </div>
        <Link
          href="/admin/unidades-consumidoras/nova"
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nova UC
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<Factory className="h-4 w-4" />} label="Total" value={stats.total} accent="blue" />
        <StatCard icon={<CheckCircle2 className="h-4 w-4" />} label="Ativas" value={stats.ativas} accent="emerald" />
        <StatCard
          icon={<Zap className="h-4 w-4" />}
          label="Consumo médio total"
          value={`${stats.consumoTotal.toLocaleString("pt-BR")} kWh`}
          accent="amber"
        />
        <StatCard icon={<Building className="h-4 w-4" />} label="Distribuidoras" value={stats.distribuidoras} accent="zinc" />
      </div>

      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome, código, consumidor ou usina..."
                className="w-full pl-8 pr-3 py-1.5 text-sm border rounded-lg bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
              />
            </div>
            <select
              value={filterDistribuidora}
              onChange={(e) => setFilterDistribuidora(e.target.value)}
              className="text-sm border rounded-lg px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            >
              <option value="">Todas distribuidoras</option>
              {distribuidoras.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="text-sm border rounded-lg px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            >
              <option value="">Todos status</option>
              <option value="Ativo">Ativo</option>
              <option value="Inativo">Inativo</option>
              <option value="Pendente">Pendente</option>
            </select>
            <span className="ml-auto text-xs text-muted-foreground">
              {filtered.length} de {stats.total}
            </span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {ucs.length === 0 ? "Nenhuma UC cadastrada." : "Nenhum resultado para os filtros."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <SortHeader label="Nome" active={sort.key === "nome"} dir={sort.dir} onClick={() => toggleSort("nome")} />
                    <SortHeader label="Código UC" active={sort.key === "codigoUc"} dir={sort.dir} onClick={() => toggleSort("codigoUc")} />
                    <th className="text-left py-2 px-3 font-medium text-xs uppercase tracking-wide">Consumidor</th>
                    <th className="text-left py-2 px-3 font-medium text-xs uppercase tracking-wide">Usina</th>
                    <th className="text-left py-2 px-3 font-medium text-xs uppercase tracking-wide">Distribuidora</th>
                    <SortHeader label="Consumo" align="right" active={sort.key === "consumo"} dir={sort.dir} onClick={() => toggleSort("consumo")} />
                    <SortHeader label="Status" align="center" active={sort.key === "status"} dir={sort.dir} onClick={() => toggleSort("status")} />
                    <th className="text-center py-2 px-3 font-medium text-xs uppercase tracking-wide">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((uc) => (
                    <tr key={uc.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-3 font-medium">{uc.nome}</td>
                      <td className="py-2.5 px-3 font-mono text-xs">{uc.codigoUc || "-"}</td>
                      <td className="py-2.5 px-3">
                        {uc.consumer?.name ?? <span className="text-muted-foreground">-</span>}
                      </td>
                      <td className="py-2.5 px-3">
                        {uc.plant?.name ?? <span className="text-muted-foreground">-</span>}
                      </td>
                      <td className="py-2.5 px-3">
                        {uc.distribuidora ?? <span className="text-muted-foreground">-</span>}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {uc.consumoMedio ? `${uc.consumoMedio.toLocaleString("pt-BR")} kWh` : "-"}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <Badge
                          variant={uc.statusContrato === "Ativo" ? "default" : "secondary"}
                          className={uc.statusContrato === "Ativo" ? "bg-emerald-500 hover:bg-emerald-600" : ""}
                        >
                          {uc.statusContrato ?? "—"}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <Link
                          href={`/admin/unidades-consumidoras/${uc.id}/editar`}
                          title="Editar"
                          className="inline-flex p-1.5 rounded hover:bg-muted transition-colors"
                        >
                          <Pencil className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
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
  const alignClass = align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left";
  return (
    <th className={`py-2 px-3 font-medium text-xs uppercase tracking-wide ${alignClass}`}>
      <button
        onClick={onClick}
        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${active ? "text-foreground" : ""}`}
      >
        {label}
        <ArrowUpDown className={`h-3 w-3 ${active ? "opacity-100" : "opacity-40"} ${active && dir === "desc" ? "rotate-180" : ""} transition-transform`} />
      </button>
    </th>
  );
}

const ACCENT_CLASSES = {
  blue: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  amber: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  zinc: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
} as const;

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  accent: keyof typeof ACCENT_CLASSES;
}) {
  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-3">
        <div className={`p-2 rounded-lg ${ACCENT_CLASSES[accent]}`}>{icon}</div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-lg font-semibold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

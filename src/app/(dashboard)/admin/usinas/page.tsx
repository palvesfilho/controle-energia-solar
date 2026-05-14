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
  Sun,
  Zap,
  Users,
  Factory,
} from "lucide-react";

interface PlantData {
  id: string;
  name: string;
  fonte: string | null;
  numeroUsina: string | null;
  unidadeConsumidora: string | null;
  potenciaInstalada: number | null;
  grupo: string | null;
  cpfCnpj: string | null;
  distribuidora: string | null;
  acesso: string | null;
  statusContrato: string | null;
  active: boolean;
  investors: {
    valorKwhContrato: number | null;
    investor: { user: { name: string } };
  }[];
  consumerUnits: { id: string }[];
}

type SortKey = "name" | "potencia" | "ucs" | "status";
type SortDir = "asc" | "desc";

export default function UsinasPage() {
  const [plants, setPlants] = useState<PlantData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "ativo" | "inativo">("");
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "name", dir: "asc" });

  useEffect(() => {
    fetch("/api/plants")
      .then((res) => res.json())
      .then(setPlants)
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const ativas = plants.filter((p) => p.statusContrato === "Ativo").length;
    const totalPotencia = plants.reduce((acc, p) => acc + (p.potenciaInstalada ?? 0), 0);
    const totalUcs = plants.reduce((acc, p) => acc + p.consumerUnits.length, 0);
    return { total: plants.length, ativas, totalPotencia, totalUcs };
  }, [plants]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = plants.filter((p) => {
      if (statusFilter === "ativo" && p.statusContrato !== "Ativo") return false;
      if (statusFilter === "inativo" && p.statusContrato === "Ativo") return false;
      if (!term) return true;
      return (
        p.name.toLowerCase().includes(term) ||
        (p.numeroUsina ?? "").toLowerCase().includes(term) ||
        (p.unidadeConsumidora ?? "").toLowerCase().includes(term) ||
        (p.cpfCnpj ?? "").toLowerCase().includes(term) ||
        (p.distribuidora ?? "").toLowerCase().includes(term)
      );
    });

    rows.sort((a, b) => {
      const dir = sort.dir === "asc" ? 1 : -1;
      switch (sort.key) {
        case "name":
          return a.name.localeCompare(b.name) * dir;
        case "potencia":
          return ((a.potenciaInstalada ?? 0) - (b.potenciaInstalada ?? 0)) * dir;
        case "ucs":
          return (a.consumerUnits.length - b.consumerUnits.length) * dir;
        case "status":
          return ((a.statusContrato ?? "").localeCompare(b.statusContrato ?? "")) * dir;
      }
    });
    return rows;
  }, [plants, search, statusFilter, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Usinas</h1>
          <p className="text-sm text-muted-foreground">Gerencie as usinas geradoras</p>
        </div>
        <Link
          href="/admin/usinas/nova"
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nova Usina
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<Sun className="h-4 w-4" />} label="Total" value={stats.total} accent="amber" />
        <StatCard icon={<Factory className="h-4 w-4" />} label="Ativas" value={stats.ativas} accent="emerald" />
        <StatCard
          icon={<Zap className="h-4 w-4" />}
          label="Potência instalada"
          value={`${stats.totalPotencia.toLocaleString("pt-BR")} kWp`}
          accent="blue"
        />
        <StatCard icon={<Users className="h-4 w-4" />} label="UCs vinculadas" value={stats.totalUcs} accent="zinc" />
      </div>

      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome, número, CPF/CNPJ ou distribuidora..."
                className="w-full pl-8 pr-3 py-1.5 text-sm border rounded-lg bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="text-sm border rounded-lg px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            >
              <option value="">Todos os status</option>
              <option value="ativo">Ativos</option>
              <option value="inativo">Inativos</option>
            </select>
            <span className="ml-auto text-xs text-muted-foreground">
              {filtered.length} de {stats.total}
            </span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {plants.length === 0 ? "Nenhuma usina cadastrada." : "Nenhum resultado para os filtros."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <SortHeader label="Nome" active={sort.key === "name"} dir={sort.dir} onClick={() => toggleSort("name")} />
                    <th className="text-left py-2 px-3 font-medium text-xs uppercase tracking-wide">UC</th>
                    <th className="text-left py-2 px-3 font-medium text-xs uppercase tracking-wide">CPF/CNPJ</th>
                    <SortHeader label="Potência" align="right" active={sort.key === "potencia"} dir={sort.dir} onClick={() => toggleSort("potencia")} />
                    <th className="text-center py-2 px-3 font-medium text-xs uppercase tracking-wide">Grupo</th>
                    <th className="text-left py-2 px-3 font-medium text-xs uppercase tracking-wide">Distribuidora</th>
                    <SortHeader label="UCs" align="center" active={sort.key === "ucs"} dir={sort.dir} onClick={() => toggleSort("ucs")} />
                    <SortHeader label="Status" align="center" active={sort.key === "status"} dir={sort.dir} onClick={() => toggleSort("status")} />
                    <th className="text-center py-2 px-3 font-medium text-xs uppercase tracking-wide">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((plant) => (
                    <tr key={plant.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-3 font-medium">{plant.name}</td>
                      <td className="py-2.5 px-3 font-mono text-xs">
                        {plant.unidadeConsumidora ?? plant.numeroUsina ?? "-"}
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground">{plant.cpfCnpj ?? "-"}</td>
                      <td className="py-2.5 px-3 text-right">
                        {plant.potenciaInstalada ? `${plant.potenciaInstalada} kWp` : "-"}
                      </td>
                      <td className="py-2.5 px-3 text-center">{plant.grupo ?? "-"}</td>
                      <td className="py-2.5 px-3">{plant.distribuidora ?? "-"}</td>
                      <td className="py-2.5 px-3 text-center">
                        <Badge variant="secondary">{plant.consumerUnits.length}</Badge>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <Badge
                          variant={plant.statusContrato === "Ativo" ? "default" : "secondary"}
                          className={plant.statusContrato === "Ativo" ? "bg-emerald-500 hover:bg-emerald-600" : ""}
                        >
                          {plant.statusContrato ?? "—"}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <Link
                          href={`/admin/usinas/${plant.id}`}
                          title="Abrir / editar"
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

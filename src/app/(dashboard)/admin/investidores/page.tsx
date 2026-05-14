"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Eye, Search, ArrowUpDown, Users, UserCheck, UserX, Sun } from "lucide-react";

interface InvestorData {
  id: string;
  phone: string | null;
  document: string | null;
  user: { id: string; email: string; name: string; active: boolean };
  plants: { plant: { name: string } }[];
}

type SortKey = "name" | "email" | "usinas" | "status";
type SortDir = "asc" | "desc";

export default function InvestidoresPage() {
  const [investors, setInvestors] = useState<InvestorData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "ativo" | "inativo">("");
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "name", dir: "asc" });

  useEffect(() => {
    fetch("/api/investors")
      .then((res) => res.json())
      .then(setInvestors)
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const ativos = investors.filter((i) => i.user.active).length;
    const comUsinas = investors.filter((i) => i.plants.length > 0).length;
    return { total: investors.length, ativos, inativos: investors.length - ativos, comUsinas };
  }, [investors]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = investors.filter((inv) => {
      if (statusFilter === "ativo" && !inv.user.active) return false;
      if (statusFilter === "inativo" && inv.user.active) return false;
      if (!term) return true;
      return (
        inv.user.name.toLowerCase().includes(term) ||
        inv.user.email.toLowerCase().includes(term) ||
        (inv.phone ?? "").toLowerCase().includes(term) ||
        (inv.document ?? "").toLowerCase().includes(term)
      );
    });

    rows.sort((a, b) => {
      const dir = sort.dir === "asc" ? 1 : -1;
      switch (sort.key) {
        case "name":
          return a.user.name.localeCompare(b.user.name) * dir;
        case "email":
          return a.user.email.localeCompare(b.user.email) * dir;
        case "usinas":
          return (a.plants.length - b.plants.length) * dir;
        case "status":
          return (Number(a.user.active) - Number(b.user.active)) * dir;
      }
    });
    return rows;
  }, [investors, search, statusFilter, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Investidores</h1>
          <p className="text-sm text-muted-foreground">Gerencie os investidores cadastrados</p>
        </div>
        <Link
          href="/admin/investidores/novo"
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Novo Investidor
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<Users className="h-4 w-4" />} label="Total" value={stats.total} accent="blue" />
        <StatCard icon={<UserCheck className="h-4 w-4" />} label="Ativos" value={stats.ativos} accent="emerald" />
        <StatCard icon={<UserX className="h-4 w-4" />} label="Inativos" value={stats.inativos} accent="zinc" />
        <StatCard icon={<Sun className="h-4 w-4" />} label="Com usinas" value={stats.comUsinas} accent="amber" />
      </div>

      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome, email, telefone ou documento..."
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
              {investors.length === 0 ? "Nenhum investidor cadastrado." : "Nenhum resultado para os filtros."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <SortHeader label="Nome" active={sort.key === "name"} dir={sort.dir} onClick={() => toggleSort("name")} />
                    <SortHeader label="Email" active={sort.key === "email"} dir={sort.dir} onClick={() => toggleSort("email")} />
                    <th className="text-left py-2 px-3 font-medium text-xs uppercase tracking-wide">Telefone</th>
                    <SortHeader label="Usinas" active={sort.key === "usinas"} dir={sort.dir} onClick={() => toggleSort("usinas")} />
                    <SortHeader label="Status" align="center" active={sort.key === "status"} dir={sort.dir} onClick={() => toggleSort("status")} />
                    <th className="text-center py-2 px-3 font-medium text-xs uppercase tracking-wide">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((inv) => (
                    <tr key={inv.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-3 font-medium">{inv.user.name}</td>
                      <td className="py-2.5 px-3 text-muted-foreground">{inv.user.email}</td>
                      <td className="py-2.5 px-3">{inv.phone ?? "-"}</td>
                      <td className="py-2.5 px-3">
                        {inv.plants.length > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs">
                            <Sun className="h-3 w-3 text-amber-500" />
                            {inv.plants.length}{" "}
                            <span className="text-muted-foreground truncate max-w-[200px]">
                              · {inv.plants.map((p) => p.plant.name).join(", ")}
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">Nenhuma</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <Badge
                          variant={inv.user.active ? "default" : "secondary"}
                          className={inv.user.active ? "bg-emerald-500 hover:bg-emerald-600" : ""}
                        >
                          {inv.user.active ? "Ativo" : "Inativo"}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Link
                            href={`/admin/investidores/${inv.id}`}
                            title="Ver detalhes"
                            className="p-1.5 rounded hover:bg-muted transition-colors"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                          <Link
                            href={`/admin/investidores/${inv.id}/editar`}
                            title="Editar"
                            className="p-1.5 rounded hover:bg-muted transition-colors"
                          >
                            <Pencil className="h-4 w-4" />
                          </Link>
                        </div>
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
  align?: "left" | "center";
}) {
  return (
    <th className={`py-2 px-3 font-medium text-xs uppercase tracking-wide ${align === "center" ? "text-center" : "text-left"}`}>
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
  value: number;
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

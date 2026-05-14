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
  Users,
  UserCheck,
  UserX,
  Zap,
} from "lucide-react";

interface ConsumerData {
  id: string;
  name: string;
  cpfCnpj: string | null;
  document: string | null;
  phone: string | null;
  emailsRecebimento: string | null;
  loginPortal: string | null;
  dataCadastro: string | null;
  active: boolean;
  consumerUnits: { id: string; codigoUc: string }[];
}

type SortKey = "name" | "cpfCnpj" | "ucs" | "status";
type SortDir = "asc" | "desc";

export default function ConsumidoresPage() {
  const [consumers, setConsumers] = useState<ConsumerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "ativo" | "inativo">("");
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "name", dir: "asc" });

  useEffect(() => {
    fetch("/api/consumers")
      .then((res) => res.json())
      .then(setConsumers)
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const ativos = consumers.filter((c) => c.active).length;
    const totalUcs = consumers.reduce((acc, c) => acc + c.consumerUnits.length, 0);
    return { total: consumers.length, ativos, inativos: consumers.length - ativos, totalUcs };
  }, [consumers]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = consumers.filter((c) => {
      if (statusFilter === "ativo" && !c.active) return false;
      if (statusFilter === "inativo" && c.active) return false;
      if (!term) return true;
      return (
        c.name.toLowerCase().includes(term) ||
        (c.cpfCnpj ?? "").toLowerCase().includes(term) ||
        (c.document ?? "").toLowerCase().includes(term) ||
        (c.phone ?? "").toLowerCase().includes(term) ||
        (c.emailsRecebimento ?? "").toLowerCase().includes(term)
      );
    });

    rows.sort((a, b) => {
      const dir = sort.dir === "asc" ? 1 : -1;
      switch (sort.key) {
        case "name":
          return a.name.localeCompare(b.name) * dir;
        case "cpfCnpj":
          return (a.cpfCnpj ?? a.document ?? "").localeCompare(b.cpfCnpj ?? b.document ?? "") * dir;
        case "ucs":
          return (a.consumerUnits.length - b.consumerUnits.length) * dir;
        case "status":
          return (Number(a.active) - Number(b.active)) * dir;
      }
    });
    return rows;
  }, [consumers, search, statusFilter, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Consumidores</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie os clientes consumidores de energia
          </p>
        </div>
        <Link
          href="/admin/consumidores/novo"
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Novo Consumidor
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<Users className="h-4 w-4" />} label="Total" value={stats.total} accent="blue" />
        <StatCard icon={<UserCheck className="h-4 w-4" />} label="Ativos" value={stats.ativos} accent="emerald" />
        <StatCard icon={<UserX className="h-4 w-4" />} label="Inativos" value={stats.inativos} accent="zinc" />
        <StatCard icon={<Zap className="h-4 w-4" />} label="UCs vinculadas" value={stats.totalUcs} accent="amber" />
      </div>

      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome, CPF/CNPJ, telefone ou email..."
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
              {consumers.length === 0 ? "Nenhum consumidor cadastrado." : "Nenhum resultado para os filtros."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <SortHeader label="Nome" active={sort.key === "name"} dir={sort.dir} onClick={() => toggleSort("name")} />
                    <SortHeader label="CPF/CNPJ" active={sort.key === "cpfCnpj"} dir={sort.dir} onClick={() => toggleSort("cpfCnpj")} />
                    <th className="text-left py-2 px-3 font-medium text-xs uppercase tracking-wide">Telefone</th>
                    <th className="text-left py-2 px-3 font-medium text-xs uppercase tracking-wide">Emails</th>
                    <SortHeader label="UCs" align="center" active={sort.key === "ucs"} dir={sort.dir} onClick={() => toggleSort("ucs")} />
                    <SortHeader label="Status" align="center" active={sort.key === "status"} dir={sort.dir} onClick={() => toggleSort("status")} />
                    <th className="text-center py-2 px-3 font-medium text-xs uppercase tracking-wide">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((consumer) => (
                    <tr key={consumer.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-3 font-medium">{consumer.name}</td>
                      <td className="py-2.5 px-3 text-muted-foreground">
                        {consumer.cpfCnpj ?? consumer.document ?? "-"}
                      </td>
                      <td className="py-2.5 px-3">{consumer.phone ?? "-"}</td>
                      <td className="py-2.5 px-3 text-xs text-muted-foreground max-w-[240px] truncate">
                        {consumer.emailsRecebimento ?? "-"}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <Badge variant="secondary">{consumer.consumerUnits.length}</Badge>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <Badge
                          variant={consumer.active ? "default" : "secondary"}
                          className={consumer.active ? "bg-emerald-500 hover:bg-emerald-600" : ""}
                        >
                          {consumer.active ? "Ativo" : "Inativo"}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <Link
                          href={`/admin/consumidores/${consumer.id}`}
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

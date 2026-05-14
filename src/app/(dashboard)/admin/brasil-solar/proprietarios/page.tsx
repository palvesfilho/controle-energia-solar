"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Plus,
  Upload,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ExternalLink,
  FileBarChart2,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface Proprietario {
  id: string;
  nome: string;
  cpfCnpj?: string | null;
  email?: string | null;
  telefone?: string | null;
  cidade?: string | null;
  uf?: string | null;
  createdAt: string;
  _count: { plantas: number };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function ProprietariosPage() {
  const [proprietarios, setProprietarios] = useState<Proprietario[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("nome");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchData = useCallback(async (page: number = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "50",
        orderBy: sortBy,
        order: sortOrder,
      });
      if (search) params.set("search", search);

      const res = await fetch(`/api/brasil-solar/proprietarios?${params}`);
      if (res.ok) {
        const data = await res.json();
        setProprietarios(data.proprietarios);
        setPagination(data.pagination);
      }
    } finally {
      setLoading(false);
    }
  }, [search, sortBy, sortOrder]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchData(1);
    }, search ? 400 : 0);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [fetchData, search]);

  function handleSort(field: string) {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
  }

  function SortHeader({ field, children }: { field: string; children: React.ReactNode }) {
    return (
      <th
        className="text-left py-2.5 px-3 font-medium cursor-pointer hover:text-foreground transition-colors select-none"
        onClick={() => handleSort(field)}
      >
        <span className="inline-flex items-center gap-1">
          {children}
          {sortBy === field && <ArrowUpDown className="h-3 w-3" />}
        </span>
      </th>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Proprietarios</h1>
          <p className="text-sm text-muted-foreground">
            Donos das usinas monitoradas pela Brasil Solar
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/brasil-solar/proprietarios/importar"
            className="flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg hover:bg-muted transition-colors"
          >
            <Upload className="h-4 w-4" />
            Importar
          </Link>
          <Link
            href="/admin/brasil-solar/proprietarios/novo"
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Novo Proprietario
          </Link>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar por nome, telefone, cidade..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-8 py-2 text-sm border rounded-lg bg-background"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              {pagination.total} proprietarios
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-xs">
                  <SortHeader field="nome">Nome</SortHeader>
                  <th className="text-left py-2.5 px-3 font-medium">Telefone</th>
                  <th className="text-left py-2.5 px-3 font-medium">Cidade/UF</th>
                  <th className="text-center py-2.5 px-3 font-medium">Usinas</th>
                  <th className="text-center py-2.5 px-3 font-medium">Ver Relatórios</th>
                  <th className="text-center py-2.5 px-3 font-medium w-10"></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} className="py-3 px-3">
                          <div className="h-4 bg-muted rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : proprietarios.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-muted-foreground">
                      Nenhum proprietario encontrado
                    </td>
                  </tr>
                ) : (
                  proprietarios.map((p) => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-3">
                        <Link
                          href={`/admin/brasil-solar/proprietarios/${p.id}`}
                          className="font-medium text-foreground hover:text-primary transition-colors"
                        >
                          {p.nome}
                        </Link>
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground">
                        {p.telefone || "-"}
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground">
                        {[p.cidade, p.uf].filter(Boolean).join("/") || "-"}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`text-xs font-medium ${p._count.plantas > 0 ? "text-primary" : "text-muted-foreground"}`}>
                          {p._count.plantas}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {p._count.plantas > 0 ? (
                          <Link
                            href={`/admin/brasil-solar/proprietarios/${p.id}/relatorios`}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors"
                          >
                            <FileBarChart2 className="h-3.5 w-3.5" />
                            Ver Relatórios
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <Link
                          href={`/admin/brasil-solar/proprietarios/${p.id}`}
                          className="text-muted-foreground hover:text-primary transition-colors"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-xs text-muted-foreground">
                Pagina {pagination.page} de {pagination.totalPages}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => fetchData(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  className="p-1.5 rounded hover:bg-muted disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                  let pageNum: number;
                  if (pagination.totalPages <= 5) pageNum = i + 1;
                  else if (pagination.page <= 3) pageNum = i + 1;
                  else if (pagination.page >= pagination.totalPages - 2) pageNum = pagination.totalPages - 4 + i;
                  else pageNum = pagination.page - 2 + i;
                  return (
                    <button
                      key={pageNum}
                      onClick={() => fetchData(pageNum)}
                      className={`px-2.5 py-1 text-xs rounded transition-colors ${
                        pageNum === pagination.page ? "bg-primary text-white" : "hover:bg-muted"
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                <button
                  onClick={() => fetchData(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages}
                  className="p-1.5 rounded hover:bg-muted disabled:opacity-30 transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

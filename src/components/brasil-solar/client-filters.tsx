"use client";

import { Search, Filter, X } from "lucide-react";
import { useState, useEffect } from "react";

/**
 * Quatro filtros, e só. Plataforma de monitoramento, contrato, UF e proprietário
 * saíram em 13/08/2026 a pedido do Paulo: ninguém busca planta por plataforma —
 * busca por marca de inversor — e a UF não separa nada porque a base inteira é
 * do RS. Os parâmetros continuam existindo na rota `/api/brasil-solar` (outras
 * telas usam `proprietarioId`); o que saiu foi o controle desta tela.
 */
interface FiltersState {
  search: string;
  status: string;
  marca: string;
  cidade: string;
}

/** Opção de dropdown vinda da base, com quantas usinas ela tem. */
interface Opcao {
  valor: string;
  label: string;
  count: number;
}

export function ClientFilters({
  filters,
  onChange,
  totalResults,
}: {
  filters: FiltersState;
  onChange: (filters: FiltersState) => void;
  totalResults: number;
}) {
  const [showFilters, setShowFilters] = useState(false);
  const [marcas, setMarcas] = useState<Opcao[]>([]);
  const [cidades, setCidades] = useState<Opcao[]>([]);

  // Marcas e cidades saem da base (ver /api/brasil-solar/filtros): lista fixa no
  // código oferecia marca que não existe e escondia marca nova.
  useEffect(() => {
    fetch("/api/brasil-solar/filtros")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        // `Array.isArray` e não `?? []`: dropdown que recebe o formato errado
        // tem que ficar vazio, não derrubar a tela — que foi o que o de
        // proprietários fazia, respondendo `{ proprietarios: [...] }` onde o
        // código esperava um array e estourando `.map is not a function`.
        setMarcas(Array.isArray(data.marcas) ? data.marcas : []);
        setCidades(Array.isArray(data.cidades) ? data.cidades : []);
      })
      .catch(() => {});
  }, []);

  const ativos = [filters.status, filters.marca, filters.cidade].filter(Boolean);
  const hasActiveFilters = ativos.length > 0;

  function set(campo: keyof FiltersState, valor: string) {
    onChange({ ...filters, [campo]: valor });
  }

  function clearFilters() {
    onChange({ search: filters.search, status: "", marca: "", cidade: "" });
  }

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={filters.search}
            onChange={(e) => set("search", e.target.value)}
            placeholder="Buscar por nome, CPF/CNPJ, email, UC ou cidade..."
            className="w-full pl-9 pr-4 py-2 text-sm border rounded-lg bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
          />
          {filters.search && (
            <button
              onClick={() => set("search", "")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg transition-colors ${
            hasActiveFilters
              ? "bg-primary/10 border-primary/30 text-primary"
              : "hover:bg-muted"
          }`}
        >
          <Filter className="h-4 w-4" />
          Filtros
          {hasActiveFilters && (
            <span className="bg-primary text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">
              {ativos.length}
            </span>
          )}
        </button>
      </div>

      {/* Painel de filtros */}
      {showFilters && (
        <div className="p-3 bg-muted/30 rounded-lg border space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Campo label="Nome do cliente">
              {/* Mesmo estado da barra de cima — digitar aqui reflete lá, para
                  não existirem duas buscas que discordam entre si. */}
              <div className="relative">
                <input
                  type="text"
                  value={filters.search}
                  onChange={(e) => set("search", e.target.value)}
                  placeholder="Nome do cliente ou proprietário"
                  className="w-full pr-7 text-sm border rounded-md px-2 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                />
                {filters.search && (
                  <button
                    onClick={() => set("search", "")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    title="Limpar"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </Campo>

            <Campo
              label="Marca do inversor"
              dica="Marca cadastrada; quando não há cadastro, a deduzida da plataforma de monitoramento — a mesma da tag ao lado do nome."
            >
              <Select value={filters.marca} onChange={(v) => set("marca", v)} placeholder="Todas as marcas">
                {marcas.map((m) => (
                  <option key={m.valor} value={m.valor}>
                    {m.label} ({m.count})
                  </option>
                ))}
              </Select>
            </Campo>

            <Campo
              label="Cidade"
              dica="As grafias da mesma cidade (caixa, acento, UF no nome) contam como uma só."
            >
              <Select value={filters.cidade} onChange={(v) => set("cidade", v)} placeholder="Todas as cidades">
                {cidades.map((c) => (
                  <option key={c.valor} value={c.valor}>
                    {c.label} ({c.count})
                  </option>
                ))}
              </Select>
            </Campo>

            <Campo label="Status">
              <Select value={filters.status} onChange={(v) => set("status", v)} placeholder="Todos os status">
                <option value="ONLINE">Online</option>
                <option value="OFFLINE">Offline</option>
                <option value="ALERTA">Alerta</option>
                <option value="SEM_DADOS">Sem dados</option>
              </Select>
            </Campo>

          </div>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3 w-3" />
              Limpar filtros
            </button>
          )}
        </div>
      )}

      {/* Result count */}
      <p className="text-xs text-muted-foreground">
        {totalResults.toLocaleString("pt-BR")} cliente{totalResults !== 1 ? "s" : ""} encontrado{totalResults !== 1 ? "s" : ""}
      </p>
    </div>
  );
}

function Campo({
  label,
  dica,
  children,
}: {
  label: string;
  dica?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1" title={dica}>
      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
      {children}
    </label>
  );
}

function Select({
  value,
  onChange,
  placeholder,
  children,
}: {
  value: string;
  onChange: (valor: string) => void;
  placeholder: string;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full text-sm border rounded-md px-2 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
    >
      <option value="">{placeholder}</option>
      {children}
    </select>
  );
}

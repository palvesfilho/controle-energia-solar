"use client";

import { Search, Filter, X } from "lucide-react";
import { useState, useEffect } from "react";

interface FiltersState {
  search: string;
  status: string;
  plataforma: string;
  uf: string;
  contrato: string;
  proprietario: string;
}

interface ProprietarioOption {
  id: string;
  nome: string;
}

const PLATAFORMAS = [
  "GROWATT", "SOLIS", "FRONIUS", "HUAWEI", "SOLAREDGE", "SUNGROW",
  "CANADIAN", "ABB", "DEYE", "HOYMILES", "GOODWE", "BYD", "ENPHASE",
  "SOFAR",
];

const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

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
  const [proprietarios, setProprietarios] = useState<ProprietarioOption[]>([]);

  useEffect(() => {
    fetch("/api/brasil-solar/proprietarios?all=true")
      .then((res) => res.ok ? res.json() : [])
      .then((data) => setProprietarios(data))
      .catch(() => {});
  }, []);

  const hasActiveFilters = filters.status || filters.plataforma || filters.uf || filters.contrato || filters.proprietario;

  function clearFilters() {
    onChange({ search: filters.search, status: "", plataforma: "", uf: "", contrato: "", proprietario: "" });
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
            onChange={(e) => onChange({ ...filters, search: e.target.value })}
            placeholder="Buscar por nome, CPF/CNPJ, email, UC ou cidade..."
            className="w-full pl-9 pr-4 py-2 text-sm border rounded-lg bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
          />
          {filters.search && (
            <button
              onClick={() => onChange({ ...filters, search: "" })}
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
              {[filters.status, filters.plataforma, filters.uf, filters.contrato, filters.proprietario].filter(Boolean).length}
            </span>
          )}
        </button>
      </div>

      {/* Filter dropdowns */}
      {showFilters && (
        <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/30 rounded-lg border">
          <select
            value={filters.status}
            onChange={(e) => onChange({ ...filters, status: e.target.value })}
            className="text-sm border rounded-md px-2 py-1.5 bg-background"
          >
            <option value="">Status</option>
            <option value="ONLINE">Online</option>
            <option value="OFFLINE">Offline</option>
            <option value="ALERTA">Alerta</option>
            <option value="SEM_DADOS">Sem dados</option>
          </select>

          <select
            value={filters.plataforma}
            onChange={(e) => onChange({ ...filters, plataforma: e.target.value })}
            className="text-sm border rounded-md px-2 py-1.5 bg-background"
          >
            <option value="">Plataforma</option>
            {PLATAFORMAS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>

          <select
            value={filters.uf}
            onChange={(e) => onChange({ ...filters, uf: e.target.value })}
            className="text-sm border rounded-md px-2 py-1.5 bg-background"
          >
            <option value="">UF</option>
            {UFS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>

          <select
            value={filters.contrato}
            onChange={(e) => onChange({ ...filters, contrato: e.target.value })}
            className="text-sm border rounded-md px-2 py-1.5 bg-background"
          >
            <option value="">Contrato</option>
            <option value="ATIVO">Ativo</option>
            <option value="SUSPENSO">Suspenso</option>
            <option value="CANCELADO">Cancelado</option>
            <option value="GARANTIA">Garantia</option>
          </select>

          <select
            value={filters.proprietario}
            onChange={(e) => onChange({ ...filters, proprietario: e.target.value })}
            className="text-sm border rounded-md px-2 py-1.5 bg-background max-w-[200px]"
          >
            <option value="">Proprietario</option>
            <option value="SEM_PROPRIETARIO">Sem proprietario</option>
            {proprietarios.map((p) => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>

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

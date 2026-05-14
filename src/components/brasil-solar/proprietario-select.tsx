"use client";

import { useEffect, useState, useRef } from "react";
import { ChevronDown, X, Search, Loader2 } from "lucide-react";

interface Proprietario {
  id: string;
  nome: string;
  cpfCnpj?: string | null;
}

interface ProprietarioSelectProps {
  value: string | null;
  onChange: (id: string | null) => void;
  label?: string;
}

export function ProprietarioSelect({ value, onChange, label = "Proprietario" }: ProprietarioSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<Proprietario[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Proprietario | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Carregar todas as opcoes (lista leve: id + nome + cpfCnpj)
  useEffect(() => {
    setLoading(true);
    fetch("/api/brasil-solar/proprietarios?all=true")
      .then((res) => res.json())
      .then((data) => {
        setOptions(data.proprietarios || []);
        if (value) {
          const found = (data.proprietarios || []).find((p: Proprietario) => p.id === value);
          if (found) setSelected(found);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [value]);

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filtered = search
    ? options.filter(
        (p) =>
          p.nome.toLowerCase().includes(search.toLowerCase()) ||
          (p.cpfCnpj && p.cpfCnpj.includes(search))
      )
    : options;

  function handleSelect(p: Proprietario) {
    setSelected(p);
    onChange(p.id);
    setOpen(false);
    setSearch("");
  }

  function handleClear() {
    setSelected(null);
    onChange(null);
    setSearch("");
  }

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      <div ref={containerRef} className="relative">
        {/* Trigger */}
        <button
          type="button"
          onClick={() => {
            setOpen(!open);
            if (!open) setTimeout(() => inputRef.current?.focus(), 50);
          }}
          className="flex items-center justify-between w-full px-3 py-2 text-sm border rounded-lg bg-background hover:bg-muted/50 transition-colors text-left"
        >
          <span className={selected ? "text-foreground" : "text-muted-foreground"}>
            {loading ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Carregando...
              </span>
            ) : selected ? (
              <span>
                {selected.nome}
                {selected.cpfCnpj && (
                  <span className="text-xs text-muted-foreground ml-1.5">({selected.cpfCnpj})</span>
                )}
              </span>
            ) : (
              "Selecionar proprietario..."
            )}
          </span>
          <span className="flex items-center gap-1">
            {selected && (
              <span
                role="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleClear();
                }}
                className="p-0.5 hover:bg-muted rounded"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </span>
            )}
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </span>
        </button>

        {/* Dropdown */}
        {open && (
          <div className="absolute z-50 mt-1 w-full bg-background border rounded-lg shadow-lg">
            {/* Search */}
            <div className="flex items-center gap-2 px-3 py-2 border-b">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Buscar por nome ou CPF/CNPJ..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 text-sm bg-transparent outline-none"
              />
            </div>

            {/* Options */}
            <div className="max-h-60 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="px-3 py-4 text-sm text-center text-muted-foreground">
                  Nenhum proprietario encontrado
                </div>
              ) : (
                filtered.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelect(p)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors ${
                      value === p.id ? "bg-primary/10 text-primary" : ""
                    }`}
                  >
                    <span className="font-medium">{p.nome}</span>
                    {p.cpfCnpj && (
                      <span className="text-xs text-muted-foreground ml-1.5">{p.cpfCnpj}</span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

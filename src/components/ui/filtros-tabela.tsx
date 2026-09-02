"use client";

import { ReactNode } from "react";
import { Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { FiltroTabela } from "@/lib/filtro-tabela";
import { ExportarTabela } from "@/components/ui/exportar-tabela";

type Props<T> = {
  filtro: FiltroTabela<T>;
  placeholder?: string;
  /** Ligar o botão Exportar: `data-tabela` da tabela e nome do arquivo. */
  exportar?: { tabela: string; nome: string; aba?: string };
  /** Palavra do contador: "3 de 40 usinas". */
  substantivo?: string;
  /** Controles próprios da tela (abas, competência) à direita da busca. */
  children?: ReactNode;
  className?: string;
};

const CLASSE_SELECT =
  "text-sm border rounded-lg px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none max-w-[220px]";

/**
 * Barra de filtro padrão das tabelas: busca livre, um seletor por faceta,
 * contador e o botão Exportar.
 *
 * Os controles são `<input>`/`<select>` nativos e não os do shadcn de propósito
 * — é o que as telas do sistema já usam, e o `<select>` nativo aguenta as
 * centenas de usinas sem virar lista virtualizada.
 */
export function FiltrosTabela<T>({
  filtro,
  placeholder = "Buscar...",
  exportar,
  substantivo,
  children,
  className,
}: Props<T>) {
  const { busca, setBusca, facetas, selecionados, setFaceta, opcoes, limpar, ativos } = filtro;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="relative flex-1 min-w-[220px]">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-8 pr-3 py-1.5 text-sm border rounded-lg bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
        />
      </div>

      {facetas.map((f) => {
        const lista = opcoes[f.chave] ?? [];
        // Faceta de uma opção só não filtra nada — esconder evita poluir a
        // barra em tela de detalhe (uma usina, uma concessionária).
        if (lista.length < 2 && !selecionados[f.chave]) return null;
        return (
          <select
            key={f.chave}
            value={selecionados[f.chave] ?? ""}
            onChange={(e) => setFaceta(f.chave, e.target.value)}
            aria-label={f.label}
            title={f.label}
            className={cn(CLASSE_SELECT, selecionados[f.chave] && "border-primary text-primary")}
          >
            <option value="">{f.labelTodos ?? `Todas — ${f.label}`}</option>
            {lista.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        );
      })}

      {children}

      {ativos > 0 && (
        <button
          type="button"
          onClick={limpar}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          title="Limpar filtros"
        >
          <X className="h-3.5 w-3.5" />
          Limpar
        </button>
      )}

      <div className="ml-auto flex items-center gap-2">
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {filtro.filtrados.length} de {filtro.total}
          {substantivo ? ` ${substantivo}` : ""}
        </span>
        {exportar && (
          <ExportarTabela tabela={exportar.tabela} nome={exportar.nome} aba={exportar.aba} />
        )}
      </div>
    </div>
  );
}

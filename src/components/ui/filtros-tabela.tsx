"use client";

import { ReactNode } from "react";
import { Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { FiltroTabela } from "@/lib/filtro-tabela";
import { ExportarTabela } from "@/components/ui/exportar-tabela";
import { FiltroColuna } from "@/components/ui/filtro-coluna";

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

/**
 * Barra da tabela: busca livre, contador, "Limpar" e o botão Exportar.
 *
 * Os filtros por coluna NÃO moram aqui — cada um vive no funil do próprio
 * cabeçalho (`<FiltroColuna>`). Enquanto eram uma lista à parte nesta barra,
 * coluna nova nascia sem filtro e ninguém percebia: foi assim que "Consumidor"
 * e "1ª compensação" ficaram de fora sem dar sinal.
 */
export function FiltrosTabela<T>({
  filtro,
  placeholder = "Buscar...",
  exportar,
  substantivo,
  children,
  className,
}: Props<T>) {
  const { busca, setBusca, limpar, ativos } = filtro;

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

      {/* Facetas sem coluna na tabela: o funil delas mora aqui, com o rótulo à
          vista, porque não há cabeçalho onde encostar. */}
      {filtro.facetas
        .filter((f) => f.semColuna)
        .map((f) => (
          <span
            key={f.chave}
            className="inline-flex items-center gap-0.5 rounded-lg border px-2 py-1 text-xs text-muted-foreground"
          >
            {f.label}
            <FiltroColuna filtro={filtro} chave={f.chave} />
          </span>
        ))}

      {children}

      {ativos > 0 && (
        <button
          type="button"
          onClick={limpar}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          title="Limpar a busca e todos os filtros de coluna"
        >
          <X className="h-3.5 w-3.5" />
          Limpar filtros
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

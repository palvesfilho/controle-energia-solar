"use client";

import { useMemo, useState } from "react";
import { Check, Filter, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { normalizeBusca } from "@/lib/busca";
import type { FiltroTabela } from "@/lib/filtro-tabela";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type Props<T> = {
  filtro: FiltroTabela<T>;
  /** `chave` da faceta desta coluna. */
  chave: string;
};

/**
 * Funil de filtro dentro do cabeçalho da coluna, no modelo do autofiltro do
 * Excel: abre a lista de valores que a coluna tem e o operador marca os que quer.
 *
 * Mora no `<th>` de propósito. A barra de seletores que existia antes tinha um
 * defeito estrutural: era uma lista à parte, então coluna nova nascia sem filtro
 * e ninguém percebia — foi assim que "Consumidor" e "1ª compensação" ficaram de
 * fora. Aqui o filtro nasce da coluna.
 */
export function FiltroColuna<T>({ filtro, chave }: Props<T>) {
  const [busca, setBusca] = useState("");
  // O `?? []` cria um array novo a cada render quando a coluna ainda não tem
  // opções; memorizar aqui é o que mantém o filtro da lista estável.
  const opcoes = useMemo(() => filtro.opcoes[chave] ?? [], [filtro.opcoes, chave]);
  const marcados = filtro.selecionados[chave] ?? [];
  const ativo = marcados.length > 0;

  const visiveis = useMemo(() => {
    const termo = normalizeBusca(busca.trim());
    if (!termo) return opcoes;
    return opcoes.filter((o) => normalizeBusca(o).includes(termo));
  }, [opcoes, busca]);

  // Coluna sem nenhum valor (todas as linhas em branco) não tem o que filtrar.
  // Coluna com UM valor só continua com funil: o operador precisa enxergar que
  // o filtro existe ali, mesmo que a base do momento só tenha uma opção.
  if (opcoes.length === 0 && !ativo) return null;

  const todosVisiveisMarcados =
    visiveis.length > 0 && visiveis.every((o) => marcados.includes(o));

  return (
    <Popover>
      <PopoverTrigger
        render={<button type="button" />}
        className={cn(
          "ml-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded align-middle transition-colors",
          ativo
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground/50 hover:bg-muted hover:text-foreground",
        )}
        title={
          ativo
            ? `Filtrando por ${marcados.length} valor(es). Clique para mudar.`
            : "Filtrar por esta coluna"
        }
        aria-label="Filtrar por esta coluna"
      >
        <Filter className={cn("h-3 w-3", ativo && "fill-current")} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 gap-2 p-2 normal-case">
        {opcoes.length > 8 && (
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar valor..."
              className="w-full rounded-md border bg-background py-1 pl-7 pr-2 text-xs font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
        )}

        <div className="flex items-center justify-between px-0.5 text-[11px] font-normal text-muted-foreground">
          <button
            type="button"
            onClick={() =>
              filtro.definirValores(
                chave,
                todosVisiveisMarcados
                  ? marcados.filter((m) => !visiveis.includes(m))
                  : Array.from(new Set([...marcados, ...visiveis])),
              )
            }
            className="hover:text-foreground transition-colors"
          >
            {todosVisiveisMarcados ? "Desmarcar todos" : "Selecionar todos"}
          </button>
          {ativo && (
            <button
              type="button"
              onClick={() => filtro.definirValores(chave, [])}
              className="hover:text-foreground transition-colors"
            >
              Limpar
            </button>
          )}
        </div>

        <div className="max-h-64 overflow-y-auto">
          {visiveis.length === 0 ? (
            <p className="px-1 py-3 text-center text-xs font-normal text-muted-foreground">
              Nenhum valor encontrado.
            </p>
          ) : (
            visiveis.map((opcao) => {
              const marcado = marcados.includes(opcao);
              return (
                <button
                  key={opcao}
                  type="button"
                  onClick={() => filtro.alternarValor(chave, opcao)}
                  className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-xs font-normal hover:bg-muted transition-colors"
                >
                  <span
                    className={cn(
                      "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border",
                      marcado
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/40",
                    )}
                  >
                    {marcado && <Check className="h-2.5 w-2.5" />}
                  </span>
                  <span className="truncate" title={opcao}>
                    {opcao}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

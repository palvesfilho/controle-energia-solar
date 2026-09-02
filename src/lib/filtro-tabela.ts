"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { matchBusca } from "@/lib/busca";

/**
 * Filtro padrão das tabelas: busca livre + facetas (usina, concessionária,
 * status, ...).
 *
 * O filtro é do NAVEGADOR, não da API. As listas do sistema vêm inteiras para a
 * tela (não há paginação no servidor), então filtrar aqui é imediato, não gasta
 * consulta, e — o que importa mais — mantém o botão Exportar coerente: o que
 * está na tela é o que sai no arquivo.
 */

export type Faceta<T> = {
  /** Chave curta; vira o nome do parâmetro na URL. */
  chave: string;
  /** Rótulo do seletor: "Usina", "Concessionária". */
  label: string;
  /**
   * Valor da linha para esta faceta. `null`/vazio significa "sem valor" — a
   * linha só some se a faceta estiver selecionada em algo.
   *
   * Pode devolver uma LISTA quando a linha pertence a mais de um valor (um
   * investidor com várias usinas, por exemplo): aí ela aparece em qualquer um
   * deles, que é o que o operador espera ao filtrar por uma usina só.
   */
  valor: (item: T) => string | string[] | null | undefined;
  /** Ordenação das opções. Padrão: alfabética pt-BR. */
  ordenar?: (a: string, b: string) => number;
  /** Rótulo da opção "todos". Padrão: "Todas as <label minúsculo>". */
  labelTodos?: string;
};

export type ConfigFiltro<T> = {
  /** Campos que a busca livre varre. */
  busca?: (item: T) => Array<string | null | undefined>;
  facetas?: Faceta<T>[];
  /**
   * Grava busca e facetas na URL, para o link ser compartilhável e o botão
   * voltar do navegador funcionar. Fica desligado por padrão porque algumas
   * telas já usam a query string para outra coisa (aba, competência) e não
   * devem ganhar parâmetros sem querer.
   */
  sincronizarUrl?: boolean;
  /** Prefixo dos parâmetros na URL, quando a tela tem mais de uma tabela. */
  prefixoUrl?: string;
};

export type FiltroTabela<T> = {
  /** As linhas que sobraram — é isso que a tela renderiza. */
  filtrados: T[];
  busca: string;
  setBusca: (v: string) => void;
  /** Valor selecionado por faceta (string vazia = todas). */
  selecionados: Record<string, string>;
  setFaceta: (chave: string, valor: string) => void;
  /** Opções de cada faceta, já cruzadas com as demais facetas selecionadas. */
  opcoes: Record<string, string[]>;
  facetas: Faceta<T>[];
  limpar: () => void;
  /** Quantos critérios estão ativos — serve para mostrar o botão "Limpar". */
  ativos: number;
  total: number;
};

const colator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

/** Deixa todo valor de faceta na mesma forma: lista de textos não vazios. */
function valores(v: string | string[] | null | undefined): string[] {
  if (v == null) return [];
  const lista = Array.isArray(v) ? v : [v];
  return lista.map((s) => (s ?? "").trim()).filter((s) => s !== "");
}

export function useFiltroTabela<T>(dados: T[], config: ConfigFiltro<T>): FiltroTabela<T> {
  const facetas = useMemo(() => config.facetas ?? [], [config.facetas]);
  const prefixo = config.prefixoUrl ?? "";
  const sincronizar = config.sincronizarUrl === true;

  const router = useRouter();

  const param = useCallback((chave: string) => `${prefixo}${chave}`, [prefixo]);

  const [busca, setBuscaState] = useState("");
  const [selecionados, setSelecionados] = useState<Record<string, string>>({});

  /**
   * A URL é lida uma vez, na montagem, e via `window.location` — não pelo
   * `useSearchParams`.
   *
   * Dois motivos. O `useSearchParams` obrigaria TODA tela com tabela a ganhar
   * uma fronteira de `<Suspense>` para a pré-renderização passar, o que é muito
   * peso para um filtro. E ler no primeiro render faria o servidor desenhar a
   * lista inteira e o cliente desenhar a filtrada — divergência de hidratação.
   * Lendo depois de montar, o estado inicial é igual dos dois lados.
   *
   * Depois desta leitura o estado local manda; mudança de URL feita por fora
   * (o link do sino, por exemplo) não volta para cá, e é isso que evita o
   * vaivém entre efeito que escreve a URL e URL que reescreve o estado.
   */
  const leu = useRef(false);
  useEffect(() => {
    leu.current = true;
    if (!sincronizar) return;
    const atual = new URLSearchParams(window.location.search);
    const q = atual.get(param("q")) ?? "";
    if (q) setBuscaState(q);
    const daUrl: Record<string, string> = {};
    for (const f of facetas) {
      const v = atual.get(param(f.chave));
      if (v) daUrl[f.chave] = v;
    }
    if (Object.keys(daUrl).length > 0) {
      setSelecionados((s) => ({ ...s, ...daUrl }));
    }
    // Só na montagem: reler depois desfaria o que o operador acabou de escolher.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A URL é escrita depois da renderização, e só quando muda de verdade.
  const ultimaUrl = useRef<string | null>(null);
  useEffect(() => {
    // Antes da leitura inicial, escrever apagaria os parâmetros que vieram no
    // link — o estado ainda está vazio.
    if (!sincronizar || !leu.current) return;
    const params = new URLSearchParams(window.location.search);
    if (busca) params.set(param("q"), busca);
    else params.delete(param("q"));
    for (const f of facetas) {
      const v = selecionados[f.chave];
      if (v) params.set(param(f.chave), v);
      else params.delete(param(f.chave));
    }
    const qs = params.toString();
    const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    if (ultimaUrl.current === url) return;
    ultimaUrl.current = url;
    router.replace(url, { scroll: false });
  }, [busca, selecionados, facetas, router, sincronizar, param]);

  const setBusca = useCallback((v: string) => setBuscaState(v), []);

  const setFaceta = useCallback((chave: string, valor: string) => {
    setSelecionados((atual) => ({ ...atual, [chave]: valor }));
  }, []);

  const limpar = useCallback(() => {
    setBuscaState("");
    setSelecionados({});
  }, []);

  const passaNasFacetas = useCallback(
    (item: T, exceto?: string) => {
      for (const f of facetas) {
        if (f.chave === exceto) continue;
        const escolhido = selecionados[f.chave] ?? "";
        if (!escolhido) continue;
        if (!valores(f.valor(item)).includes(escolhido)) return false;
      }
      return true;
    },
    [facetas, selecionados],
  );

  // A tela declara `busca` como arrow no corpo do componente, então a função é
  // outra a cada render. Guardar em ref mantém o `useMemo` do filtro estável e
  // evita refiltrar a lista inteira a cada tecla digitada em outro campo.
  const buscaFn = useRef(config.busca);
  buscaFn.current = config.busca;

  const passaNaBusca = useCallback(
    (item: T) => (buscaFn.current ? matchBusca(busca, buscaFn.current(item)) : true),
    [busca],
  );

  const filtrados = useMemo(
    () => dados.filter((item) => passaNaBusca(item) && passaNasFacetas(item)),
    [dados, passaNaBusca, passaNasFacetas],
  );

  /**
   * As opções de cada faceta saem do dado já filtrado pelas OUTRAS facetas e
   * pela busca. Assim o seletor de concessionária de uma usina escolhida só
   * oferece o que existe naquela usina, em vez de oferecer combinações que
   * devolvem tabela vazia.
   */
  const opcoes = useMemo(() => {
    const mapa: Record<string, string[]> = {};
    for (const f of facetas) {
      const vistos = new Set<string>();
      for (const item of dados) {
        if (!passaNaBusca(item)) continue;
        if (!passaNasFacetas(item, f.chave)) continue;
        for (const v of valores(f.valor(item))) vistos.add(v);
      }
      // O que já está selecionado nunca some da lista, senão o seletor mostraria
      // vazio no próprio valor escolhido.
      const atual = selecionados[f.chave] ?? "";
      if (atual) vistos.add(atual);
      mapa[f.chave] = Array.from(vistos).sort(f.ordenar ?? colator.compare);
    }
    return mapa;
  }, [dados, facetas, passaNaBusca, passaNasFacetas, selecionados]);

  const ativos =
    (busca ? 1 : 0) + facetas.filter((f) => Boolean(selecionados[f.chave])).length;

  return {
    filtrados,
    busca,
    setBusca,
    selecionados,
    setFaceta,
    opcoes,
    facetas,
    limpar,
    ativos,
    total: dados.length,
  };
}

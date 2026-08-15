"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CIDADES_RS } from "@/lib/cidades-rs";

/**
 * Escolha de cidade com autocomplete — porte do `CidadeRSInput` do
 * GERADOR_PROPOSTA para o Gestor.
 *
 * Diferenças em relação ao original, e por quê:
 *
 *  - Lista COM acentuação (`@/lib/cidades-rs`, gerada do IBGE). O Gerador usa a
 *    mesma lista sem acento; aqui o resto do sistema escreve em pt-BR acentuado.
 *    A busca normaliza, então "bage" continua achando "Bagé" e "sant ana" acha
 *    "Sant'Ana do Livramento".
 *
 *  - NÃO é controlado pelo pai. Os formulários de usina e de investidor são
 *    todos `FormData` + `Object.fromEntries`, sem estado por campo; um input com
 *    `name` entra na submissão sozinho. Manter o padrão evita ter que converter
 *    os formulários inteiros para controlados só por causa da cidade.
 *
 *  - O campo continua aceitando texto digitado que não esteja na lista, de
 *    propósito. O cadastro precisa poder salvar mesmo com cidade fora do RS ou
 *    com grafia que o operador saiba estar certa — a lista guia, não trava.
 */
const normalizar = (s: string) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’\-]/g, "")
    .toLowerCase()
    .trim();

export function CidadeInput({
  label,
  name,
  defaultValue,
  required,
  className,
  placeholder = "Digite para buscar...",
  maxSugestoes = 8,
  cidades = CIDADES_RS,
}: {
  label?: string;
  name: string;
  defaultValue?: string | null;
  required?: boolean;
  className?: string;
  placeholder?: string;
  maxSugestoes?: number;
  cidades?: string[];
}) {
  const [valor, setValor] = useState(defaultValue ?? "");
  const [aberto, setAberto] = useState(false);
  const [indice, setIndice] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const lista = useMemo(
    () => cidades.map((c) => ({ nome: c, normalizado: normalizar(c) })),
    [cidades],
  );

  const sugestoes = useMemo(() => {
    const q = normalizar(valor);
    if (!q) return lista.slice(0, maxSugestoes);
    // `startsWith` primeiro: quem digita "santa" quer Santa Maria antes de
    // "Nova Santa Rita".
    const comeca = lista.filter((c) => c.normalizado.startsWith(q));
    const contem = lista.filter((c) => !c.normalizado.startsWith(q) && c.normalizado.includes(q));
    return [...comeca, ...contem].slice(0, maxSugestoes);
  }, [valor, lista, maxSugestoes]);

  useEffect(() => setIndice(0), [valor]);

  useEffect(() => {
    const fechar = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAberto(false);
      }
    };
    document.addEventListener("mousedown", fechar);
    return () => document.removeEventListener("mousedown", fechar);
  }, []);

  function selecionar(cidade: string) {
    setValor(cidade);
    setAberto(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!aberto && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setAberto(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndice((i) => Math.min(i + 1, sugestoes.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndice((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && aberto && sugestoes[indice]) {
      // Só engole o Enter com a lista ABERTA — fechada, ele tem que submeter o
      // formulário como em qualquer outro campo.
      e.preventDefault();
      selecionar(sugestoes[indice].nome);
    } else if (e.key === "Escape") {
      setAberto(false);
    }
  }

  const naLista = !valor || lista.some((c) => c.normalizado === normalizar(valor));

  return (
    <div className={className}>
      {label && (
        <label className="text-xs font-medium text-muted-foreground">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <div className="relative" ref={containerRef}>
        <input
          name={name}
          required={required}
          value={valor}
          onChange={(e) => {
            setValor(e.target.value);
            setAberto(true);
          }}
          onFocus={() => setAberto(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          className="w-full mt-1 text-sm border rounded-md px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
        />
        {aberto && sugestoes.length > 0 && (
          <ul className="absolute z-30 left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg max-h-72 overflow-auto">
            {sugestoes.map((c, i) => (
              <li
                key={c.nome}
                onMouseDown={(e) => {
                  // mousedown em vez de click: o blur do input fecharia a lista
                  // antes do click chegar.
                  e.preventDefault();
                  selecionar(c.nome);
                }}
                onMouseEnter={() => setIndice(i)}
                className={`px-3 py-1.5 cursor-pointer text-sm ${
                  i === indice ? "bg-primary/10 text-primary" : "hover:bg-muted"
                }`}
              >
                {c.nome}
              </li>
            ))}
          </ul>
        )}
      </div>
      {!naLista && (
        <span className="block text-[11px] text-amber-600 dark:text-amber-500 mt-1">
          Não é um município do RS — será salvo assim mesmo.
        </span>
      )}
    </div>
  );
}

"use client";

import { marcaInversor, type MarcaInversorInput } from "@/lib/marca-inversor";

/**
 * Tag da marca do inversor, ao lado do nome do cliente/proprietário.
 *
 * A COR identifica o fabricante (varredura visual da lista) e o PREENCHIMENTO
 * carrega a confiança, que é o ponto da regra híbrida:
 *   sólida   → marca declarada no cadastro
 *   contorno → derivada da plataforma de monitoramento (não foi declarada)
 *   âmbar ⚠  → declarada e plataforma discordam (a cor de aviso vence a da marca)
 *
 * Sem marca nenhuma não renderiza nada — tag vazia polui a lista sem informar.
 */

/**
 * Paleta por fabricante. A chave é a grafia canônica que `marcaInversor` devolve
 * (`CANONICO` em @/lib/marca-inversor), então "SOLAREDGE" e "SolarEdge" caem no
 * mesmo lugar. Marca fora desta tabela cai no estilo neutro de antes — não é
 * erro, só não tem cor própria definida.
 */
const CORES_MARCA: Record<string, { solida: string; contorno: string }> = {
  Growatt: {
    solida: "bg-emerald-500/15 text-emerald-700 border border-transparent dark:text-emerald-300",
    contorno: "text-emerald-700 border border-emerald-300 dark:text-emerald-300 dark:border-emerald-800",
  },
  Fronius: {
    solida: "bg-red-500/15 text-red-700 border border-transparent dark:text-red-300",
    contorno: "text-red-700 border border-red-300 dark:text-red-300 dark:border-red-800",
  },
  Sungrow: {
    solida: "bg-orange-500/15 text-orange-700 border border-transparent dark:text-orange-300",
    contorno: "text-orange-700 border border-orange-300 dark:text-orange-300 dark:border-orange-800",
  },
  Huawei: {
    solida: "bg-neutral-500/15 text-neutral-700 border border-transparent dark:text-neutral-300",
    contorno: "text-neutral-700 border border-neutral-300 dark:text-neutral-300 dark:border-neutral-700",
  },
  // SolarEdge é a única com letra preta fixa: por isso mantém fundo claro também
  // no tema escuro (preto sobre fundo escuro ficaria ilegível). A origem
  // "plataforma" é marcada pelo tracejado, não pela ausência de fundo.
  SolarEdge: {
    solida: "bg-neutral-100 text-black border border-neutral-300",
    contorno: "bg-neutral-100 text-black border border-dashed border-neutral-400",
  },
};

export function InversorTag({
  className = "",
  ...input
}: MarcaInversorInput & { className?: string }) {
  const { marca, fonte, divergente, divergenciaDetalhe } = marcaInversor(input);
  if (!marca) return null;

  const base =
    "inline-flex items-center gap-1 rounded-full px-1.5 py-0 text-[10px] font-medium leading-4 whitespace-nowrap align-middle";

  const cores = CORES_MARCA[marca];

  const estilo = divergente
    ? "bg-amber-50 text-amber-800 border border-amber-300 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800"
    : fonte === "DECLARADA"
      ? (cores?.solida ?? "bg-primary/10 text-primary border border-transparent")
      : (cores?.contorno ?? "text-muted-foreground border border-border");

  const titulo = divergente
    ? divergenciaDetalhe
    : fonte === "DECLARADA"
      ? `Inversor ${marca} (cadastrado)`
      : `Inversor ${marca} (deduzido da plataforma de monitoramento — não confirmado no cadastro)`;

  return (
    <span className={`${base} ${estilo} ${className}`} title={titulo}>
      {marca}
      {divergente && <span aria-hidden>⚠</span>}
    </span>
  );
}

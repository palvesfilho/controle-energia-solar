"use client";

import { marcaInversor, type MarcaInversorInput } from "@/lib/marca-inversor";

/**
 * Tag da marca do inversor, ao lado do nome do cliente/proprietário.
 *
 * O estilo carrega a informação de CONFIANÇA, que é o ponto da regra híbrida:
 *   sólida   → marca declarada no cadastro
 *   contorno → derivada da plataforma de monitoramento (não foi declarada)
 *   âmbar ⚠  → declarada e plataforma discordam
 *
 * Sem marca nenhuma não renderiza nada — tag vazia polui a lista sem informar.
 */
export function InversorTag({
  className = "",
  ...input
}: MarcaInversorInput & { className?: string }) {
  const { marca, fonte, divergente, divergenciaDetalhe } = marcaInversor(input);
  if (!marca) return null;

  const base =
    "inline-flex items-center gap-1 rounded-full px-1.5 py-0 text-[10px] font-medium leading-4 whitespace-nowrap align-middle";

  const estilo = divergente
    ? "bg-amber-50 text-amber-800 border border-amber-300 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800"
    : fonte === "DECLARADA"
      ? "bg-primary/10 text-primary border border-transparent"
      : "text-muted-foreground border border-border";

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

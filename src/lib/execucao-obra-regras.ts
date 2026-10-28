/**
 * Regras puras do teto de execução — sem Prisma, para a tela (client
 * component) poder usar. O cálculo por obra está em lib/execucao-obra.ts.
 */

export type UnidadeExecucao = "PLACA" | "M2";

/** Produtos com teto por unidade e de onde sai a quantidade na proposta. */
export const UNIDADE_EXECUCAO_POR_PRODUTO: Record<string, UnidadeExecucao> = {
  solar_fotovoltaica: "PLACA",
  piso_aquecido: "M2",
};

export const ROTULO_UNIDADE: Record<UnidadeExecucao, { singular: string; plural: string }> = {
  PLACA: { singular: "placa", plural: "placas" },
  M2: { singular: "m²", plural: "m²" },
};

/** Recorte do snapshot da proposta que carrega a quantidade. */
export interface QuantidadesDaProposta {
  qtd_modulos?: unknown;
  area_piso_m2?: unknown;
}

function numeroPositivo(valor: unknown): number | null {
  const n = typeof valor === "string" ? Number(valor.replace(",", ".")) : Number(valor);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Quantidade vendida, na unidade do produto. Null quando o produto não tem
 * teto por unidade ou a proposta não traz o número — nunca um chute.
 */
export function quantidadeExecucao(
  codigoProduto: string,
  proposta: QuantidadesDaProposta,
): { quantidade: number; unidade: UnidadeExecucao } | null {
  const unidade = UNIDADE_EXECUCAO_POR_PRODUTO[codigoProduto];
  if (!unidade) return null;
  const quantidade = numeroPositivo(
    unidade === "PLACA" ? proposta.qtd_modulos : proposta.area_piso_m2,
  );
  return quantidade == null ? null : { quantidade, unidade };
}

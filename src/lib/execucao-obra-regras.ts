/**
 * Regras puras do teto de execução — sem Prisma, para a tela (client
 * component) poder usar. O cálculo por obra está em lib/execucao-obra.ts.
 */

export type UnidadeExecucao = "PLACA" | "M2";

/** Recorte do snapshot da proposta que carrega a quantidade. */
export interface QuantidadesDaProposta {
  qtd_modulos?: unknown;
  area_piso_m2?: unknown;
  paineis_inspecao?: unknown;
}

/** Produtos com teto por unidade e de onde sai a quantidade na proposta. */
const REGRA_POR_PRODUTO: Record<
  string,
  { unidade: UnidadeExecucao; campo: keyof QuantidadesDaProposta }
> = {
  solar_fotovoltaica: { unidade: "PLACA", campo: "qtd_modulos" },
  piso_aquecido: { unidade: "M2", campo: "area_piso_m2" },
  // Painéis REAIS (`quantidade_paineis`), não os cobrados: `paineis_cobrados`
  // arredonda para cima (mínimo 10, sempre par) e diverge em metade das
  // propostas — a equipe inspeciona o que existe no telhado.
  inspecao_completa: { unidade: "PLACA", campo: "paineis_inspecao" },
};

export const UNIDADE_EXECUCAO_POR_PRODUTO: Record<string, UnidadeExecucao> = Object.fromEntries(
  Object.entries(REGRA_POR_PRODUTO).map(([codigo, r]) => [codigo, r.unidade]),
);

export const ROTULO_UNIDADE: Record<UnidadeExecucao, { singular: string; plural: string }> = {
  PLACA: { singular: "placa", plural: "placas" },
  M2: { singular: "m²", plural: "m²" },
};

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
  const regra = REGRA_POR_PRODUTO[codigoProduto];
  if (!regra) return null;
  const quantidade = numeroPositivo(proposta[regra.campo]);
  return quantidade == null ? null : { quantidade, unidade: regra.unidade };
}

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
  /** Itens da proposta avulsa; na ampliação, as placas são os itens de módulo. */
  itens_avulsos?: unknown;
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
  // Ampliação é proposta avulsa: não há `sistema_projetado`, as placas são a
  // soma dos itens de origem "modulo" (Paulo, 28/10/2026: mesmo cálculo da FV).
  ampliacao_fv: { unidade: "PLACA", campo: "itens_avulsos" },
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
  const quantidade =
    regra.campo === "itens_avulsos"
      ? placasDosItensAvulsos(proposta.itens_avulsos)
      : numeroPositivo(proposta[regra.campo]);
  return quantidade == null ? null : { quantidade, unidade: regra.unidade };
}

/**
 * Placas de uma proposta avulsa: soma da quantidade dos itens de módulo.
 *
 * Se algum item de módulo vier sem quantidade (propostas antigas guardavam só
 * o valor), devolve null — somar só os que têm daria um teto menor que o
 * vendido. Também null quando não há item de módulo nenhum.
 */
function placasDosItensAvulsos(itens: unknown): number | null {
  if (!Array.isArray(itens)) return null;
  const modulos = itens.filter(
    (i): i is { quantidade?: unknown } =>
      typeof i === "object" && i != null && (i as { origem?: unknown }).origem === "modulo",
  );
  if (modulos.length === 0) return null;
  let total = 0;
  for (const m of modulos) {
    const q = numeroPositivo(m.quantidade);
    if (q == null) return null;
    total += q;
  }
  return total;
}

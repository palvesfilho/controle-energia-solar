/**
 * Parsing e filtragem de `ConsumerBill.injetadaDetalhes` (campo JSON serializado).
 *
 * O PDF da concessionária discrimina cada kWh compensado por mês de origem
 * (mês em que aquele crédito foi gerado pela usina-fonte). Permite separar:
 *   - Créditos da plant atual (se mesOrigem ∈ meses em que a plant injetou)
 *   - Créditos legados (de fontes anteriores, antes da plant entrar)
 */

export interface DetalheItem {
  mesOrigem: string; // "ABR/25", "FEV/26"
  teKwh?: number;
  tusdKwh?: number;
}

export interface DetalheParsed {
  ano: number;
  mes: number;
  kwh: number;
}

const MESES_PT: Record<string, number> = {
  JAN: 1, FEV: 2, MAR: 3, ABR: 4, MAI: 5, JUN: 6,
  JUL: 7, AGO: 8, SET: 9, OUT: 10, NOV: 11, DEZ: 12,
};

/** Parse "ABR/25" → { ano: 2025, mes: 4 }. Retorna null se inválido. */
export function parseMesOrigem(s: string): { ano: number; mes: number } | null {
  const m = /^([A-Z]{3})\/(\d{2})$/i.exec(s.trim());
  if (!m) return null;
  const mes = MESES_PT[m[1].toUpperCase()];
  const yy = Number(m[2]);
  if (!mes || !Number.isFinite(yy)) return null;
  // 2-dígito ano: 00-79 → 20XX, 80-99 → 19XX (heurística simples)
  const ano = yy < 80 ? 2000 + yy : 1900 + yy;
  return { ano, mes };
}

/** Parse o JSON-string de injetadaDetalhes. Retorna lista normalizada. */
export function parseInjetadaDetalhes(raw: string | null | undefined): DetalheParsed[] {
  if (!raw) return [];
  let arr: DetalheItem[];
  try {
    arr = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const out: DetalheParsed[] = [];
  for (const it of arr) {
    if (!it || typeof it !== "object") continue;
    const parsed = parseMesOrigem(String(it.mesOrigem ?? ""));
    if (!parsed) continue;
    // Usa teKwh (energia em si — tusdKwh costuma ser igual). Fallback pra tusdKwh.
    const kwh = Number(it.teKwh ?? it.tusdKwh ?? 0);
    if (!Number.isFinite(kwh)) continue;
    out.push({ ano: parsed.ano, mes: parsed.mes, kwh });
  }
  return out;
}

/**
 * Filtra os detalhes pra somar apenas créditos com mês de origem ≥ marco
 * (geralmente o 1º mês de geração da plant). Retorna soma de kWh "da plant".
 */
export function somarDetalhesDaPlant(
  detalhes: DetalheParsed[],
  primeiroMesPlant: { ano: number; mes: number },
): number {
  let soma = 0;
  for (const d of detalhes) {
    const isPlant =
      d.ano > primeiroMesPlant.ano ||
      (d.ano === primeiroMesPlant.ano && d.mes >= primeiroMesPlant.mes);
    if (isPlant) soma += d.kwh;
  }
  return soma;
}

/**
 * Pega o mês de origem MAIS RECENTE entre os entries que pertencem à plant.
 * Usado pra atribuir o `originatedByPlantBill` quando há múltiplos meses
 * BECKER contribuindo numa mesma fatura do consumidor.
 */
export function mesOrigemMaisRecenteDaPlant(
  detalhes: DetalheParsed[],
  primeiroMesPlant: { ano: number; mes: number },
): { ano: number; mes: number } | null {
  let melhor: { ano: number; mes: number } | null = null;
  for (const d of detalhes) {
    const isPlant =
      d.ano > primeiroMesPlant.ano ||
      (d.ano === primeiroMesPlant.ano && d.mes >= primeiroMesPlant.mes);
    if (!isPlant) continue;
    if (
      !melhor ||
      d.ano > melhor.ano ||
      (d.ano === melhor.ano && d.mes > melhor.mes)
    ) {
      melhor = { ano: d.ano, mes: d.mes };
    }
  }
  return melhor;
}

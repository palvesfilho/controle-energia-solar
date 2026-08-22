/**
 * Sugestão de percentuais para o rateio, a partir do CADASTRO (valor de
 * contrato): `Plant.geracaoMediaMensal` e `ConsumerUnit.consumoMedio`.
 *
 * A regra, pedida em 22/08/2026: o rateio distribui SEMPRE 100% dos créditos,
 * então o percentual de cada UC é a fatia dela no consumo somado das UCs do
 * rateio — não a razão consumo/geração. É por isso que uma usina de 100 kWh
 * com uma única UC de 70 kWh sugere 100%, e não 70%: os 30 kWh que sobram não
 * têm para onde ir.
 *
 * A geração NÃO entra no percentual; entra na leitura: quantos kWh cada fatia
 * representa e se o consumo somado cabe na usina (`ocupacao`). Acima de 100% a
 * usina está sobrecarregada — o rateio continua válido, mas ninguém compensa
 * tudo. Não truncamos nem escondemos: sobrecarga e ociosidade são problemas
 * OPOSTOS e a tela avisa em cada caso ([[project_taxa_ocupacao_saude_usina]]).
 *
 * ⛔ Nada é estimado. UC sem `consumoMedio` fica com 0% e é DEVOLVIDA em
 * `semConsumo` para a tela avisar — chutar um consumo médio seria inventar
 * realidade do cliente ([[feedback_nao_estimar_realidade_do_cliente]]).
 */

export interface UcParaSugestao {
  id: string;
  /** kWh/mês do cadastro. Null/0 = sem dado: a UC não recebe sugestão. */
  consumoMedio?: number | null;
  /** UC da própria usina: fica sempre 0% e fora da conta. */
  isGeradora?: boolean;
}

export interface SugestaoLinha {
  id: string;
  /** 0..100, duas casas. Soma exata de 100 quando há alguma UC com consumo. */
  percentual: number;
  consumoMedio: number | null;
  /** kWh/mês que essa fatia representa na geração de contrato. */
  kwhDestinado: number | null;
  /** Entrou no cálculo (tem consumo e não é geradora). */
  contabilizada: boolean;
}

export interface SugestaoRateio {
  linhas: SugestaoLinha[];
  /** Σ consumoMedio das UCs contabilizadas. */
  consumoTotal: number;
  geracaoMediaMensal: number | null;
  /** consumoTotal / geração. >1 sobrecarga, <1 ociosidade. Null sem geração. */
  ocupacao: number | null;
  /** Ids das UCs sem consumo médio — ficaram com 0% e precisam de mão. */
  semConsumo: string[];
  /** Nenhuma UC com consumo: não há o que sugerir. */
  indisponivel: boolean;
}

function consumoValido(u: UcParaSugestao): number | null {
  const v = u.consumoMedio;
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * Distribui 100% proporcionalmente ao consumo, em centésimos inteiros.
 *
 * Trunca cada fatia e devolve os centésimos que sobraram para quem tem a maior
 * parte fracionária descartada (maior resto). Distribuir o resto sempre na
 * primeira linha, como faz o "Distribuir igual", empurraria o erro de
 * arredondamento inteiro para uma UC só.
 */
function distribuir(pesos: Array<{ id: string; peso: number }>): Map<string, number> {
  const total = pesos.reduce((s, p) => s + p.peso, 0);
  const out = new Map<string, number>();
  if (total <= 0) return out;

  const alvo = 10_000; // 100,00% em centésimos
  const brutos = pesos.map((p) => {
    const exato = (p.peso / total) * alvo;
    const base = Math.floor(exato);
    return { id: p.id, base, resto: exato - base };
  });

  let sobra = alvo - brutos.reduce((s, b) => s + b.base, 0);
  // Maior resto primeiro; empate desempata pelo id para o resultado não
  // depender da ordem em que as UCs foram adicionadas na tela.
  const ordem = [...brutos].sort((a, b) => b.resto - a.resto || a.id.localeCompare(b.id));
  for (let i = 0; sobra > 0; i = (i + 1) % ordem.length) {
    ordem[i].base += 1;
    sobra -= 1;
  }

  for (const b of brutos) out.set(b.id, b.base / 100);
  return out;
}

export function sugerirPercentuais(
  ucs: UcParaSugestao[],
  geracaoMediaMensal: number | null | undefined,
): SugestaoRateio {
  const geracao =
    typeof geracaoMediaMensal === "number" &&
    Number.isFinite(geracaoMediaMensal) &&
    geracaoMediaMensal > 0
      ? geracaoMediaMensal
      : null;

  const contabilizadas = ucs.filter((u) => !u.isGeradora && consumoValido(u) !== null);
  const semConsumo = ucs
    .filter((u) => !u.isGeradora && consumoValido(u) === null)
    .map((u) => u.id);

  const percentuais = distribuir(
    contabilizadas.map((u) => ({ id: u.id, peso: consumoValido(u)! })),
  );

  const consumoTotal = contabilizadas.reduce((s, u) => s + consumoValido(u)!, 0);

  const linhas: SugestaoLinha[] = ucs.map((u) => {
    const pct = percentuais.get(u.id) ?? 0;
    return {
      id: u.id,
      percentual: pct,
      consumoMedio: consumoValido(u),
      kwhDestinado: geracao !== null ? (geracao * pct) / 100 : null,
      contabilizada: percentuais.has(u.id),
    };
  });

  return {
    linhas,
    consumoTotal,
    geracaoMediaMensal: geracao,
    ocupacao: geracao !== null && consumoTotal > 0 ? consumoTotal / geracao : null,
    semConsumo,
    indisponivel: contabilizadas.length === 0,
  };
}

/** Percentuais prontos para os inputs da tela ("21,06" vira "21.06"→"21.06"). */
export function sugestaoComoTexto(s: SugestaoRateio): Record<string, string> {
  const out: Record<string, string> = {};
  for (const l of s.linhas) out[l.id] = l.percentual.toFixed(2);
  return out;
}

/**
 * Prognóstico de geração — fonte única.
 *
 * Dois problemas que este módulo resolve:
 *
 * 1. **O prognóstico está na coluna anual.** `BrasilSolarClient.geracaoMediaEsperada`
 *    (kWh/mês) está vazia em 100% das usinas, enquanto `geracaoAnualEsperada`
 *    (kWh/ano) veio preenchida na importação em 81% delas (1.461 de 1.809,
 *    conferido em 2026-07-29). Como todo o sistema lia só a mensal, o KPI
 *    "Desempenho", o diagnóstico de manutenção do relatório e os alertas de
 *    baixa geração ficavam mudos. Aqui a mensal cai pra `anual ÷ 12` quando
 *    não houver valor próprio — sem exigir redigitação de cadastro.
 *
 * 2. **Comparar cada mês com a média anual acusa falso defeito no inverno.**
 *    A geração no RS varia mais de 2,5× entre junho e janeiro. Sem correção,
 *    uma usina perfeitamente saudável cairia abaixo do corte de vistoria
 *    (80% do previsto) todo outono/inverno. O prognóstico do período é
 *    corrigido pela curva sazonal abaixo.
 *
 * A curva NÃO é chutada: foi medida na própria base, sobre as 34 usinas
 * monitoradas com 12+ meses de log completo (`scripts/_diag-curva-sazonal.ts`
 * regenera). Usa a MEDIANA do fator (geração do mês ÷ média mensal da usina),
 * que ignora o mês com lacuna de sync melhor que a média. Como a frota fica
 * concentrada na região central do RS, a curva vale para essa latitude — se um
 * dia a Brasil Solar operar em outra região, isto vira parâmetro por usina.
 */

/**
 * Fator sazonal por mês (índice 0 = janeiro). Soma exatamente 12, então um ano
 * inteiro fecha no prognóstico anual sem sobra nem falta.
 *
 * Medido em 2026-07-29 sobre 34 usinas × 12+ meses.
 */
export const CURVA_SAZONAL: readonly number[] = [
  1.519, // jan
  1.215, // fev
  1.121, // mar
  0.857, // abr
  0.637, // mai
  0.549, // jun
  0.621, // jul
  0.78, // ago
  0.909, // set
  1.152, // out
  1.31, // nov
  1.33, // dez
];

/** Usina, no que importa pro prognóstico. */
export interface FonteGeracaoEsperada {
  geracaoMediaEsperada?: number | null;
  geracaoAnualEsperada?: number | null;
}

/**
 * Prognóstico mensal MÉDIO da usina (kWh/mês), sem correção sazonal.
 *
 * Prefere o valor cadastrado à mão; cai pra `anual ÷ 12`. Retorna 0 quando não
 * há prognóstico algum — quem chama trata 0 como "sem prognóstico".
 */
export function esperadaMensalBaseKwh(c: FonteGeracaoEsperada): number {
  if (c.geracaoMediaEsperada != null && c.geracaoMediaEsperada > 0) {
    return c.geracaoMediaEsperada;
  }
  if (c.geracaoAnualEsperada != null && c.geracaoAnualEsperada > 0) {
    return c.geracaoAnualEsperada / 12;
  }
  return 0;
}

/** Soma o prognóstico mensal médio de várias usinas (mesma UC). */
export function esperadaMensalBaseTotalKwh(
  clients: FonteGeracaoEsperada[],
): number {
  return clients.reduce((s, c) => s + esperadaMensalBaseKwh(c), 0);
}

/** Fator sazonal do mês. `mes` em 1–12. */
export function fatorSazonal(mes: number): number {
  const i = Math.trunc(mes) - 1;
  return CURVA_SAZONAL[i] ?? 1;
}

/**
 * Prognóstico de um mês calendário específico (kWh), já com sazonalidade.
 * `mes` em 1–12.
 */
export function esperadaDoMesKwh(baseMensalKwh: number, mes: number): number {
  return baseMensalKwh * fatorSazonal(mes);
}

/**
 * Prognóstico ACUMULADO do mês corrente até a data (kWh).
 *
 * O mês em curso está pela metade: comparar o gerado até o dia 10 com o
 * esperado do mês inteiro daria ~33% e acusaria "baixa geração" em toda a
 * frota, todo começo de mês. Aqui o esperado é pro-rateado pelos dias já
 * decorridos (o dia de `ate` conta inteiro, como o acumulado do inversor).
 */
export function esperadaAcumuladaNoMesKwh(
  baseMensalKwh: number,
  ate: Date,
): number {
  if (baseMensalKwh <= 0) return 0;
  const ano = ate.getUTCFullYear();
  const mes = ate.getUTCMonth() + 1;
  const diaAtual = ate.getUTCDate();
  const total = diasNoMes(ano, mes);
  const fracao = Math.min(1, diaAtual / total);
  return esperadaDoMesKwh(baseMensalKwh, mes) * fracao;
}

/** Prognóstico de um único dia (kWh) — usado na linha "esperada" do gráfico. */
export function esperadaDoDiaKwh(baseMensalKwh: number, data: Date): number {
  const mes = data.getUTCMonth() + 1;
  return esperadaDoMesKwh(baseMensalKwh, mes) / diasNoMes(data.getUTCFullYear(), mes);
}

/**
 * Prognóstico diário direto da usina (kWh/dia) — `null` sem prognóstico.
 * Atalho pros syncs, que gravam `MonitoringLog.geracaoEsperada`.
 */
export function esperadaDoDiaDaUsina(
  c: FonteGeracaoEsperada,
  data: Date,
): number | null {
  const base = esperadaMensalBaseKwh(c);
  if (base <= 0) return null;
  return esperadaDoDiaKwh(base, data);
}

/**
 * Performance ratio do MÊS CORRENTE (%) — `null` sem prognóstico.
 *
 * Compara o acumulado do mês com o esperado até hoje (pro-rateado), não com o
 * mês inteiro: no dia 5 a usina só teve 5 dias para gerar. É esse número que
 * alimenta o alerta de baixa geração, então um denominador errado vira alerta
 * falso em toda a frota.
 */
export function performanceRatioMesAtual(
  c: FonteGeracaoEsperada,
  geracaoMesKwh: number,
  agora: Date,
): number | null {
  const base = esperadaMensalBaseKwh(c);
  if (base <= 0) return null;
  const esperado = esperadaAcumuladaNoMesKwh(base, agora);
  if (esperado <= 0) return null;
  return (geracaoMesKwh / esperado) * 100;
}

function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/**
 * Prognóstico da JANELA de leitura da fatura (kWh).
 *
 * O relatório não mede mês calendário: mede o ciclo de leitura da
 * concessionária, que tem 28 a 33 dias e cruza a virada do mês. Aqui cada dia
 * da janela contribui com a fração sazonal do mês a que pertence, então uma
 * janela mais longa espera proporcionalmente mais geração e uma janela que
 * pega metade de maio e metade de junho fica entre os dois fatores.
 *
 * `fim` é exclusivo na contagem de dias? Não: a janela do relatório é
 * inclusiva nas duas pontas na prática do ciclo (leitura anterior → atual),
 * e é assim que a geração é somada. Mantemos a mesma contagem para não
 * comparar períodos de tamanhos diferentes.
 */
export function esperadaDoPeriodoKwh(
  baseMensalKwh: number,
  inicio: Date,
  fim: Date,
): number {
  if (baseMensalKwh <= 0) return 0;
  const ini = Date.UTC(
    inicio.getUTCFullYear(),
    inicio.getUTCMonth(),
    inicio.getUTCDate(),
  );
  const end = Date.UTC(fim.getUTCFullYear(), fim.getUTCMonth(), fim.getUTCDate());
  if (!Number.isFinite(ini) || !Number.isFinite(end) || end < ini) return 0;

  const DIA_MS = 86_400_000;
  const dias = Math.round((end - ini) / DIA_MS);
  // Janela absurda (dado sujo) — não inventa prognóstico.
  if (dias < 1 || dias > 200) return 0;

  let mesesEquivalentes = 0;
  for (let d = 0; d < dias; d++) {
    const dt = new Date(ini + d * DIA_MS);
    const ano = dt.getUTCFullYear();
    const mes = dt.getUTCMonth() + 1;
    mesesEquivalentes += fatorSazonal(mes) / diasNoMes(ano, mes);
  }
  return baseMensalKwh * mesesEquivalentes;
}

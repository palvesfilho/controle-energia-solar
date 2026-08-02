/**
 * Série mensal do ano civil para gráficos de geração.
 *
 * Regra do produto: todo gráfico de geração MENSAL cobre de **janeiro do ano
 * até o mês atual**, e mês sem geração aparece como **zero** — não some da
 * série. Um buraco invisível (mês ausente) faz o gráfico parecer normal quando
 * na verdade faltou dado; um zero visível denuncia a falha.
 *
 * Caso real que motivou a regra: a usina da Fundação Meneghetti ficou de
 * 16/03 a 22/07/2026 sem telemetria. Os meses de abril, maio e junho
 * simplesmente não apareciam no gráfico — parecia que o período nem existia.
 */

export const MESES_ABREV = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

export interface MesDaSerie {
  ano: number;
  mes: number; // 1-12
  /** "jan/26" */
  label: string;
}

/**
 * Meses a exibir para um ano: janeiro até o mês atual quando é o ano corrente,
 * janeiro a dezembro quando é um ano passado. Ano futuro devolve vazio.
 */
export function mesesDoAno(ano: number, hoje: Date = new Date()): MesDaSerie[] {
  const anoAtual = hoje.getFullYear();
  if (ano > anoAtual) return [];
  const ultimoMes = ano === anoAtual ? hoje.getMonth() + 1 : 12;

  const out: MesDaSerie[] = [];
  for (let m = 1; m <= ultimoMes; m++) {
    out.push({ ano, mes: m, label: `${MESES_ABREV[m - 1]}/${String(ano).slice(2)}` });
  }
  return out;
}

/**
 * Casa `linhas` com os meses do ano. Mês sem linha correspondente devolve
 * `row: null` — quem consome decide se vira 0, "—" ou barra vazia.
 *
 *   const serie = serieMensalDoAno(2026, meses, (m) => ({ ano: m.ano, mes: m.mes }));
 *   const chartData = serie.map(({ label, row }) => ({
 *     label,
 *     geracao: row?.geracaoInversorKwh ?? 0,
 *   }));
 */
export function serieMensalDoAno<T>(
  ano: number,
  linhas: T[],
  getChave: (linha: T) => { ano: number; mes: number },
  hoje: Date = new Date(),
): Array<MesDaSerie & { row: T | null }> {
  const porChave = new Map<string, T>();
  for (const l of linhas) {
    const { ano: a, mes: m } = getChave(l);
    porChave.set(`${a}-${m}`, l);
  }
  return mesesDoAno(ano, hoje).map((m) => ({
    ...m,
    row: porChave.get(`${m.ano}-${m.mes}`) ?? null,
  }));
}

/**
 * Janela de N meses corridos terminando no mês mais recente de `linhas`,
 * preenchendo com `row: null` os meses sem dado.
 *
 * É a janela do **PDF/relatório** — a tela usa ano civil (`serieMensalDoAno`).
 * São regras diferentes de propósito: um PDF gerado em janeiro com janela de
 * ano civil teria uma única barra, e é o documento que vai pro cliente.
 *
 * Ancorada no último mês COM dado (não em hoje), preservando o comportamento
 * histórico de `meses.slice(-12)` — a diferença é que agora um mês sem fatura
 * no meio da janela aparece zerado em vez de sumir do eixo.
 */
export function ultimosMesesCorridos<T>(
  qtd: number,
  linhas: T[],
  getChave: (linha: T) => { ano: number; mes: number },
): Array<MesDaSerie & { row: T | null }> {
  if (linhas.length === 0) return [];

  const porChave = new Map<string, T>();
  let maxAno = -Infinity;
  let maxMes = -Infinity;
  for (const l of linhas) {
    const { ano, mes } = getChave(l);
    porChave.set(`${ano}-${mes}`, l);
    if (ano > maxAno || (ano === maxAno && mes > maxMes)) {
      maxAno = ano;
      maxMes = mes;
    }
  }

  const out: Array<MesDaSerie & { row: T | null }> = [];
  // Anda de trás pra frente a partir do mês mais recente e inverte no fim.
  let ano = maxAno;
  let mes = maxMes;
  for (let i = 0; i < qtd; i++) {
    out.push({
      ano,
      mes,
      label: `${MESES_ABREV[mes - 1]}/${String(ano).slice(2)}`,
      row: porChave.get(`${ano}-${mes}`) ?? null,
    });
    mes -= 1;
    if (mes < 1) {
      mes = 12;
      ano -= 1;
    }
  }
  return out.reverse();
}

/**
 * Ano a exibir por padrão: o ano corrente. Se o conjunto não tiver nenhum dado
 * no ano corrente, cai para o ano mais recente que tenha — evita gráfico
 * inteiramente zerado para quem parou de gerar no ano passado.
 */
export function anoPadraoDaSerie(
  anosComDado: number[],
  hoje: Date = new Date(),
): number {
  const anoAtual = hoje.getFullYear();
  if (anosComDado.includes(anoAtual)) return anoAtual;
  const passados = anosComDado.filter((a) => a < anoAtual).sort((a, b) => b - a);
  return passados[0] ?? anoAtual;
}

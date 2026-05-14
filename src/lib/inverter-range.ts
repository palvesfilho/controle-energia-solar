/**
 * Helper para somar geração diária de um inversor dentro de um intervalo
 * arbitrário de datas (não necessariamente um mês calendário). Usado para
 * comparar produção do inversor com a janela de leitura do medidor da
 * distribuidora — que geralmente vai do dia X de um mês até o dia X do mês
 * seguinte.
 *
 * Convenção: `dateStart` inclusivo, `dateEnd` exclusivo. Ou seja, se a fatura
 * diz "leitura anterior 20/02 → leitura atual 20/03", chamar com
 * (20/02, 20/03) soma os dias 20/02..19/03 (= diasFaturamento).
 */

export interface DailyEntry {
  day: number;          // dia do mês (1-31)
  energyKwh: number;
}

/**
 * Itera os meses calendário cobertos pelo intervalo, busca os dailies de cada
 * um via `fetchMonth(year, month)` e soma apenas os dias dentro de
 * [dateStart, dateEnd).
 */
export async function sumDailyInRange(
  dateStart: Date,
  dateEnd: Date,
  fetchMonth: (year: number, month: number) => Promise<DailyEntry[]>,
): Promise<{ totalKwh: number; days: number }> {
  if (dateEnd <= dateStart) {
    return { totalKwh: 0, days: 0 };
  }

  // Normaliza para o início do dia (UTC) — evita problemas de fuso ao comparar.
  const start = new Date(Date.UTC(
    dateStart.getUTCFullYear(),
    dateStart.getUTCMonth(),
    dateStart.getUTCDate(),
  ));
  const end = new Date(Date.UTC(
    dateEnd.getUTCFullYear(),
    dateEnd.getUTCMonth(),
    dateEnd.getUTCDate(),
  ));

  let totalKwh = 0;
  let days = 0;

  // Itera mês a mês entre start e end (inclusive nos meses tocados).
  let cursorYear = start.getUTCFullYear();
  let cursorMonth = start.getUTCMonth() + 1; // 1-12
  const endYear = end.getUTCFullYear();
  const endMonth = end.getUTCMonth() + 1;

  while (cursorYear < endYear || (cursorYear === endYear && cursorMonth <= endMonth)) {
    const daily = await fetchMonth(cursorYear, cursorMonth);
    for (const d of daily) {
      const dayDate = new Date(Date.UTC(cursorYear, cursorMonth - 1, d.day));
      if (dayDate >= start && dayDate < end) {
        totalKwh += d.energyKwh;
        days += 1;
      }
    }
    if (cursorMonth === 12) {
      cursorMonth = 1;
      cursorYear += 1;
    } else {
      cursorMonth += 1;
    }
  }

  return { totalKwh, days };
}

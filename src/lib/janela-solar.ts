/**
 * Janela solar — a faixa do dia em que faz sentido esperar dado de uma usina.
 *
 * Fonte ÚNICA da definição: o coletor intradiário usa isto pra decidir quando
 * coletar, e a detecção de usina muda usa isto pra decidir quando a ausência de
 * dado é sintoma. Se as duas tivessem cada uma a sua janela, uma usina poderia
 * ser considerada "muda" num horário em que a outra nem tenta coletar — e o
 * alerta nasceria de um buraco que nós mesmos criamos.
 */

/** 8h–23h UTC = 05:00–20:00 BRT. */
export const JANELA_SOLAR_UTC = { inicio: 8, fim: 23 } as const;

const HORA_MS = 60 * 60 * 1000;
const DIA_MS = 24 * HORA_MS;

/** Está dentro da janela solar? Fora dela, coletar é desperdício de cota. */
export function dentroDaJanelaSolar(agora: Date): boolean {
  const h = agora.getUTCHours();
  return h >= JANELA_SOLAR_UTC.inicio && h < JANELA_SOLAR_UTC.fim;
}

/** Início e fim da janela solar do dia UTC de `d`. */
function janelaDoDia(d: Date): { inicio: number; fim: number } {
  const base = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return {
    inicio: base + JANELA_SOLAR_UTC.inicio * HORA_MS,
    fim: base + JANELA_SOLAR_UTC.fim * HORA_MS,
  };
}

/**
 * Teto de dias percorridos. Uma usina muda há meses não precisa de contagem
 * exata — já passou de qualquer limiar — e não vale varrer o calendário inteiro.
 */
const MAX_DIAS = 45;

/**
 * Horas de SOL decorridas entre dois instantes, descontando as noites.
 *
 * É isto que permite um limiar de mudez que atravessa a madrugada sem
 * disparar: uma usina que emudece às 17h acumula 3h naquele dia e completa as
 * 8h por volta das 10h do dia seguinte. Contar em horas de relógio faria toda
 * usina do país "sumir" durante a noite, todas as noites.
 */
export function horasSolaresEntre(inicio: Date, fim: Date): number {
  if (fim <= inicio) return 0;

  const limite = MAX_DIAS * DIA_MS;
  if (fim.getTime() - inicio.getTime() > limite) {
    // Passou do teto: devolve um número grande o bastante pra estourar
    // qualquer limiar, sem varrer meses de calendário.
    return MAX_DIAS * (JANELA_SOLAR_UTC.fim - JANELA_SOLAR_UTC.inicio);
  }

  let total = 0;
  const cursor = new Date(
    Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth(), inicio.getUTCDate()),
  );

  while (cursor.getTime() <= fim.getTime()) {
    const dia = janelaDoDia(cursor);
    const de = Math.max(dia.inicio, inicio.getTime());
    const ate = Math.min(dia.fim, fim.getTime());
    if (ate > de) total += (ate - de) / HORA_MS;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return total;
}

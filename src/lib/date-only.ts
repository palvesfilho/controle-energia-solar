/**
 * Datas "calendar-only" — vencimento, leitura, dia de pagamento etc.
 *
 * Regra do projeto: um dia-calendário é SEMPRE ancorado em **12:00 UTC**.
 * Meia-noite (00:00Z) quebra em qualquer fuso a oeste de Greenwich — no
 * Brasil (-03) vira 21:00 do dia anterior, e o clássico bug de "-1 dia"
 * aparece na tela. Meia-noite local (03:00Z no BRT) quebra do outro lado
 * quando o servidor roda em UTC, que é o caso do Railway.
 *
 * Com 12:00 UTC o componente de data é o mesmo de UTC-11 a UTC+11, então
 * servidor e navegador concordam sem depender de variável TZ.
 *
 * O **dia-calendário de um valor é sempre seu componente UTC** (getUTC*).
 * Isso vale para os três formatos que existem no banco hoje — 00:00Z,
 * 03:00Z (meia-noite BRT) e 12:00Z — porque todos caem no mesmo dia UTC.
 * Por isso `toDateOnly` normaliza registros legados sem ambiguidade.
 *
 * Para instantes REAIS (syncedAt, createdAt) use `dayInBrasil`: aí o dia
 * depende do fuso de quem opera, não do UTC.
 */

export const TZ_BRASIL = "America/Sao_Paulo";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Ancora ano/mês/dia em 12:00 UTC. `month` é 1-12. */
export function dateOnlyUTC(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
}

/**
 * Reancora um Date existente em 12:00 UTC preservando o dia-calendário
 * (lido em UTC). Idempotente — usar à vontade em dados já normalizados.
 */
export function toDateOnly(d: Date | null | undefined): Date | null {
  if (!d || Number.isNaN(d.getTime())) return null;
  return dateOnlyUTC(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** "15/01/2026" → 2026-01-15T12:00:00Z */
export function parseDateOnlyBR(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = String(s).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return dateOnlyUTC(Number(m[3]), Number(m[2]), Number(m[1]));
}

/** "2026-01-15" (ou ISO completo) → 2026-01-15T12:00:00Z */
export function parseDateOnlyISO(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return dateOnlyUTC(Number(m[1]), Number(m[2]), Number(m[3]));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : toDateOnly(d);
}

/** Chave estável "YYYY-MM-DD" (em UTC) — use para serializar ao cliente. */
export function dateOnlyKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;
}

/** "dd/mm/aaaa" a partir do componente UTC — imune ao fuso de quem renderiza. */
export function formatDateOnlyBR(d: Date | null | undefined): string {
  if (!d) return "—";
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

export function addDaysOnly(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

/** Diferença em dias-calendário (b - a). */
export function diffDaysOnly(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

/** 0=domingo … 6=sábado, lido em UTC. */
export function weekdayOnly(d: Date): number {
  return d.getUTCDay();
}

export function isWeekend(d: Date): boolean {
  const w = weekdayOnly(d);
  return w === 0 || w === 6;
}

/**
 * Antecipa para o dia útil anterior quando cai em fim de semana:
 * sábado → sexta, domingo → sexta. Antecipar nunca atrasa a tarefa, então
 * é seguro aplicar em qualquer agendamento operacional.
 *
 * Não considera feriados — o projeto não tem calendário de feriados.
 */
export function previousBusinessDay(d: Date): Date {
  const w = weekdayOnly(d);
  if (w === 6) return addDaysOnly(d, -1); // sábado → sexta
  if (w === 0) return addDaysOnly(d, -2); // domingo → sexta
  return d;
}

/** Dia-calendário de hoje no fuso de Brasília, ancorado em 12:00 UTC. */
export function todayInBrasil(): Date {
  return dayInBrasil(new Date());
}

/**
 * Converte um instante real (syncedAt, createdAt…) no dia-calendário
 * correspondente em Brasília. Um sync às 22h BRT é 01:00Z do dia seguinte —
 * ler em UTC daria o dia errado; por isso o fuso entra explicitamente aqui.
 */
export function dayInBrasil(instant: Date): Date {
  // "en-CA" formata como YYYY-MM-DD, o que evita ambiguidade de ordem.
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ_BRASIL,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
  const [y, m, d] = iso.split("-").map(Number);
  return dateOnlyUTC(y, m, d);
}

/**
 * Instante REAL (sync, erro, criação) formatado em Brasília: "06/08/2026, 14:03".
 * `toLocaleString("pt-BR")` sem fuso usa o TZ do processo — no Railway isso é
 * UTC e a hora sai 3 horas adiantada pra quem opera no Brasil.
 */
export function formatInstantBR(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ_BRASIL,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** Segunda-feira da semana do dia informado (dia-calendário). */
export function startOfWeekMondayOnly(d: Date): Date {
  const w = weekdayOnly(d);
  return addDaysOnly(d, w === 0 ? -6 : 1 - w);
}

/** Domingo da semana do dia informado (dia-calendário). */
export function endOfWeekSundayOnly(d: Date): Date {
  return addDaysOnly(startOfWeekMondayOnly(d), 6);
}

/**
 * Limites em instante para filtrar no banco por dia-calendário. Abrem o dia
 * inteiro em UTC (00:00 → 23:59:59.999) para casar também com os registros
 * legados gravados em 00:00Z ou 03:00Z.
 */
export function startOfDayInstant(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

export function endOfDayInstant(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

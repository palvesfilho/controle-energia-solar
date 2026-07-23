const brlFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const numberFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatBRL(value: number): string {
  return brlFormatter.format(value);
}

export function formatKWh(value: number): string {
  return `${numberFormatter.format(value)} kWh`;
}

const monthNames = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const shortMonthNames = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

export function formatMonthYear(month: number, year: number): string {
  return `${monthNames[month - 1]} ${year}`;
}

export function shortMonth(month: number): string {
  return shortMonthNames[month - 1];
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR").format(date);
}

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

/**
 * Nome de saudação: primeiro nome + último sobrenome, em capitalização de
 * título ("OTHAVIO CECCIM MORALES" → "Othavio Morales"). Partículas ("de",
 * "da", "dos"…) ficam minúsculas e nunca viram o "sobrenome" exibido.
 */
const PARTICULAS = new Set(["de", "da", "do", "das", "dos", "e", "di", "du", "del", "van", "von"]);

export function formatNomeSaudacao(nomeCompleto: string | null | undefined): string | null {
  const partes = (nomeCompleto ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return null;

  const titulo = (p: string) =>
    PARTICULAS.has(p.toLowerCase())
      ? p.toLowerCase()
      : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();

  const primeiro = titulo(partes[0]);
  // Último termo que não seja partícula (evita "Othavio de").
  const sobrenome = [...partes.slice(1)].reverse().find((p) => !PARTICULAS.has(p.toLowerCase()));
  return sobrenome ? `${primeiro} ${titulo(sobrenome)}` : primeiro;
}

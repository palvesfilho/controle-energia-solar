export const CONCESSIONARIAS = [
  "RGE",
  "CELETRO",
  "NOVA PALMA",
  "COPREL",
  "CERILUZ",
] as const;

export type Concessionaria = (typeof CONCESSIONARIAS)[number];

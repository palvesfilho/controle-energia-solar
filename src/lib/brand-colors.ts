/**
 * Paleta da identidade visual — espelha as cores usadas no PDF do investidor
 * (`src/components/billing/investor-report-pdf.tsx`). Use estes tokens em
 * telas que precisam manter coerência com o material entregue ao cliente.
 */
export const brand = {
  teal: "#2E9B87",
  tealMid: "#3BAE99",
  tealDark: "#1B5E54",
  orange: "#EA6E2C",
  orangeLight: "#F39350",
} as const;

/**
 * Gradiente diagonal usado na capa do PDF — útil para hero/banners das telas
 * de cobrança e relatórios.
 */
export const brandGradient =
  `linear-gradient(135deg, ${brand.teal} 0%, ${brand.tealMid} 45%, ${brand.orange} 100%)`;

/**
 * Quais plataformas de monitoramento têm curva intradiária.
 *
 * Mora aqui, e não em `lib/intraday-collector`, porque a tela precisa dessa
 * lista para decidir se mostra o gráfico — e o coletor importa `crypto` e o
 * Prisma, que não sobem num componente cliente. O coletor reexporta daqui, de
 * modo que ligar uma plataforma nova é mexer num lugar só.
 */
export type PlataformaIntradia =
  | "SUNGROW"
  | "SOLAREDGE"
  | "FRONIUS"
  | "HUAWEI"
  | "GROWATT";

export const PLATAFORMAS_INTRADIA: PlataformaIntradia[] = [
  "SUNGROW",
  "SOLAREDGE",
  "FRONIUS",
  "HUAWEI",
  "GROWATT",
];

export function temCurvaIntradiaria(
  plataforma: string | null | undefined,
): boolean {
  return PLATAFORMAS_INTRADIA.includes(plataforma as PlataformaIntradia);
}

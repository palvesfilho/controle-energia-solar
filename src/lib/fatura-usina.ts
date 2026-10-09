/**
 * Fatura de USINA nem sempre carrega o `plantId`.
 *
 * A mesma instalação pode estar cadastrada duas vezes: como `Plant` (usina de
 * investidor) e como `ConsumerUnit` de mesmo código (a ANTUNES tem a gêmea
 * "PRODUZA - UC", do módulo Brasil Solar). O sync da concessionária grava a
 * fatura na UC, sem `plantId` — e quem procura fatura de usina só por `plantId`
 * vê o mês vazio com a fatura no banco (ANTUNES 08-09/2026, TOTEM 06/2026).
 *
 * Use isto para achar as UCs gêmeas de uma usina e olhar as faturas delas também.
 */
type CodigosDaUsina = {
  numeroUsina: string | null;
  unidadeConsumidora: string | null;
  unidadeConsumidoraAntiga: string | null;
  codigoCliente: string | null;
};

const soDigitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/** Todos os códigos (só dígitos) pelos quais a instalação da usina é conhecida. */
export function codigosDaUsina(p: CodigosDaUsina): string[] {
  return [
    ...new Set(
      [p.numeroUsina, p.unidadeConsumidora, p.unidadeConsumidoraAntiga, p.codigoCliente]
        .map(soDigitos)
        .filter(Boolean),
    ),
  ];
}

/** Filtro Prisma das `ConsumerUnit` gêmeas da usina — de QUALQUER origem. */
export function whereUcsGemeasDaUsina(p: CodigosDaUsina) {
  const codigos = codigosDaUsina(p);
  if (codigos.length === 0) return null;
  return { OR: [{ codigoUc: { in: codigos } }, { codigoUcAntigo: { in: codigos } }] };
}

/** Índice código → ids de UC, para resolver as gêmeas de muitas usinas de uma vez. */
export function indexarUcsPorCodigo(
  ucs: { id: string; codigoUc: string; codigoUcAntigo: string | null }[],
): Map<string, string[]> {
  const mapa = new Map<string, string[]>();
  for (const u of ucs) {
    for (const c of [u.codigoUc, u.codigoUcAntigo].map(soDigitos).filter(Boolean)) {
      const lista = mapa.get(c) ?? [];
      if (!lista.includes(u.id)) lista.push(u.id);
      mapa.set(c, lista);
    }
  }
  return mapa;
}

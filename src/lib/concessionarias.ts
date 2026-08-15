/**
 * Lista canônica de concessionárias e permissionárias atendidas.
 *
 * "RGE/CPFL" é UMA entrada de propósito: as duas fazem parte do mesmo grupo e a
 * consulta de fatura usa o MESMO endpoint da Infosimples (ver o cabeçalho de
 * `infosimples.ts`). Separá-las nunca mudou comportamento — só criava
 * divergência entre a concessionária do cadastro e a da credencial, que era
 * escolhida duas vezes e podia discordar.
 */
export const CONCESSIONARIAS = [
  "RGE/CPFL",
  "CEEE EQUATORIAL",
  "CELETRO",
  "CERFOX",
  "CERILUZ",
  "CERTAJA",
  "CERTEL",
  "CERTHIL",
  "CERVALE",
  "COOPERLUZ",
  "COOPERMILA",
  "COOPERNORTE",
  "COOPERSUL",
  "COORSEL",
  "COPREL",
  "CRELUZ",
  "CRELUZ-D",
  "CRERAL",
  "DEMEI",
  "ELETROCAR",
  "HIDROPAN",
  "MUX-ENERGIA",
  "NOVA PALMA ENERGIA",
] as const;

export type Concessionaria = (typeof CONCESSIONARIAS)[number];

/**
 * Valores legados → entrada canônica.
 *
 * Dois vocabulários antigos convivem no banco:
 * - o da credencial (`CpflCredential.distribuidora`): RGE, CPFL_PAULISTA,
 *   CPFL_PIRATININGA;
 * - o do cadastro (`ConsumerUnit.distribuidora`, `Plant.concessionaria`,
 *   `BrasilSolarClient.concessionaria`), que além disso era texto livre.
 *
 * Chaves em CAIXA ALTA sem espaços nas pontas — a busca normaliza antes.
 */
const ALIASES: Record<string, Concessionaria> = {
  RGE: "RGE/CPFL",
  "RGE SUL": "RGE/CPFL",
  CPFL: "RGE/CPFL",
  CPFL_PAULISTA: "RGE/CPFL",
  "CPFL PAULISTA": "RGE/CPFL",
  CPFL_PIRATININGA: "RGE/CPFL",
  "CPFL PIRATININGA": "RGE/CPFL",
  "RGE/CPFL": "RGE/CPFL",
  "NOVA PALMA": "NOVA PALMA ENERGIA",
};

/**
 * Converte qualquer grafia conhecida na entrada canônica da lista.
 * Devolve `null` quando não reconhece — o chamador decide se ignora ou sinaliza,
 * em vez de gravar um palpite (ver feedback_anomalias_sinalizar).
 */
export function normalizeConcessionaria(
  valor: string | null | undefined,
): Concessionaria | null {
  if (!valor) return null;
  const limpo = valor.trim().toUpperCase();
  if (!limpo) return null;

  const exata = CONCESSIONARIAS.find((c) => c === limpo);
  if (exata) return exata;

  return ALIASES[limpo] ?? null;
}

/**
 * Concessionária da USINA para EXIBIÇÃO — resolve o fato de `Plant` guardar o
 * mesmo conceito em dois campos.
 *
 * `concessionaria` é o que as telas de cadastro/edição gravam (o select de
 * "Concessionária" em /admin/usinas/nova e /admin/usinas/[id]).
 * `distribuidora` é um campo LEGADO que nenhuma tela preenche: só tem valor nas
 * usinas que vieram da importação inicial. Ler só `distribuidora` faz toda usina
 * cadastrada pela tela aparecer sem concessionária, mesmo tendo sido salva.
 *
 * Devolve `null` quando os dois estão vazios — nada é inventado aqui. O default
 * "RGE/CPFL" existe SÓ na rota de credencial, onde o robô precisa de um alvo;
 * numa listagem ele mentiria (ver feedback_anomalias_sinalizar).
 */
export function concessionariaDaUsina(plant: {
  concessionaria?: string | null;
  distribuidora?: string | null;
}): string | null {
  const bruto = plant.concessionaria?.trim() || plant.distribuidora?.trim() || null;
  if (!bruto) return null;
  // Grafia legada ("RGE", "CPFL PAULISTA") vira a canônica; o que a lista não
  // reconhece é exibido como está, em vez de sumir da tela.
  return normalizeConcessionaria(bruto) ?? bruto;
}

/** `true` quando o valor já está na lista canônica. */
export function isConcessionariaValida(
  valor: string | null | undefined,
): valor is Concessionaria {
  return !!valor && CONCESSIONARIAS.some((c) => c === valor);
}

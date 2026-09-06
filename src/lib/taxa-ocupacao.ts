/**
 * Taxa de ocupação de usina — DEFINIÇÃO ÚNICA do sistema.
 *
 * Responde "quanto do crédito que a usina gera já tem cliente pra usar":
 *
 *     ocupação = Σ consumoMedio das UCs do rateio VIGENTE ÷ geracaoMediaMensal
 *
 * Retorno é FRAÇÃO (0..1), não percentual — quem exibe multiplica por 100.
 *
 * 🔑 O vínculo UC↔usina aqui é o RATEIO VIGENTE, nunca `ConsumerUnit.plantId`.
 * O plantId é cadastro (a usina que o operador marcou no formulário) e não prova
 * que a concessionária compensa crédito dela pra aquela UC; só o rateio aceito
 * prova. Usina sem rateio vigente tem ocupação 0 — 0 é o achado ("ninguém pra
 * absorver o crédito"), não ausência de dado.
 *
 * ⛔ NÃO truncar em 100%. Rateio pedindo mais do que a usina gera (sobrecarga)
 * é um problema tão real quanto usina ociosa, e some se a conta for capada.
 *
 * Denominador = `Plant.geracaoMediaMensal` (CADASTRO), não a geração medida:
 * medição existe pra 2 das 30 usinas (MonitoringLog depende de
 * BrasilSolarClient.plantId) e diverge ~35% do cadastro nessas duas. "Medida
 * quando houver, cadastro quando não" deixaria usinas incomparáveis entre si.
 * Sem geração cadastrada o retorno é `null` — chutar denominador seria inventar.
 *
 * ⚠️ Somar os PERCENTUAIS do rateio não serve como taxa de ocupação: por
 * regulação a soma dos itens de uma versão é sempre 100, então a média daria
 * apenas "% de usinas com rateio vigente" com outro nome.
 */

/** Item do rateio vigente, no mínimo que a conta precisa. */
export type ItemRateioOcupacao = {
  consumerUnit: { consumoMedio: number | null } | null;
};

/** Versão VIGENTE do rateio de uma usina, no mínimo que a conta precisa. */
export type RateioVigenteOcupacao = {
  plantId: string;
  items: ItemRateioOcupacao[];
};

export type ConsumoRateio = {
  /** Σ consumoMedio das UCs do rateio vigente (kWh/mês). */
  consumoKwh: number;
  /**
   * UCs no rateio sem consumo médio cadastrado. Elas entram como zero no
   * numerador, então a taxa sai SUBESTIMADA — quem exibe precisa avisar.
   */
  ucsSemConsumo: number;
};

/** Numerador da ocupação, agrupado por usina. */
export function consumoDoRateioPorPlant(
  rateios: RateioVigenteOcupacao[],
): Map<string, ConsumoRateio> {
  const porPlant = new Map<string, ConsumoRateio>();
  for (const r of rateios) {
    const cur = porPlant.get(r.plantId) ?? { consumoKwh: 0, ucsSemConsumo: 0 };
    for (const it of r.items) {
      const consumo = it.consumerUnit?.consumoMedio ?? 0;
      if (consumo > 0) cur.consumoKwh += consumo;
      else cur.ucsSemConsumo++;
    }
    porPlant.set(r.plantId, cur);
  }
  return porPlant;
}

/** Ocupação de uma usina em fração (0..1). `null` = sem geração cadastrada. */
export function taxaOcupacaoPct(
  consumoRateioKwh: number,
  geracaoMediaMensal: number | null | undefined,
): number | null {
  const geracao =
    geracaoMediaMensal && geracaoMediaMensal > 0 ? geracaoMediaMensal : null;
  if (geracao == null) return null;
  return consumoRateioKwh / geracao;
}

export type OcupacaoFrota = {
  /** Média das usinas que TÊM geração cadastrada, em fração. `null` = nenhuma. */
  media: number | null;
  /** Usinas que entraram na média (têm geracaoMediaMensal > 0). */
  usinasConsideradas: number;
  /** Usinas fora da média por não ter geração cadastrada. */
  usinasSemGeracao: number;
  /** Usinas consideradas que estão sem rateio vigente (ocupação 0). */
  usinasSemRateio: number;
};

/**
 * Média da frota. Usina sem geração cadastrada fica FORA da média (e é contada
 * à parte) em vez de entrar como zero: zero puxaria a média pra baixo dizendo
 * "usina ociosa" quando o que falta é cadastro.
 */
export function taxaOcupacaoMediaFrota(
  plants: { id: string; geracaoMediaMensal: number | null }[],
  consumoPorPlant: Map<string, ConsumoRateio>,
): OcupacaoFrota {
  let soma = 0;
  let consideradas = 0;
  let semGeracao = 0;
  let semRateio = 0;

  for (const p of plants) {
    const consumo = consumoPorPlant.get(p.id)?.consumoKwh ?? 0;
    const pct = taxaOcupacaoPct(consumo, p.geracaoMediaMensal);
    if (pct == null) {
      semGeracao++;
      continue;
    }
    soma += pct;
    consideradas++;
    if (!consumoPorPlant.has(p.id)) semRateio++;
  }

  return {
    media: consideradas > 0 ? soma / consideradas : null,
    usinasConsideradas: consideradas,
    usinasSemGeracao: semGeracao,
    usinasSemRateio: semRateio,
  };
}

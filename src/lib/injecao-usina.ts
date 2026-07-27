/**
 * Energia da usina que fica DISPONÍVEL PARA O RATEIO — a que de fato pode
 * virar crédito nas UCs beneficiárias.
 *
 * Fonte única do cap de remuneração, do saldo acumulado e do relatório do
 * investidor. Antes cada um calculava do seu jeito e podiam divergir.
 *
 * Regra por modo de instalação (`Plant.regraInstalacao`):
 *
 *  USINA_DEDICADA
 *    Toda a geração vai pra rede: `energiaInjetadaMedidorKwh`
 *    (fallback `geracaoInversorKwh` quando não há leitura de medidor).
 *
 *  USINA_CONSUMO_PROPRIO
 *    `energiaInjetadaMedidorKwh − energia injetada compensada na própria UC`
 *
 *    A UC geradora consome no local. Antes de sobrar crédito pras
 *    beneficiárias, a concessionária abate o consumo da própria geradora —
 *    é a linha "Energia Ativa Injetada TE/TUSD" (sem oUC/mUC) da fatura.
 *    Só o que passa disso é enviado às outras UCs. Usar o medidor cru
 *    superestimava a energia atribuída ao investidor.
 *
 *  USINA_CONSUMO_DESCONTADO
 *    `energiaInjetadaMedidorKwh + consumoInstantaneoKwh`
 *    O autoconsumo é descontado do investidor, então entra no total.
 */

export interface FaturaParaInjecao {
  energiaInjetadaMedidorKwh: number | null;
  geracaoInversorKwh: number | null;
  consumoInstantaneoKwh: number | null;
  energiaInjetadaPropriaTeKwh: number | null;
  energiaInjetadaPropriaTusdKwh: number | null;
}

/**
 * kWh compensados na própria UC geradora (autoconsumo abatido antes do rateio).
 *
 * TE e TUSD são o MESMO kWh reportado em duas componentes tarifárias — somar
 * os dois dobraria o valor. Prioriza TUSD; cai pra TE quando falta.
 */
export function injecaoAbatidaNaGeradora(
  bill: Pick<
    FaturaParaInjecao,
    "energiaInjetadaPropriaTeKwh" | "energiaInjetadaPropriaTusdKwh"
  >,
): number {
  return (
    bill.energiaInjetadaPropriaTusdKwh ??
    bill.energiaInjetadaPropriaTeKwh ??
    0
  );
}

export function injecaoDisponivelParaRateio(
  bill: FaturaParaInjecao,
  regraInstalacao: string | null,
  contexto?: string,
): number {
  const medidor = bill.energiaInjetadaMedidorKwh;
  const inversor = bill.geracaoInversorKwh ?? 0;

  if (regraInstalacao === "USINA_CONSUMO_PROPRIO") {
    if (medidor == null) return inversor;
    const abatido = injecaoAbatidaNaGeradora(bill);
    const liquido = medidor - abatido;
    if (liquido < 0) {
      // Anomalia de dado: a UC geradora não pode ter compensado mais do que o
      // medidor registrou de injeção. Sinaliza pro operador em vez de esconder.
      console.warn(
        `[injecao-usina] ${contexto ?? "fatura"}: injecao liquida negativa — ` +
          `medidor ${medidor} - abatido na geradora ${abatido} = ${liquido}. ` +
          `Usando 0. Conferir a fatura da usina.`,
      );
      return 0;
    }
    return liquido;
  }

  if (regraInstalacao === "USINA_CONSUMO_DESCONTADO") {
    if (medidor == null) return inversor;
    return medidor + (bill.consumoInstantaneoKwh ?? 0);
  }

  // USINA_DEDICADA (e usinas sem regra definida): tudo vai pra rede.
  return medidor ?? inversor;
}

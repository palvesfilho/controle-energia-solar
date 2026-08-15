/**
 * Preço do kWh que o solar de fato evita — regra ÚNICA do sistema.
 *
 * 🔑 **Grupo A tem DOIS preços de kWh: ponta e fora ponta.** O sistema
 * fotovoltaico impacta **apenas o fora ponta**, que é o horário em que há sol
 * (regra do Paulo, 06/08/2026). Então toda energia gerada pelo painel — o
 * consumo instantâneo, que nunca chega a ser comprada da distribuidora — vale
 * `TE + TUSD com tributos` do posto **FORA PONTA**.
 *
 * Usar a tarifa de ponta, ou a média dos dois postos, infla o benefício de
 * forma grosseira. GRÁFICA JACUI, jul/2026:
 *
 *   ponta       R$ 3,0104/kWh   ← 4,8× mais cara
 *   fora ponta  R$ 0,6276/kWh   ← este é o número certo
 *
 * E é exatamente esse o erro que o código fazia antes: `tarifaTusdComTributos`
 * de uma fatura Grupo A guarda a tarifa de **PONTA** (2,31950833 na JACUI), e
 * `tarifaTE` vem `null`. O consumo instantâneo saía valorado a R$ 2,32/kWh em
 * vez de R$ 0,63 — 3,7× o valor real.
 *
 * No Grupo B (posto único) existe um preço só e nada disso se aplica.
 *
 * 🔑 **De onde sai o "com tributos" por posto:** o banco NÃO guarda essa tarifa
 * por posto — guarda só a base (`tarifaTeForaPonta`, `tarifaTusdForaPonta`, sem
 * impostos). Mas guarda o valor cobrado e a quantidade de cada linha da fatura,
 * e `valor ÷ kWh` devolve o preço com tributos **exato**, o mesmo que está
 * impresso. Conferido na JACUI jul/26: 2977,80 ÷ 6954,3954 = 0,42818964 e
 * 1386,96 ÷ 6954,3954 = 0,19943646 — batem dígito a dígito com a fatura.
 *
 * O gross-up por `TRIBUTOS_EFETIVOS_PADRAO` fica só como último recurso, e
 * sempre marcado como `estimado` — anomalia se sinaliza, não se esconde.
 */

/** Alíquota efetiva média (ICMS+PIS+COFINS) — só para gross-up de emergência. */
export const TRIBUTOS_EFETIVOS_PADRAO = 0.25;

/**
 * 🚧 **Faixa de plausibilidade do preço do kWh (R$/kWh, com tributos).**
 *
 * O OCR do Infosimples rotaciona colunas e, em 43 faturas, `tarifaTusdComTributos`
 * guarda um VALOR em vez de uma tarifa: **R$ 852,00/kWh** no SANDRO, **R$ 7.059,00**
 * na DIMARZARI, onde o real é ~R$ 0,66. Sem trava, esse número entra na conta e
 * infla o resultado ~1.290×.
 *
 * O teto é folgado de propósito: a tarifa legítima mais cara medida na base é
 * **R$ 1,56/kWh** (Grupo A, posto de ponta, GRÁFICA JACUI). R$ 3,00 é quase o
 * dobro disso — nenhuma fatura real chega perto, e todo lixo do OCR é barrado.
 *
 * O piso pega o outro lado da rotação (campo que virou 0 ou centavo solto).
 *
 * Fora da faixa devolvemos `precoKwh: null` com motivo — **não** um palpite.
 * Quem chama decide o que fazer, mas nunca recebe um número inventado.
 * Conserto do dado: reparse do PDF ou preenchimento manual de TE/TUSD na
 * "Manutenção da fatura".
 */
export const PRECO_KWH_MIN = 0.05;
export const PRECO_KWH_MAX = 3.0;

function foraDaFaixa(preco: number): boolean {
  return !Number.isFinite(preco) || preco < PRECO_KWH_MIN || preco > PRECO_KWH_MAX;
}

/** Motivo padrão — texto único, aparece igual na cobrança e na remuneração. */
function motivoImplausivel(preco: number, posto: string): string {
  return (
    `Preço do kWh implausível (R$ ${preco.toFixed(2)}/kWh no posto ${posto}) — ` +
    `fora da faixa R$ ${PRECO_KWH_MIN.toFixed(2)}–${PRECO_KWH_MAX.toFixed(2)}. ` +
    `A tarifa da fatura está corrompida (OCR rotacionado). Corrija re-extraindo ` +
    `o PDF ou preenchendo TE/TUSD à mão em "Manutenção da fatura".`
  );
}

export interface PrecoKwhInput {
  // --- Grupo A, posto FORA PONTA ---
  /** Quantidade faturada de TE fora ponta (kWh) */
  consumoTeForaPontaKwh?: number | null;
  /** Valor cobrado de TE fora ponta (R$, já com tributos) */
  consumoTeForaPontaValor?: number | null;
  /** Quantidade faturada de TUSD fora ponta (kWh) */
  consumoTusdForaPontaKwh?: number | null;
  /** Valor cobrado de TUSD fora ponta (R$, já com tributos) */
  consumoTusdForaPontaValor?: number | null;
  /** Tarifa TE fora ponta SEM tributos (R$/kWh) — fallback */
  tarifaTeForaPonta?: number | null;
  /** Tarifa TUSD fora ponta SEM tributos (R$/kWh) — fallback */
  tarifaTusdForaPonta?: number | null;

  // --- Grupo B / posto único ---
  tarifaTeComTributos?: number | null;
  tarifaTusdComTributos?: number | null;
  tarifaTE?: number | null;
  tarifaTUSD?: number | null;
}

export interface PrecoKwhResultado {
  /** R$/kWh com tributos. `null` quando não deu para determinar. */
  precoKwh: number | null;
  /** Qual preço foi usado. `FORA_PONTA` = Grupo A; `UNICO` = Grupo B. */
  posto: "FORA_PONTA" | "UNICO" | null;
  /** `true` quando o preço não saiu inteiro da fatura (gross-up ou parcela faltando). */
  estimado: boolean;
  /** Texto pronto para virar aviso — vem quando `precoKwh` é null OU `estimado`. */
  motivo?: string;
  /**
   * `true` quando a tarifa da fatura está corrompida (fora de
   * [PRECO_KWH_MIN, PRECO_KWH_MAX]). `precoKwh` vem null junto. Distingue
   * "dado podre, conserta a fatura" de "dado ausente, não dá pra calcular".
   */
  implausivel?: boolean;
}

/** Uma parcela (TE ou TUSD): preferir valor÷kWh da fatura; senão gross-up. */
function parcela(
  valor: number | null | undefined,
  kwh: number | null | undefined,
  tarifaBase: number | null | undefined,
): { preco: number; estimado: boolean } | null {
  if (valor != null && kwh != null && kwh > 0) {
    // As linhas de crédito vêm negativas na fatura; as de consumo, positivas.
    // `abs` deixa a função indiferente ao sinal.
    return { preco: Math.abs(valor) / kwh, estimado: false };
  }
  if (tarifaBase != null && tarifaBase > 0) {
    return { preco: tarifaBase / (1 - TRIBUTOS_EFETIVOS_PADRAO), estimado: true };
  }
  return null;
}

/** `true` quando a fatura tem qualquer sinal de posto fora ponta (Grupo A). */
export function temPostoForaPonta(bill: PrecoKwhInput): boolean {
  return (
    bill.consumoTeForaPontaKwh != null ||
    bill.consumoTusdForaPontaKwh != null ||
    bill.tarifaTeForaPonta != null ||
    bill.tarifaTusdForaPonta != null
  );
}

/**
 * Preço do kWh a usar para valorar energia solar (consumo instantâneo e
 * qualquer conta de energia evitada).
 *
 * Grupo A → TE+TUSD com tributos do posto FORA PONTA.
 * Grupo B → tarifa cheia única, como sempre foi.
 */
export function precoKwhSolar(bill: PrecoKwhInput): PrecoKwhResultado {
  if (temPostoForaPonta(bill)) {
    const te = parcela(
      bill.consumoTeForaPontaValor,
      bill.consumoTeForaPontaKwh,
      bill.tarifaTeForaPonta,
    );
    const tusd = parcela(
      bill.consumoTusdForaPontaValor,
      bill.consumoTusdForaPontaKwh,
      bill.tarifaTusdForaPonta,
    );
    // Faltando uma das duas parcelas o preço sairia subestimado sem avisar.
    // Melhor devolver null e deixar o chamador sinalizar.
    if (!te || !tusd) {
      return {
        precoKwh: null,
        posto: "FORA_PONTA",
        estimado: false,
        motivo:
          "Fatura Grupo A sem " +
          (!te ? "TE" : "TUSD") +
          " fora ponta — não dá para valorar o solar sem inventar tarifa",
      };
    }
    const soma = te.preco + tusd.preco;
    if (foraDaFaixa(soma)) {
      return {
        precoKwh: null,
        posto: "FORA_PONTA",
        estimado: false,
        implausivel: true,
        motivo: motivoImplausivel(soma, "fora ponta"),
      };
    }
    return {
      precoKwh: soma,
      posto: "FORA_PONTA",
      estimado: te.estimado || tusd.estimado,
    };
  }

  // Grupo B / posto único — comportamento histórico preservado À RISCA, porque
  // este mesmo preço entra na COBRANÇA do cliente (billing-calculator) e mudá-lo
  // de lado, num ajuste que é sobre Grupo A, alteraria valores já emitidos.
  //
  // ⚠️ Inclusive o caso torto: com só UMA das duas tarifas preenchida, o preço
  // sai SUBESTIMADO (falta TE ou TUSD inteiro). Mantemos o número, mas marcamos
  // `estimado` com motivo — assim aparece como aviso em vez de passar calado.
  const te = bill.tarifaTeComTributos ?? null;
  const tusd = bill.tarifaTusdComTributos ?? null;
  if (te != null || tusd != null) {
    const soma = (te ?? 0) + (tusd ?? 0);
    if (soma > 0) {
      // 🚧 É AQUI que mora o R$ 852/kWh do SANDRO: `tarifaTusdComTributos`
      // guardando um valor. Barra antes de virar dinheiro.
      if (foraDaFaixa(soma)) {
        return {
          precoKwh: null,
          posto: "UNICO",
          estimado: false,
          implausivel: true,
          motivo: motivoImplausivel(soma, "único"),
        };
      }
      const faltando = te == null ? "TE" : tusd == null ? "TUSD" : null;
      return {
        precoKwh: soma,
        posto: "UNICO",
        estimado: faltando != null,
        motivo: faltando
          ? `Fatura sem tarifa ${faltando} com tributos — preço do kWh sai subestimado; reparsear o PDF preenche o campo`
          : undefined,
      };
    }
  }

  const base = (bill.tarifaTE ?? 0) + (bill.tarifaTUSD ?? 0);
  if (base > 0) {
    const grossUp = base / (1 - TRIBUTOS_EFETIVOS_PADRAO);
    if (foraDaFaixa(grossUp)) {
      return {
        precoKwh: null,
        posto: "UNICO",
        estimado: false,
        implausivel: true,
        motivo: motivoImplausivel(grossUp, "único (base sem tributos)"),
      };
    }
    return {
      precoKwh: grossUp,
      posto: "UNICO",
      estimado: true,
    };
  }

  return {
    precoKwh: null,
    posto: null,
    estimado: false,
    motivo: "Fatura sem tarifa TE/TUSD — não foi possível valorar o kWh",
  };
}

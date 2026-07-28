/**
 * Geração de dados do relatório de payback Brasil Solar (12 meses).
 *
 * Cruza geração dos inversores (Fronius/Huawei/Sungrow/SolarEdge) com a janela
 * de leitura de cada ConsumerBill da UC. Calcula economia mensal/acumulada e
 * payback restante contra o investimento total das usinas associadas.
 */

import { prisma } from "@/lib/prisma";
import { getRangeTotal as froniusRangeTotal } from "@/lib/fronius";
import { getRangeTotal as huaweiRangeTotal } from "@/lib/huawei";
import { getRangeTotal as sungrowRangeTotal } from "@/lib/sungrow";
import { getRangeTotal as solaredgeRangeTotal } from "@/lib/solaredge";
import { getRelatorioParametros } from "@/lib/app-settings";
import { formatCodigoUc } from "@/lib/uc-codigo";

/**
 * Carga tributária efetiva estimada para gross-up da tarifa de consumo
 * instantâneo (ICMS + PIS + COFINS "por dentro"). Padrão pra B1 RGE/RS.
 * Hoje hardcoded; futuramente pode vir de configuração da concessionária ou
 * da própria ConsumerBill quando os campos icms/pis/cofins estiverem em alíquota.
 */
const TRIBUTOS_EFETIVOS_PADRAO = 0.25;

/**
 * Campos da fatura (`ConsumerBill`) necessários pra calcular a "conta sem
 * energia solar". Todos os componentes de compensação vêm em R$ direto da
 * fatura RGE (as linhas de crédito vêm com sinal negativo → usamos o módulo).
 */
export interface ContaSemSolarInput {
  /** Valor líquido da fatura RGE (o que a UC efetivamente paga) */
  valorTotal: number | null;
  /** Rateio da usina (oUC/mUC) — crédito TE, negativo na fatura */
  injetadaOucTeValor: number | null;
  /** Rateio da usina (oUC/mUC) — crédito TUSD, negativo na fatura */
  injetadaOucTusdValor: number | null;
  /** Injeção do painel próprio — crédito TE */
  energiaInjetadaPropriaTeValor: number | null;
  /** Injeção do painel próprio — crédito TUSD */
  energiaInjetadaPropriaTusdValor: number | null;
  /** Ajuste de saldo de crédito GD (quando houver) */
  ajusteSaldoCredito: number | null;
  /** Créditos de bandeira tarifária (negativos na fatura) */
  bandeiraAmarelaCreditoValor: number | null;
  bandeiraVermelhaCreditoValor: number | null;
  bandeiraVermelha2CreditoValor: number | null;
  /** Tarifa cheia (TE com tributos, R$/kWh) — usada no autoconsumo instantâneo */
  tarifaTeComTributos: number | null;
  /** Tarifa cheia (TUSD com tributos, R$/kWh) */
  tarifaTusdComTributos: number | null;
}

/**
 * Campos opcionais usados APENAS como fallback quando a fatura não trouxe o
 * detalhamento das linhas de crédito em R$ (faturas antigas / parser incompleto).
 */
export interface EconomiaMensalInput extends ContaSemSolarInput {
  /** kWh compensados pelos créditos GD (própria + rateio) */
  energiaCompensada?: number | null;
  /** Tarifa TE sem tributos (R$/kWh) */
  tarifaTE?: number | null;
  /** Tarifa TUSD sem tributos (R$/kWh) */
  tarifaTUSD?: number | null;
}

/**
 * Economia do mês e conta sem energia solar, calculadas JUNTAS pra garantir a
 * identidade que o cliente confere na mão (Paulo, 2026-07-28):
 *
 *   economia = conta_sem_energia_solar − conta_com_energia_solar
 *   conta_com_energia_solar = valorTotal_RGE (o que a UC pagou de fato)
 *
 * As duas parcelas da economia são exatamente o que o solar deixou de cobrar:
 *
 *   compensacaoRs = |rateio oUC TE| + |rateio oUC TUSD|          ← créditos da usina
 *     + |injeção própria TE| + |injeção própria TUSD|            ← geração do painel
 *     + |ajuste de saldo| + |créditos de bandeira|               ← demais compensações
 *   autoconsumoRs = consumo_instantaneo_kWh
 *     × (tarifaTeComTributos + tarifaTusdComTributos)
 *
 * Os componentes de compensação vêm em R$ direto da fatura, somados em módulo
 * (as linhas de crédito vêm negativas). O autoconsumo instantâneo (energia
 * consumida direto do painel, que nunca passou pela concessionária) é valorado
 * pela tarifa cheia REAL da fatura, não por gross-up estimado.
 *
 * ⚠️ Fallback marcado como `estimada`: se a fatura não trouxe NENHUMA linha de
 * crédito em R$ (campos todos null) mas tem `energiaCompensada` > 0, valora os
 * kWh compensados por (tarifaTE + tarifaTUSD); se faltar a tarifa com tributos,
 * aplica o gross-up `TRIBUTOS_EFETIVOS_PADRAO` no autoconsumo. Sem isso a
 * economia apareceria como ~zero em fatura incompleta — anomalia deve ser
 * sinalizada, não silenciada.
 *
 * ⚠️ Os mesmos dados podem vir do Infosimples num formato diferente (outros
 * nomes de campo / agrupamento de linhas). Ao integrar por essa via, mapear as
 * grandezas para os campos de `ContaSemSolarInput` ANTES de chamar esta função.
 */
export interface EconomiaMensalDetalhe {
  /** Créditos solares que abateram a fatura, em R$ */
  compensacaoRs: number;
  /** Autoconsumo instantâneo × tarifa cheia da fatura, em R$ */
  autoconsumoRs: number;
  /** compensacaoRs + autoconsumoRs. `null` só quando não há dado nenhum. */
  economiaMensalRs: number | null;
  /** valorTotal + economia. `null` quando a fatura não tem `valorTotal`. */
  contaSemSolarRs: number | null;
  /** Alguma parcela veio de estimativa (fatura sem detalhamento em R$). */
  estimada: boolean;
}

export function calcularEconomiaMensal(
  bill: EconomiaMensalInput,
  consumoInstantaneoKwh: number | null,
): EconomiaMensalDetalhe {
  const mod = (v: number | null | undefined) => Math.abs(v ?? 0);
  const linhasCredito: (number | null)[] = [
    bill.injetadaOucTeValor,
    bill.injetadaOucTusdValor,
    bill.energiaInjetadaPropriaTeValor,
    bill.energiaInjetadaPropriaTusdValor,
    bill.ajusteSaldoCredito,
    bill.bandeiraAmarelaCreditoValor,
    bill.bandeiraVermelhaCreditoValor,
    bill.bandeiraVermelha2CreditoValor,
  ];
  const temDetalheEmReais = linhasCredito.some((v) => v != null);
  const tarifaBase = (bill.tarifaTE ?? 0) + (bill.tarifaTUSD ?? 0);

  let estimada = false;
  let compensacaoRs = linhasCredito.reduce<number>(
    (sum, v) => sum + mod(v),
    0,
  );
  if (!temDetalheEmReais && (bill.energiaCompensada ?? 0) > 0 && tarifaBase > 0) {
    compensacaoRs = (bill.energiaCompensada as number) * tarifaBase;
    estimada = true;
  }

  let autoconsumoRs = 0;
  if (consumoInstantaneoKwh != null && consumoInstantaneoKwh > 0) {
    const tarifaCheia =
      (bill.tarifaTeComTributos ?? 0) + (bill.tarifaTusdComTributos ?? 0);
    if (tarifaCheia > 0) {
      autoconsumoRs = consumoInstantaneoKwh * tarifaCheia;
    } else if (tarifaBase > 0) {
      autoconsumoRs =
        consumoInstantaneoKwh * (tarifaBase / (1 - TRIBUTOS_EFETIVOS_PADRAO));
      estimada = true;
    }
  }

  const semDadoAlgum =
    bill.valorTotal == null && compensacaoRs === 0 && autoconsumoRs === 0;
  const economiaMensalRs = semDadoAlgum ? null : compensacaoRs + autoconsumoRs;
  const contaSemSolarRs =
    bill.valorTotal == null ? null : bill.valorTotal + compensacaoRs + autoconsumoRs;

  return { compensacaoRs, autoconsumoRs, economiaMensalRs, contaSemSolarRs, estimada };
}

/**
 * Conta que o cliente teria SEM energia solar — atalho pra
 * `calcularEconomiaMensal(...).contaSemSolarRs`. Mantido como fonte da verdade
 * do KPI "Sem energia solar". Retorna `null` sem `valorTotal`.
 */
export function calcularContaSemSolar(
  bill: EconomiaMensalInput,
  consumoInstantaneoKwh: number | null,
): number | null {
  return calcularEconomiaMensal(bill, consumoInstantaneoKwh).contaSemSolarRs;
}

export interface RelatorioMonthRow {
  ano: number;
  mes: number;
  janela: {
    inicio: string | null;
    fim: string | null;
    fonte: "CICLO_LEITURA" | "MES_CALENDARIO";
  };
  geracaoInversorKwh: number | null;
  injetadaMedidorKwh: number | null;
  /** consumo da rede (o que veio na fatura RGE) — `ConsumerBill.consumoKwh` */
  consumoRedeKwh: number | null;
  /** Saldo acumulado de créditos GD do mês (do que sobrou da injeção, em kWh) */
  saldoCreditosKwh: number | null;
  /** consumo_instantaneo = geracao_inversor − injetada_medidor (null quando faltam dados; <0 marca anomalia) */
  consumoInstantaneoKwh: number | null;
  /** consumo TOTAL real do cliente = rede + instantâneo (o que o cliente efetivamente usou) */
  consumoTotalKwh: number | null;
  energiaCompensadaKwh: number | null;
  /** tarifa_TE + tarifa_TUSD (sem tributos) — usada na compensada */
  tarifaTotal: number | null;
  /** tarifa_base / (1 − aliquota_efetiva) — usada no consumo instantâneo */
  tarifaCompletaComTributos: number | null;
  /** Créditos solares abatidos na fatura, em R$ (linhas de crédito em módulo) */
  economiaCompensadaRs: number | null;
  /** consumo_instantaneo × tarifa cheia da fatura (null quando anomalia) */
  economiaInstantaneaRs: number | null;
  /**
   * Economia do mês = contaSemSolarRs − faturadoRs (identidade exata, por
   * construção). Some as duas parcelas acima. Ver `calcularEconomiaMensal`.
   */
  economiaMensalRs: number | null;
  /** Economia derivada de estimativa (fatura sem detalhamento em R$) */
  economiaEstimada: boolean;
  economiaAcumuladaRs: number;
  saldoPaybackRs: number;
  /** Faturado RGE (valor líquido pago à concessionária) */
  faturadoRs: number | null;
  /**
   * KPI "Sem energia solar": o que o cliente pagaria à concessionária se NÃO
   * tivesse a usina = fatura líquida atual + tudo que o solar deixou de cobrar
   * (compensada + autoconsumo instantâneo). Identidade auditável:
   * faturado + economia = conta sem solar. `null` quando faltam dados.
   */
  contaSemSolarRs: number | null;
  /** Desempenho % = geracaoInversor / geracaoEsperadaMensal × 100 */
  desempenhoPct: number | null;
  /** Retorno % no mês = economiaMensalRs / investimentoTotal × 100 */
  retornoPct: number | null;
  /** Sinaliza inconsistências (ex.: injeção > geração — possível perda de monitoramento) */
  anomalia: string | null;
  inversoresErros: string[];
}

export interface RelatorioData {
  proprietario: {
    id: string;
    nome: string;
    cidade: string | null;
    uf: string | null;
  };
  uc: {
    id: string;
    codigoUc: string;
    nome: string;
    distribuidora: string | null;
  };
  usinasMonitoradas: {
    id: string;
    nome: string;
    potenciaInstalada: number | null;
    investimento: number | null;
    plataforma: string | null;
  }[];
  investimentoTotal: number;
  potenciaTotalKwp: number;
  /** Soma do prognóstico mensal das usinas (BSC.geracaoMediaEsperada) */
  geracaoEsperadaMensalKwh: number;
  /** Soma do prognóstico anual das usinas (BSC.geracaoAnualEsperada) */
  geracaoEsperadaAnualKwh: number;
  economiaMediaMensalRs: number;
  /** Retorno total acumulado = economiaAcumulada / investimento × 100 */
  retornoTotalPct: number;
  /** Meses estimados até quitar (modelo com reajuste tarifa + depreciação módulos). */
  paybackRestanteMeses: number;
  /** Mês/ano em que a usina deve se pagar. `null` se não quitar em 50 anos. */
  paybackQuitacaoPrevista: { ano: number; mes: number } | null;
  paybackQuitado: boolean;
  /** Meses exibidos nos gráficos/tabela (últimos 12 até o mês de referência). */
  meses: RelatorioMonthRow[];
  /**
   * Total de faturas consideradas no acúmulo "desde a operação" (todos os meses
   * até o de referência, não só os 12 exibidos). Usado nos cards de somatório.
   */
  mesesComFatura?: number;
  /**
   * Diagnóstico "Situação da usina" (dimensionamento, créditos, desempenho).
   * `null` quando não há geração medida no período (relatório lite / usina sem
   * monitoramento) — sem geração não há o que diagnosticar.
   */
  situacao: SituacaoUsina | null;
}

// =============================================================================
// SITUAÇÃO DA USINA (diagnóstico automático)
// =============================================================================
//
// Resumo em linguagem de cliente respondendo: a usina atende meu consumo? sobra
// crédito? preciso ampliar? preciso fazer manutenção? Tudo derivado das médias
// do próprio histórico do relatório — nenhuma entrada manual.
//
// Faixas (decididas com Paulo em 2026-07-28; ajustar aqui, num lugar só):

/** Cobertura (geração ÷ consumo) considerada equilibrada. */
const COBERTURA_MIN_EQUILIBRIO = 0.9;
const COBERTURA_MAX_EQUILIBRIO = 1.15;
/** Abaixo disso a usina é claramente pequena pro consumo. */
const COBERTURA_DEFICIT_FORTE = 0.85;
/** Saldo de créditos acima de N meses de consumo = excedente ocioso. */
const SALDO_MESES_EXCEDENTE = 3;
/** Saldo abaixo de N meses de consumo = sem reserva pro inverno. */
const SALDO_MESES_RESERVA_MINIMA = 0.5;
/** Desempenho médio (real ÷ prognóstico) abaixo disso pede vistoria. */
const DESEMPENHO_BAIXO_PCT = 80;
const DESEMPENHO_BOM_PCT = 95;
/** Queda ano-a-ano (mesmos meses) que pede vistoria. */
const QUEDA_ANUAL_ALERTA_PCT = 15;
/** Mínimo de pares mês×mesmo-mês-ano-anterior pra opinar sobre queda. */
const MIN_PARES_ANO_ANTERIOR = 3;
/** Créditos de GD expiram em 60 meses (Lei 14.300). */
const VALIDADE_CREDITOS_MESES = 60;
/** Janela das médias: últimos 12 meses com fatura (ou todos, se menos). */
const JANELA_MEDIAS_MESES = 12;

export interface SituacaoUsinaItem {
  tema: "DIMENSIONAMENTO" | "CREDITOS" | "DESEMPENHO" | "MONITORAMENTO";
  /** OK = nada a fazer · ATENCAO = acompanhar · ACAO = precisa de decisão/vistoria */
  nivel: "OK" | "ATENCAO" | "ACAO";
  titulo: string;
  texto: string;
}

export interface SituacaoUsina {
  /** Meses usados nas médias (últimos 12 com fatura, ou todos se menos). */
  mesesConsiderados: number;
  /** Média mensal de geração do inversor no período (kWh) */
  geracaoMediaKwh: number | null;
  /** Média mensal de consumo TOTAL do cliente no período (kWh) */
  consumoMedioKwh: number | null;
  /** geracaoMedia ÷ consumoMedio × 100 */
  coberturaPct: number | null;
  /** Saldo de créditos GD da última fatura (kWh) */
  saldoCreditosKwh: number | null;
  /** Saldo ÷ consumo médio — "quantos meses de consumo o saldo cobre" */
  saldoEmMesesDeConsumo: number | null;
  /**
   * Geração mensal que FALTA pra empatar com o consumo (kWh/mês); `null` quando
   * a geração já cobre o consumo.
   *
   * ⚠️ Deliberadamente em kWh, NUNCA em kWp (Paulo, 2026-07-28): kWp depende de
   * orientação, inclinação, sombreamento e modelo de módulo — dimensionar é
   * trabalho do projeto, não do relatório. O relatório informa a lacuna de
   * energia; a potência necessária quem define é a engenharia.
   */
  deficitMensalKwh: number | null;
  /** Média do desempenho vs. prognóstico (null sem geracaoMediaEsperada) */
  desempenhoMedioPct: number | null;
  /** Variação % da geração vs. os MESMOS meses do ano anterior */
  variacaoAnoAnteriorPct: number | null;
  /** Veredito de uma linha, pra abrir a seção */
  resumo: string;
  itens: SituacaoUsinaItem[];
}

function media(valores: number[]): number | null {
  if (valores.length === 0) return null;
  return valores.reduce((a, b) => a + b, 0) / valores.length;
}

const fmtKwh = (v: number) =>
  `${Math.round(v).toLocaleString("pt-BR")} kWh`;

/** 5,5 (vírgula decimal) — texto vai direto pro cliente. */
const fmt1 = (v: number) =>
  v.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

/**
 * Monta o diagnóstico da usina a partir do histórico do relatório.
 *
 * Só considera meses com geração medida (> 0) nas médias de geração — mês em
 * que a usina não operava não deve puxar a média pra baixo. Retorna `null`
 * quando não há geração alguma (nada a diagnosticar).
 */
export function avaliarSituacaoUsina(
  meses: RelatorioMonthRow[],
  geracaoEsperadaMensalKwh: number,
): SituacaoUsina | null {
  if (meses.length === 0) return null;

  const janela = meses.slice(-JANELA_MEDIAS_MESES);
  const geracoes = janela
    .map((m) => m.geracaoInversorKwh)
    .filter((v): v is number => v != null && v > 0);
  if (geracoes.length === 0) return null;

  const consumos = janela
    .map((m) => m.consumoTotalKwh)
    .filter((v): v is number => v != null && v > 0);

  const geracaoMediaKwh = media(geracoes);
  const consumoMedioKwh = media(consumos);
  const coberturaPct =
    geracaoMediaKwh != null && consumoMedioKwh != null && consumoMedioKwh > 0
      ? (geracaoMediaKwh / consumoMedioKwh) * 100
      : null;

  const saldoCreditosKwh = meses[meses.length - 1].saldoCreditosKwh;
  const saldoEmMesesDeConsumo =
    saldoCreditosKwh != null && consumoMedioKwh != null && consumoMedioKwh > 0
      ? saldoCreditosKwh / consumoMedioKwh
      : null;

  // Lacuna de energia: quanto falta gerar por mês pra empatar com o consumo.
  // Em kWh — a conversão pra kWp é decisão de projeto (ver deficitMensalKwh).
  const diferencaKwh =
    geracaoMediaKwh != null && consumoMedioKwh != null
      ? consumoMedioKwh - geracaoMediaKwh
      : null;
  const deficitMensalKwh =
    diferencaKwh != null && diferencaKwh > 0 ? diferencaKwh : null;

  const desempenhoMedioPct =
    geracaoEsperadaMensalKwh > 0
      ? media(
          janela
            .map((m) => m.desempenhoPct)
            .filter((v): v is number => v != null),
        )
      : null;

  // Variação ano-a-ano: só compara mês com o MESMO mês do ano anterior, senão a
  // sazonalidade (verão × inverno) viraria "queda de desempenho".
  const porMes = new Map<string, number>();
  for (const m of meses) {
    if (m.geracaoInversorKwh != null && m.geracaoInversorKwh > 0)
      porMes.set(`${m.ano}-${m.mes}`, m.geracaoInversorKwh);
  }
  let somaAtual = 0;
  let somaAnterior = 0;
  let pares = 0;
  for (const m of janela) {
    const atual = porMes.get(`${m.ano}-${m.mes}`);
    const anterior = porMes.get(`${m.ano - 1}-${m.mes}`);
    if (atual != null && anterior != null) {
      somaAtual += atual;
      somaAnterior += anterior;
      pares++;
    }
  }
  const variacaoAnoAnteriorPct =
    pares >= MIN_PARES_ANO_ANTERIOR && somaAnterior > 0
      ? ((somaAtual - somaAnterior) / somaAnterior) * 100
      : null;

  const itens: SituacaoUsinaItem[] = [];

  // --- 1. Dimensionamento -----------------------------------------------------
  if (coberturaPct != null && geracaoMediaKwh != null && consumoMedioKwh != null) {
    const base = `A usina gerou em média ${fmtKwh(geracaoMediaKwh)}/mês e o consumo médio foi de ${fmtKwh(consumoMedioKwh)}/mês nos últimos ${janela.length} meses (cobertura de ${coberturaPct.toFixed(0)}%).`;
    if (coberturaPct < COBERTURA_DEFICIT_FORTE * 100) {
      itens.push({
        tema: "DIMENSIONAMENTO",
        nivel: "ACAO",
        titulo: "A usina é menor que o seu consumo",
        texto:
          `${base} ` +
          (deficitMensalKwh != null
            ? `Faltam em média ${fmtKwh(deficitMensalKwh)}/mês de geração para cobrir todo o consumo. `
            : "") +
          "Enquanto essa diferença existir, parte do consumo continua sendo paga à concessionária. Vale avaliar uma ampliação da usina com a nossa equipe técnica.",
      });
    } else if (coberturaPct < COBERTURA_MIN_EQUILIBRIO * 100) {
      itens.push({
        tema: "DIMENSIONAMENTO",
        nivel: "ATENCAO",
        titulo: "A usina está um pouco abaixo do consumo",
        texto:
          `${base} ` +
          (deficitMensalKwh != null
            ? `Faltam em média ${fmtKwh(deficitMensalKwh)}/mês de geração para zerar a diferença; `
            : "") +
          "nos meses de menor sol a fatura fica acima do mínimo.",
      });
    } else if (coberturaPct <= COBERTURA_MAX_EQUILIBRIO * 100) {
      itens.push({
        tema: "DIMENSIONAMENTO",
        nivel: "OK",
        titulo: "Usina bem dimensionada para o seu consumo",
        texto: `${base} Não há necessidade de ampliar: mantenha a usina como está.`,
      });
    } else {
      itens.push({
        tema: "DIMENSIONAMENTO",
        nivel: "OK",
        titulo: "A usina gera mais do que você consome",
        texto: `${base} A sobra de cerca de ${fmtKwh(geracaoMediaKwh - consumoMedioKwh)}/mês vira crédito de energia.`,
      });
    }
  }

  // --- 2. Créditos ------------------------------------------------------------
  if (saldoCreditosKwh != null && saldoEmMesesDeConsumo != null) {
    if (saldoEmMesesDeConsumo > SALDO_MESES_EXCEDENTE) {
      itens.push({
        tema: "CREDITOS",
        nivel: "ATENCAO",
        titulo: "Créditos acumulados acima do necessário",
        texto: `Há ${fmtKwh(saldoCreditosKwh)} de créditos acumulados — o equivalente a ${fmt1(saldoEmMesesDeConsumo)} meses do seu consumo. Créditos não utilizados expiram em ${VALIDADE_CREDITOS_MESES} meses. Vale destinar o excedente a outra unidade consumidora (rateio) ou passar mais consumo para a energia elétrica (climatização, aquecimento de água, carro elétrico).`,
      });
    } else if (saldoEmMesesDeConsumo < SALDO_MESES_RESERVA_MINIMA) {
      itens.push({
        tema: "CREDITOS",
        nivel: "ATENCAO",
        titulo: "Sem reserva de créditos",
        texto: `O saldo de créditos está em ${fmtKwh(saldoCreditosKwh)}. Sem reserva acumulada, os meses de menor geração (outono e inverno) chegam com a fatura mais alta.`,
      });
    } else {
      itens.push({
        tema: "CREDITOS",
        nivel: "OK",
        titulo: "Reserva de créditos saudável",
        texto: `Há ${fmtKwh(saldoCreditosKwh)} de créditos acumulados (${fmt1(saldoEmMesesDeConsumo)} meses de consumo), reserva adequada para os meses de menor geração.`,
      });
    }
  }

  // --- 3. Desempenho / manutenção --------------------------------------------
  if (desempenhoMedioPct != null) {
    if (desempenhoMedioPct < DESEMPENHO_BAIXO_PCT) {
      itens.push({
        tema: "DESEMPENHO",
        nivel: "ACAO",
        titulo: "Geração abaixo do previsto para a usina",
        texto: `A geração média ficou em ${desempenhoMedioPct.toFixed(0)}% do previsto (${fmtKwh(geracaoEsperadaMensalKwh)}/mês). Recomendamos vistoria: limpeza dos módulos, sombreamento novo (árvores, construções) e verificação do inversor.`,
      });
    } else if (desempenhoMedioPct < DESEMPENHO_BOM_PCT) {
      itens.push({
        tema: "DESEMPENHO",
        nivel: "ATENCAO",
        titulo: "Geração ligeiramente abaixo do previsto",
        texto: `A geração média ficou em ${desempenhoMedioPct.toFixed(0)}% do previsto. Uma limpeza dos módulos costuma recuperar boa parte dessa diferença.`,
      });
    } else {
      itens.push({
        tema: "DESEMPENHO",
        nivel: "OK",
        titulo: "Geração em linha com o previsto",
        texto: `A geração média ficou em ${desempenhoMedioPct.toFixed(0)}% do previsto para a usina — sem indício de perda de rendimento.`,
      });
    }
  } else if (variacaoAnoAnteriorPct != null) {
    if (variacaoAnoAnteriorPct < -QUEDA_ANUAL_ALERTA_PCT) {
      itens.push({
        tema: "DESEMPENHO",
        nivel: "ACAO",
        titulo: "Queda de geração frente ao ano anterior",
        texto: `Comparando os mesmos meses do ano anterior, a geração caiu ${Math.abs(variacaoAnoAnteriorPct).toFixed(0)}%. Recomendamos vistoria: limpeza dos módulos, sombreamento novo e verificação do inversor.`,
      });
    } else {
      itens.push({
        tema: "DESEMPENHO",
        nivel: "OK",
        titulo: "Geração estável frente ao ano anterior",
        texto: `Comparando os mesmos meses do ano anterior, a geração variou ${variacaoAnoAnteriorPct >= 0 ? "+" : ""}${variacaoAnoAnteriorPct.toFixed(0)}% — dentro do esperado para a sazonalidade.`,
      });
    }
  }

  // --- 4. Monitoramento (falha de comunicação nos meses recentes) ------------
  const recentesComAnomalia = janela.slice(-3).filter((m) => m.anomalia != null);
  if (recentesComAnomalia.length > 0) {
    itens.push({
      tema: "MONITORAMENTO",
      nivel: "ACAO",
      titulo: "Falha na comunicação do monitoramento",
      texto: `Em ${recentesComAnomalia.length} dos últimos 3 meses a geração reportada ficou abaixo da energia registrada pelo medidor da concessionária — sinal de que o inversor perdeu conexão. Os números de geração desses meses podem estar subestimados.`,
    });
  }

  // --- Veredito ---------------------------------------------------------------
  const temAcao = itens.some((i) => i.nivel === "ACAO");
  const vistoria = itens.find(
    (i) => i.nivel === "ACAO" && (i.tema === "DESEMPENHO" || i.tema === "MONITORAMENTO"),
  );
  const dimensionamento = itens.find((i) => i.tema === "DIMENSIONAMENTO");
  let resumo: string;
  if (vistoria) {
    resumo = "A usina precisa de uma vistoria — a geração está abaixo do que deveria.";
  } else if (dimensionamento?.nivel === "ACAO") {
    resumo = `A usina atende parte do consumo${deficitMensalKwh != null ? `: faltam cerca de ${fmtKwh(deficitMensalKwh)}/mês de geração para cobrir tudo` : ""}.`;
  } else if (
    coberturaPct != null &&
    coberturaPct > COBERTURA_MAX_EQUILIBRIO * 100 &&
    (saldoEmMesesDeConsumo ?? 0) > SALDO_MESES_EXCEDENTE
  ) {
    resumo =
      "A usina tem folga sobre o seu consumo: vale aproveitar o excedente em outra unidade.";
  } else if (temAcao) {
    resumo = "A usina está operando bem, com um ponto que pede atenção.";
  } else {
    resumo = "A usina está adequada ao seu consumo — siga como está.";
  }

  return {
    mesesConsiderados: janela.length,
    geracaoMediaKwh,
    consumoMedioKwh,
    coberturaPct,
    saldoCreditosKwh,
    saldoEmMesesDeConsumo,
    deficitMensalKwh,
    desempenhoMedioPct,
    variacaoAnoAnteriorPct,
    resumo,
    itens,
  };
}

/**
 * Modelo de payback projetado:
 * - Reajuste anual de tarifa de energia (default 7%, histórico CPFL/RGE)
 *   aumenta a economia mensal.
 * - Depreciação anual dos módulos fotovoltaicos (default 0,5%) reduz a
 *   geração ao longo do tempo.
 * Efeito líquido anual ≈ +6,46%/ano na economia. Editáveis em
 * `/admin/personalizacoes/relatorio-parametros` (model `AppSetting`).
 */
const LIMITE_PROJECAO_MESES = 50 * 12;

/**
 * Itera mês a mês a partir do último mês do relatório, aplicando o fator
 * mensal composto na economia base, até o saldo zerar. Retorna o mês/ano
 * em que a usina se paga + quantidade de meses projetados a partir do último.
 *
 * Retorna `null` se a economia base é 0 ou se não quita em 50 anos.
 */
function projetarPayback(
  saldoInicial: number,
  economiaMensalBase: number,
  ultimoMes: { ano: number; mes: number },
  reajusteTarifaAnual: number,
  depreciacaoModuloAnual: number,
): { ano: number; mes: number; mesesProjetados: number } | null {
  if (economiaMensalBase <= 0) return null;
  if (saldoInicial <= 0) {
    return { ano: ultimoMes.ano, mes: ultimoMes.mes, mesesProjetados: 0 };
  }

  const fatorAnual = (1 + reajusteTarifaAnual) * (1 - depreciacaoModuloAnual);
  const fatorMensal = Math.pow(fatorAnual, 1 / 12);

  let saldo = saldoInicial;
  let economiaMensal = economiaMensalBase;
  let mesesAvancados = 0;

  while (saldo > 0 && mesesAvancados < LIMITE_PROJECAO_MESES) {
    mesesAvancados++;
    saldo -= economiaMensal;
    economiaMensal *= fatorMensal;
  }
  if (saldo > 0) return null;

  let ano = ultimoMes.ano;
  let mes = ultimoMes.mes + mesesAvancados;
  while (mes > 12) {
    mes -= 12;
    ano += 1;
  }
  return { ano, mes, mesesProjetados: mesesAvancados };
}

async function sumGenerationForPeriod(
  monitoringClients: {
    id: string;
    plataformaMonitoramento: string | null;
    monitoramentoPlantId: string | null;
  }[],
  inicio: Date,
  fim: Date,
  /**
   * Se false, em cache miss NÃO bate na API (usa só MonitoringLog). Usado nos
   * meses antigos (só acúmulo) pra não disparar dezenas de chamadas e travar
   * o relatório. Os meses exibidos passam true (precisam do dado mais fiel).
   */
  permitirApi = true,
): Promise<{ totalKwh: number | null; erros: string[] }> {
  const erros: string[] = [];
  let total = 0;
  let qualquerSucesso = false;

  // Lê primeiro do banco (MonitoringLog) — sem bater na API. Cron diário
  // já mantém isso atualizado. Só bate na API se não houver log algum
  // pra esse cliente no período (cliente novo / sem cron rodado ainda).
  const clientIds = monitoringClients.map((c) => c.id);
  const cachedLogs = await prisma.monitoringLog.findMany({
    where: {
      clientId: { in: clientIds },
      data: { gte: inicio, lt: fim },
    },
    select: { clientId: true, geracaoDiaria: true },
  });
  const cachedByClient = new Map<string, number>();
  for (const log of cachedLogs) {
    cachedByClient.set(log.clientId, (cachedByClient.get(log.clientId) ?? 0) + log.geracaoDiaria);
  }

  for (const c of monitoringClients) {
    const platform = c.plataformaMonitoramento?.toUpperCase() ?? null;
    if (!platform || !c.monitoramentoPlantId) continue;

    // Cache hit: usa o que está no banco
    const cachedKwh = cachedByClient.get(c.id);
    if (cachedKwh != null && cachedKwh > 0) {
      total += cachedKwh;
      qualquerSucesso = true;
      continue;
    }

    // Sem cache: só bate na API se permitido (meses exibidos). Nos meses antigos
    // (só acúmulo) evita storm de chamadas → mantém o relatório rápido.
    if (!permitirApi) continue;

    // Cache miss: bate na API e (idealmente) o sync grava no banco depois
    try {
      let r: { totalKwh: number };
      if (platform === "FRONIUS") {
        r = await froniusRangeTotal(c.monitoramentoPlantId, inicio, fim);
      } else if (platform === "HUAWEI") {
        r = await huaweiRangeTotal(c.monitoramentoPlantId, inicio, fim);
      } else if (platform === "SUNGROW") {
        r = await sungrowRangeTotal(c.monitoramentoPlantId, inicio, fim);
      } else if (platform === "SOLAREDGE") {
        const siteId = parseInt(c.monitoramentoPlantId, 10);
        if (Number.isNaN(siteId)) {
          erros.push(`${c.id}: SolarEdge siteId inválido`);
          continue;
        }
        r = await solaredgeRangeTotal(siteId, inicio, fim);
      } else {
        erros.push(`${c.id}: plataforma '${platform}' não suportada`);
        continue;
      }
      total += r.totalKwh;
      qualquerSucesso = true;
    } catch (e) {
      erros.push(`${c.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { totalKwh: qualquerSucesso ? total : null, erros };
}

export async function getProprietarioRelatorio(
  proprietarioId: string,
  ucId: string,
  /**
   * Mês de referência do relatório. Quando informado, o relatório considera
   * apenas faturas ATÉ esse mês (nunca meses futuros) — um relatório de junho
   * não pode incluir dados de julho. Sem ref, usa as 12 faturas mais recentes.
   */
  refAno?: number,
  refMes?: number,
): Promise<RelatorioData | { error: string; status: number }> {
  const [proprietario, uc] = await Promise.all([
    prisma.brasilSolarProprietario.findUnique({
      where: { id: proprietarioId },
      select: { id: true, nome: true, cidade: true, uf: true, codigoUc: true },
    }),
    prisma.consumerUnit.findUnique({
      where: { id: ucId },
      select: {
        id: true,
        codigoUc: true,
        nome: true,
        distribuidora: true,
      },
    }),
  ]);

  if (!proprietario) return { error: "Proprietário não encontrado", status: 404 };
  if (!uc) return { error: "UC não encontrada", status: 404 };

  // Validação: a UC consultada precisa pertencer ao proprietário — pode ser
  // a UC titular (mesmo codigoUc) OU uma beneficiária ativa (autoconsumo
  // remoto com rateio).
  const ehTitular =
    proprietario.codigoUc != null && proprietario.codigoUc === uc.codigoUc;
  let ehBeneficiaria = false;
  if (!ehTitular) {
    const beneficiaria = await prisma.brasilSolarBeneficiaria.findFirst({
      where: { proprietarioId, consumerUnitId: ucId, active: true },
      select: { id: true },
    });
    ehBeneficiaria = beneficiaria != null;
  }
  if (!ehTitular && !ehBeneficiaria) {
    return {
      error: `UC ${formatCodigoUc(uc.codigoUc)} não pertence ao proprietário`,
      status: 403,
    };
  }

  // Pega TODAS as usinas monitoradas (BSC) ativas do proprietário.
  // Modelo atual: 1 proprietário Brasil Solar = 1 UC = N usinas físicas (BSCs)
  // injetando nessa UC. A ponte é o codigoUc do proprietário, não BSC.plantId.
  const monitoringClients = await prisma.brasilSolarClient.findMany({
    where: {
      proprietarioId,
      active: true,
    },
    select: {
      id: true,
      nome: true,
      plataformaMonitoramento: true,
      monitoramentoPlantId: true,
      potenciaInstalada: true,
      investimento: true,
      geracaoMediaEsperada: true,
      geracaoAnualEsperada: true,
    },
  });

  const investimentoTotal = monitoringClients.reduce(
    (sum, c) => sum + (c.investimento ?? 0),
    0,
  );
  const potenciaTotalKwp = monitoringClients.reduce(
    (sum, c) => sum + (c.potenciaInstalada ?? 0),
    0,
  );
  const geracaoEsperadaMensalKwh = monitoringClients.reduce(
    (sum, c) => sum + (c.geracaoMediaEsperada ?? 0),
    0,
  );
  const geracaoEsperadaAnualKwh = monitoringClients.reduce(
    (sum, c) => sum + (c.geracaoAnualEsperada ?? 0),
    0,
  );

  // Limita ao mês de referência: considera faturas ATÉ (refAno, refMes)
  // inclusive. Assim um relatório de junho nunca traz julho.
  const limitarAoMesRef =
    Number.isInteger(refAno) &&
    Number.isInteger(refMes) &&
    (refMes as number) >= 1 &&
    (refMes as number) <= 12;

  // TODAS as faturas até o mês de referência, em ordem cronológica (ASC).
  // O acúmulo "desde a operação" precisa de todos os meses; a exibição
  // (gráficos/tabela) usa só os últimos 12 — ver `meses` mais abaixo.
  const bills = await prisma.consumerBill.findMany({
    where: {
      consumerUnitId: ucId,
      ...(limitarAoMesRef
        ? {
            OR: [
              { anoReferencia: { lt: refAno } },
              { anoReferencia: refAno, mesReferencia: { lte: refMes } },
            ],
          }
        : {}),
    },
    orderBy: [{ anoReferencia: "asc" }, { mesReferencia: "asc" }],
    select: {
      anoReferencia: true,
      mesReferencia: true,
      dataLeituraAnterior: true,
      dataLeituraAtual: true,
      consumoKwh: true,
      energiaInjetadaMedidorKwh: true,
      energiaCompensada: true,
      saldoCreditos: true,
      tarifaTE: true,
      tarifaTUSD: true,
      valorTotal: true,
      // Campos da "conta sem energia solar" (ver calcularContaSemSolar)
      injetadaOucTeValor: true,
      injetadaOucTusdValor: true,
      energiaInjetadaPropriaTeValor: true,
      energiaInjetadaPropriaTusdValor: true,
      ajusteSaldoCredito: true,
      bandeiraAmarelaCreditoValor: true,
      bandeiraVermelhaCreditoValor: true,
      bandeiraVermelha2CreditoValor: true,
      tarifaTeComTributos: true,
      tarifaTusdComTributos: true,
    },
  });
  let economiaAcumulada = 0;
  const mesesAll: RelatorioMonthRow[] = [];

  // Só os meses exibidos (últimos 12) podem bater na API de monitoramento;
  // os anteriores (só acúmulo) usam apenas o cache pra não travar o relatório.
  const idxDisplayInicio = Math.max(0, bills.length - 12);
  for (let i = 0; i < bills.length; i++) {
    const bill = bills[i];
    const permitirApiMes = i >= idxDisplayInicio;
    let inicio: Date | null = bill.dataLeituraAnterior ?? null;
    let fim: Date | null = bill.dataLeituraAtual ?? null;
    let fonte: RelatorioMonthRow["janela"]["fonte"] = "CICLO_LEITURA";
    if (!inicio || !fim) {
      fonte = "MES_CALENDARIO";
      inicio = new Date(Date.UTC(bill.anoReferencia, bill.mesReferencia - 1, 1));
      fim = new Date(Date.UTC(bill.anoReferencia, bill.mesReferencia, 1));
    }

    const { totalKwh: geracaoInversorKwh, erros: inversoresErros } =
      await sumGenerationForPeriod(monitoringClients, inicio, fim, permitirApiMes);

    // === Tarifas ===
    const tarifaTotal =
      bill.tarifaTE != null && bill.tarifaTUSD != null
        ? bill.tarifaTE + bill.tarifaTUSD
        : null;
    const tarifaCompletaComTributos =
      tarifaTotal != null
        ? tarifaTotal / (1 - TRIBUTOS_EFETIVOS_PADRAO)
        : null;

    // === Consumo Instantâneo + anomalia ===
    // = geração inversor − injeção medidor (o que foi consumido na hora pela UC).
    // Se negativo → anomalia (típica: perda de WiFi do inversor faz a geração
    // reportada ficar abaixo da injeção real do medidor).
    let consumoInstantaneoKwh: number | null = null;
    let anomalia: string | null = null;
    if (geracaoInversorKwh != null && bill.energiaInjetadaMedidorKwh != null) {
      const diff = geracaoInversorKwh - bill.energiaInjetadaMedidorKwh;
      if (diff < 0) {
        anomalia =
          "Geração reportada incompleta no período — possível perda de conexão do monitoramento. Verifique o status do inversor.";
        // Não computa parcela instantânea (irrealista).
        consumoInstantaneoKwh = null;
      } else {
        consumoInstantaneoKwh = diff;
      }
    }

    // === Consumo TOTAL real do cliente = rede + autoconsumo instantâneo ===
    const consumoRedeKwh = bill.consumoKwh ?? null;
    const consumoTotalKwh =
      consumoRedeKwh != null
        ? consumoRedeKwh + (consumoInstantaneoKwh ?? 0)
        : null;

    // === Economia + conta sem energia solar (mesma fonte) ===
    // economia = conta sem solar − fatura paga. As duas parcelas vêm em R$ da
    // própria fatura: créditos compensados + autoconsumo instantâneo valorado
    // pela tarifa cheia. Ver `calcularEconomiaMensal`.
    const energiaCompensadaKwh = bill.energiaCompensada ?? null;
    const eco = calcularEconomiaMensal(bill, consumoInstantaneoKwh);
    const economiaMensalRs = eco.economiaMensalRs;
    const economiaCompensadaRs =
      economiaMensalRs == null ? null : eco.compensacaoRs;
    const economiaInstantaneaRs =
      economiaMensalRs == null ? null : eco.autoconsumoRs;
    const contaSemSolarRs = eco.contaSemSolarRs;

    economiaAcumulada += economiaMensalRs ?? 0;
    const saldoPaybackRs = investimentoTotal - economiaAcumulada;

    const desempenhoPct =
      geracaoInversorKwh != null && geracaoEsperadaMensalKwh > 0
        ? (geracaoInversorKwh / geracaoEsperadaMensalKwh) * 100
        : null;
    const retornoPct =
      economiaMensalRs != null && investimentoTotal > 0
        ? (economiaMensalRs / investimentoTotal) * 100
        : null;

    mesesAll.push({
      ano: bill.anoReferencia,
      mes: bill.mesReferencia,
      janela: {
        inicio: inicio.toISOString(),
        fim: fim.toISOString(),
        fonte,
      },
      geracaoInversorKwh,
      injetadaMedidorKwh: bill.energiaInjetadaMedidorKwh,
      consumoRedeKwh,
      consumoInstantaneoKwh,
      consumoTotalKwh,
      saldoCreditosKwh: bill.saldoCreditos,
      energiaCompensadaKwh,
      tarifaTotal,
      tarifaCompletaComTributos,
      economiaCompensadaRs,
      economiaInstantaneaRs,
      economiaMensalRs,
      economiaEstimada: eco.estimada,
      economiaAcumuladaRs: economiaAcumulada,
      saldoPaybackRs,
      faturadoRs: bill.valorTotal,
      contaSemSolarRs,
      desempenhoPct,
      retornoPct,
      anomalia,
      inversoresErros,
    });
  }

  // Tabela e acumulados usam TODOS os meses desde a operação (até o mês de
  // referência). Os gráficos fatiam os últimos 12 internamente pra ficarem
  // legíveis — ver GeneractionConsumptionBars / SaldoMensalBars.
  const meses = mesesAll;
  const mesesComFatura = mesesAll.length;

  const economiasValidas = mesesAll
    .map((m) => m.economiaMensalRs)
    .filter((v): v is number => v != null && v > 0);
  const economiaMediaMensalRs =
    economiasValidas.length > 0
      ? economiasValidas.reduce((a, b) => a + b, 0) / economiasValidas.length
      : 0;
  const saldoFinal =
    mesesAll.length > 0
      ? mesesAll[mesesAll.length - 1].saldoPaybackRs
      : investimentoTotal;
  const paybackQuitado = saldoFinal <= 0;

  const ultimoMes = mesesAll.length > 0
    ? { ano: mesesAll[mesesAll.length - 1].ano, mes: mesesAll[mesesAll.length - 1].mes }
    : { ano: new Date().getFullYear(), mes: new Date().getMonth() + 1 };
  const params = await getRelatorioParametros();
  const projecao = projetarPayback(
    saldoFinal,
    economiaMediaMensalRs,
    ultimoMes,
    params.reajusteTarifaAnual,
    params.depreciacaoModuloAnual,
  );
  const paybackRestanteMeses = projecao?.mesesProjetados ?? 0;
  const paybackQuitacaoPrevista = projecao
    ? { ano: projecao.ano, mes: projecao.mes }
    : null;

  const retornoTotalPct =
    investimentoTotal > 0 ? (economiaAcumulada / investimentoTotal) * 100 : 0;

  return {
    proprietario,
    uc: {
      id: uc.id,
      codigoUc: uc.codigoUc,
      nome: uc.nome,
      distribuidora: uc.distribuidora,
    },
    usinasMonitoradas: monitoringClients.map((c) => ({
      id: c.id,
      nome: c.nome,
      potenciaInstalada: c.potenciaInstalada,
      investimento: c.investimento,
      plataforma: c.plataformaMonitoramento,
    })),
    investimentoTotal,
    potenciaTotalKwp,
    geracaoEsperadaMensalKwh,
    geracaoEsperadaAnualKwh,
    economiaMediaMensalRs,
    retornoTotalPct,
    paybackRestanteMeses,
    paybackQuitacaoPrevista,
    paybackQuitado,
    meses,
    mesesComFatura,
    situacao: avaliarSituacaoUsina(meses, geracaoEsperadaMensalKwh),
  };
}

// =============================================================================
// MODO AGREGADO POR PROPRIETÁRIO (autoconsumo remoto com beneficiárias)
// =============================================================================
//
// Usado quando o cliente Brasil Solar (proprietário) tem uma usina dedicada
// que injeta tudo na rede via UC titular e distribui créditos pra N UCs
// beneficiárias via rateio. O "cliente do relatório" é o proprietário, não
// cada UC individualmente. Características distintas:
//
// - Geração e investimento da usina vêm do(s) BSC vinculado(s) ao proprietário
// - Energia injetada na rede e saldo de créditos vêm da fatura da UC TITULAR
// - Compensação / economia / fatura RGE vêm das beneficiárias (somadas)
// - Não existe consumo instantâneo (a usina é dedicada — injeta tudo)
// - Cada mês traz um breakdown por UC beneficiária pra mostrar o rateio

export interface RelatorioAgregadoBeneficiariaRow {
  ucId: string;
  codigoUc: string;
  nome: string;
  percentual: number;
  consumoRedeKwh: number | null;
  energiaCompensadaKwh: number | null;
  economiaMensalRs: number | null;
  faturadoRs: number | null;
  /** Conta que a beneficiária teria sem energia solar (ver calcularContaSemSolar) */
  contaSemSolarRs: number | null;
}

export interface RelatorioAgregadoMonthRow {
  ano: number;
  mes: number;
  janela: {
    inicio: string | null;
    fim: string | null;
    fonte: "CICLO_LEITURA" | "MES_CALENDARIO";
  };
  /** Soma das beneficiárias */
  consumoRedeKwhTotal: number | null;
  /** Soma das beneficiárias — kWh compensados pelos créditos GD */
  energiaCompensadaKwhTotal: number | null;
  /**
   * Soma das beneficiárias de (conta sem solar − fatura paga) = total de
   * créditos solares abatidos em R$. Ver `calcularEconomiaMensal`.
   */
  economiaMensalRs: number | null;
  /** Alguma beneficiária caiu no fallback estimado (fatura sem detalhe em R$) */
  economiaEstimada: boolean;
  economiaAcumuladaRs: number;
  /** Soma das faturas RGE das beneficiárias */
  faturadoRs: number | null;
  /** Soma das beneficiárias — conta sem energia solar (ver calcularContaSemSolar) */
  contaSemSolarRsTotal: number | null;
  /** Soma do saldo de créditos GD remanescente nas faturas das beneficiárias */
  saldoCreditosBeneficiariasTotal: number | null;
  /** Geração agregada do(s) inversor(es) no período (null sem Plant) */
  geracaoInversorKwh: number | null;
  /** Da fatura da UC titular — energia injetada na rede */
  injetadaMedidorKwh: number | null;
  /** Da fatura da UC titular — saldo de créditos GD acumulado */
  saldoCreditosTitular: number | null;
  /** Breakdown por UC beneficiária do mês */
  beneficiarias: RelatorioAgregadoBeneficiariaRow[];
  inversoresErros: string[];
}

export interface RelatorioAgregadoData {
  proprietario: {
    id: string;
    nome: string;
    cidade: string | null;
    uf: string | null;
  };
  titular: {
    ucId: string;
    codigoUc: string;
    distribuidora: string | null;
  } | null;
  beneficiarias: {
    ucId: string;
    codigoUc: string;
    nome: string;
    percentual: number;
  }[];
  usinasMonitoradas: {
    id: string;
    nome: string;
    potenciaInstalada: number | null;
    investimento: number | null;
    plataforma: string | null;
  }[];
  investimentoTotal: number;
  potenciaTotalKwp: number;
  geracaoEsperadaMensalKwh: number;
  geracaoEsperadaAnualKwh: number;
  economiaMediaMensalRs: number;
  retornoTotalPct: number;
  paybackRestanteMeses: number;
  paybackQuitacaoPrevista: { ano: number; mes: number } | null;
  paybackQuitado: boolean;
  meses: RelatorioAgregadoMonthRow[];
}

export async function getProprietarioRelatorioAgregado(
  proprietarioId: string,
  /** Mês de referência: considera períodos ATÉ ele (nunca meses futuros). */
  refAno?: number,
  refMes?: number,
): Promise<RelatorioAgregadoData | { error: string; status: number }> {
  const proprietario = await prisma.brasilSolarProprietario.findUnique({
    where: { id: proprietarioId },
    select: { id: true, nome: true, cidade: true, uf: true, codigoUc: true },
  });
  if (!proprietario)
    return { error: "Proprietário não encontrado", status: 404 };

  const beneficiariasRaw = await prisma.brasilSolarBeneficiaria.findMany({
    where: {
      proprietarioId,
      active: true,
      consumerUnitId: { not: null },
    },
    select: {
      codigoUc: true,
      nome: true,
      percentual: true,
      consumerUnitId: true,
      consumerUnit: {
        select: { id: true, codigoUc: true, nome: true, distribuidora: true },
      },
    },
  });
  const beneficiarias = beneficiariasRaw
    .filter((b) => b.consumerUnit != null)
    .map((b) => ({
      ucId: b.consumerUnit!.id,
      codigoUc: b.codigoUc,
      nome: b.nome ?? b.consumerUnit!.nome,
      percentual: b.percentual,
    }));

  if (beneficiarias.length === 0) {
    return {
      error:
        "Proprietário sem beneficiárias ativas — use o relatório por UC clássico",
      status: 400,
    };
  }

  let titular: RelatorioAgregadoData["titular"] = null;
  let ucTitularId: string | null = null;
  if (proprietario.codigoUc) {
    const ucTitular = await prisma.consumerUnit.findFirst({
      where: { codigoUc: proprietario.codigoUc },
      select: { id: true, codigoUc: true, distribuidora: true },
    });
    if (ucTitular) {
      titular = {
        ucId: ucTitular.id,
        codigoUc: ucTitular.codigoUc,
        distribuidora: ucTitular.distribuidora,
      };
      ucTitularId = ucTitular.id;
    }
  }

  const monitoringClients = await prisma.brasilSolarClient.findMany({
    where: { proprietarioId, active: true },
    select: {
      id: true,
      nome: true,
      plataformaMonitoramento: true,
      monitoramentoPlantId: true,
      potenciaInstalada: true,
      investimento: true,
      geracaoMediaEsperada: true,
      geracaoAnualEsperada: true,
    },
  });
  const investimentoTotal = monitoringClients.reduce(
    (s, c) => s + (c.investimento ?? 0),
    0,
  );
  const potenciaTotalKwp = monitoringClients.reduce(
    (s, c) => s + (c.potenciaInstalada ?? 0),
    0,
  );
  const geracaoEsperadaMensalKwh = monitoringClients.reduce(
    (s, c) => s + (c.geracaoMediaEsperada ?? 0),
    0,
  );
  const geracaoEsperadaAnualKwh = monitoringClients.reduce(
    (s, c) => s + (c.geracaoAnualEsperada ?? 0),
    0,
  );

  const ucIds: string[] = beneficiarias.map((b) => b.ucId);
  if (ucTitularId) ucIds.push(ucTitularId);

  const limitarAoMesRefAgg =
    Number.isInteger(refAno) &&
    Number.isInteger(refMes) &&
    (refMes as number) >= 1 &&
    (refMes as number) <= 12;

  // TODAS as faturas até o mês de referência (acúmulo "desde a operação").
  const todasBills = await prisma.consumerBill.findMany({
    where: {
      consumerUnitId: { in: ucIds },
      ...(limitarAoMesRefAgg
        ? {
            OR: [
              { anoReferencia: { lt: refAno } },
              { anoReferencia: refAno, mesReferencia: { lte: refMes } },
            ],
          }
        : {}),
    },
    orderBy: [{ anoReferencia: "desc" }, { mesReferencia: "desc" }],
    select: {
      consumerUnitId: true,
      anoReferencia: true,
      mesReferencia: true,
      dataLeituraAnterior: true,
      dataLeituraAtual: true,
      consumoKwh: true,
      energiaInjetadaMedidorKwh: true,
      energiaCompensada: true,
      saldoCreditos: true,
      tarifaTE: true,
      tarifaTUSD: true,
      valorTotal: true,
      // Campos da "conta sem energia solar" (ver calcularContaSemSolar)
      injetadaOucTeValor: true,
      injetadaOucTusdValor: true,
      energiaInjetadaPropriaTeValor: true,
      energiaInjetadaPropriaTusdValor: true,
      ajusteSaldoCredito: true,
      bandeiraAmarelaCreditoValor: true,
      bandeiraVermelhaCreditoValor: true,
      bandeiraVermelha2CreditoValor: true,
      tarifaTeComTributos: true,
      tarifaTusdComTributos: true,
    },
  });

  // Agrupa por (ano, mes). Mantém só os últimos 12 períodos onde HÁ fatura em
  // alguma beneficiária (titular sozinha não conta).
  const periodKey = (a: number, m: number) =>
    `${String(a).padStart(4, "0")}-${String(m).padStart(2, "0")}`;
  const billsByPeriod = new Map<string, typeof todasBills>();
  const periodsComBeneficiaria = new Set<string>();
  for (const b of todasBills) {
    if (!b.consumerUnitId) continue;
    const key = periodKey(b.anoReferencia, b.mesReferencia);
    if (!billsByPeriod.has(key)) billsByPeriod.set(key, []);
    billsByPeriod.get(key)!.push(b);
    if (b.consumerUnitId !== ucTitularId) periodsComBeneficiaria.add(key);
  }

  const sortedPeriods = Array.from(periodsComBeneficiaria).sort();
  // TODOS os períodos desde a operação (tabela + acúmulo). Os gráficos do PDF
  // agregado fatiam os últimos 12 internamente pra ficarem legíveis.
  const periodosUsados = sortedPeriods;

  const meses: RelatorioAgregadoMonthRow[] = [];
  let economiaAcumulada = 0;

  // Só os últimos 12 períodos podem bater na API; os anteriores usam só cache.
  const idxDisplayInicioAgg = Math.max(0, periodosUsados.length - 12);
  for (let pi = 0; pi < periodosUsados.length; pi++) {
    const key = periodosUsados[pi];
    const permitirApiMes = pi >= idxDisplayInicioAgg;
    const [anoStr, mesStr] = key.split("-");
    const ano = Number(anoStr);
    const mes = Number(mesStr);
    const billsDoMes = billsByPeriod.get(key) ?? [];
    const billsBenef = billsDoMes.filter(
      (b) => b.consumerUnitId !== ucTitularId,
    );
    const billTitular =
      billsDoMes.find((b) => b.consumerUnitId === ucTitularId) ?? null;

    // Janela do período: prefere ciclo de leitura da titular, senão da
    // primeira beneficiária com data, senão mês calendário.
    let inicio: Date | null = null;
    let fim: Date | null = null;
    let fonte: RelatorioAgregadoMonthRow["janela"]["fonte"] = "CICLO_LEITURA";
    if (billTitular?.dataLeituraAnterior && billTitular?.dataLeituraAtual) {
      inicio = billTitular.dataLeituraAnterior;
      fim = billTitular.dataLeituraAtual;
    } else {
      const refBill = billsBenef.find(
        (b) => b.dataLeituraAnterior && b.dataLeituraAtual,
      );
      if (refBill) {
        inicio = refBill.dataLeituraAnterior!;
        fim = refBill.dataLeituraAtual!;
      } else {
        fonte = "MES_CALENDARIO";
        inicio = new Date(Date.UTC(ano, mes - 1, 1));
        fim = new Date(Date.UTC(ano, mes, 1));
      }
    }

    const { totalKwh: geracaoInversorKwh, erros: inversoresErros } =
      await sumGenerationForPeriod(monitoringClients, inicio, fim, permitirApiMes);

    // Agrega beneficiárias e gera breakdown
    let consumoRedeTotal: number | null = null;
    let compensadoTotal: number | null = null;
    let economiaTotal: number | null = null;
    let faturadoTotal: number | null = null;
    let saldoBeneficiariasTotal: number | null = null;
    let contaSemSolarTotal: number | null = null;
    let algumaEstimada = false;
    const beneficiariasRows: RelatorioAgregadoBeneficiariaRow[] = [];

    for (const benef of beneficiarias) {
      const bill = billsBenef.find((b) => b.consumerUnitId === benef.ucId);
      if (!bill) {
        beneficiariasRows.push({
          ucId: benef.ucId,
          codigoUc: benef.codigoUc,
          nome: benef.nome,
          percentual: benef.percentual,
          consumoRedeKwh: null,
          energiaCompensadaKwh: null,
          economiaMensalRs: null,
          faturadoRs: null,
          contaSemSolarRs: null,
        });
        continue;
      }
      // Beneficiária não tem geração própria → sem autoconsumo instantâneo;
      // economia = conta sem solar − fatura paga (créditos abatidos em R$).
      const eco = calcularEconomiaMensal(bill, null);
      const economiaCompensadaRs = eco.economiaMensalRs;
      const contaSemSolarRs = eco.contaSemSolarRs;
      if (eco.estimada) algumaEstimada = true;
      beneficiariasRows.push({
        ucId: benef.ucId,
        codigoUc: benef.codigoUc,
        nome: benef.nome,
        percentual: benef.percentual,
        consumoRedeKwh: bill.consumoKwh,
        energiaCompensadaKwh: bill.energiaCompensada,
        economiaMensalRs: economiaCompensadaRs,
        faturadoRs: bill.valorTotal,
        contaSemSolarRs,
      });
      if (bill.consumoKwh != null)
        consumoRedeTotal = (consumoRedeTotal ?? 0) + bill.consumoKwh;
      if (bill.energiaCompensada != null)
        compensadoTotal = (compensadoTotal ?? 0) + bill.energiaCompensada;
      if (economiaCompensadaRs != null)
        economiaTotal = (economiaTotal ?? 0) + economiaCompensadaRs;
      if (bill.valorTotal != null)
        faturadoTotal = (faturadoTotal ?? 0) + bill.valorTotal;
      if (contaSemSolarRs != null)
        contaSemSolarTotal = (contaSemSolarTotal ?? 0) + contaSemSolarRs;
      if (bill.saldoCreditos != null)
        saldoBeneficiariasTotal =
          (saldoBeneficiariasTotal ?? 0) + bill.saldoCreditos;
    }

    economiaAcumulada += economiaTotal ?? 0;

    meses.push({
      ano,
      mes,
      janela: { inicio: inicio.toISOString(), fim: fim.toISOString(), fonte },
      consumoRedeKwhTotal: consumoRedeTotal,
      energiaCompensadaKwhTotal: compensadoTotal,
      economiaMensalRs: economiaTotal,
      economiaEstimada: algumaEstimada,
      economiaAcumuladaRs: economiaAcumulada,
      faturadoRs: faturadoTotal,
      contaSemSolarRsTotal: contaSemSolarTotal,
      saldoCreditosBeneficiariasTotal: saldoBeneficiariasTotal,
      geracaoInversorKwh,
      injetadaMedidorKwh: billTitular?.energiaInjetadaMedidorKwh ?? null,
      saldoCreditosTitular: billTitular?.saldoCreditos ?? null,
      beneficiarias: beneficiariasRows,
      inversoresErros,
    });
  }

  const economiasValidas = meses
    .map((m) => m.economiaMensalRs)
    .filter((v): v is number => v != null && v > 0);
  const economiaMediaMensalRs =
    economiasValidas.length > 0
      ? economiasValidas.reduce((a, b) => a + b, 0) / economiasValidas.length
      : 0;

  const saldoFinal =
    meses.length > 0
      ? investimentoTotal - meses[meses.length - 1].economiaAcumuladaRs
      : investimentoTotal;
  const paybackQuitado = saldoFinal <= 0;

  const ultimoMes =
    meses.length > 0
      ? { ano: meses[meses.length - 1].ano, mes: meses[meses.length - 1].mes }
      : { ano: new Date().getFullYear(), mes: new Date().getMonth() + 1 };
  const params = await getRelatorioParametros();
  const projecao = projetarPayback(
    saldoFinal,
    economiaMediaMensalRs,
    ultimoMes,
    params.reajusteTarifaAnual,
    params.depreciacaoModuloAnual,
  );
  const paybackRestanteMeses = projecao?.mesesProjetados ?? 0;
  const paybackQuitacaoPrevista = projecao
    ? { ano: projecao.ano, mes: projecao.mes }
    : null;

  const retornoTotalPct =
    investimentoTotal > 0 ? (economiaAcumulada / investimentoTotal) * 100 : 0;

  return {
    proprietario: {
      id: proprietario.id,
      nome: proprietario.nome,
      cidade: proprietario.cidade,
      uf: proprietario.uf,
    },
    titular,
    beneficiarias,
    usinasMonitoradas: monitoringClients.map((c) => ({
      id: c.id,
      nome: c.nome,
      potenciaInstalada: c.potenciaInstalada,
      investimento: c.investimento,
      plataforma: c.plataformaMonitoramento,
    })),
    investimentoTotal,
    potenciaTotalKwp,
    geracaoEsperadaMensalKwh,
    geracaoEsperadaAnualKwh,
    economiaMediaMensalRs,
    retornoTotalPct,
    paybackRestanteMeses,
    paybackQuitacaoPrevista,
    paybackQuitado,
    meses,
  };
}

// =============================================================================
// LISTAGEM DE RELATÓRIOS DO PROPRIETÁRIO (UCs disponíveis)
// =============================================================================
//
// Compartilhado entre o admin (`/api/brasil-solar/proprietarios/[id]/relatorios`)
// e o portal do cliente (`/api/portal-cliente/relatorios`). Lista as UCs com
// relatório: a titular (mesmo codigoUc do proprietário) + beneficiárias ativas.
// Cada UC traz os meses disponíveis (distintos, mais recente primeiro) pra
// alimentar o seletor de mês do PDF.

export interface RelatorioUcResumo {
  ucId: string;
  codigoUc: string;
  nome: string;
  distribuidora: string | null;
  active: boolean;
  papel: "TITULAR" | "BENEFICIARIA";
  percentual: number | null;
  usinasMonitoradas: number;
  potenciaTotalKwp: number;
  investimentoTotal: number;
  ultimaFatura: { anoReferencia: number; mesReferencia: number } | null;
  /** Meses com fatura disponível (distintos, mais recente primeiro). */
  meses: { ano: number; mes: number }[];
}

export interface RelatoriosListaProprietario {
  proprietario: {
    id: string;
    nome: string;
    cidade: string | null;
    uf: string | null;
  };
  ucs: RelatorioUcResumo[];
  /** Proprietário com beneficiárias → usar relatório consolidado (agregado). */
  temBeneficiarias: boolean;
}

export async function listarRelatoriosProprietario(
  proprietarioId: string,
): Promise<RelatoriosListaProprietario | { error: string; status: number }> {
  const proprietario = await prisma.brasilSolarProprietario.findUnique({
    where: { id: proprietarioId },
    select: { id: true, nome: true, cidade: true, uf: true, codigoUc: true },
  });
  if (!proprietario) {
    return { error: "Proprietário não encontrado", status: 404 };
  }

  // Coleta IDs das UCs: titular (busca por codigoUc) + beneficiárias.
  const ucIds = new Set<string>();
  let ucTitular:
    | { id: string; codigoUc: string; nome: string; distribuidora: string | null; active: boolean }
    | null = null;
  if (proprietario.codigoUc) {
    ucTitular = await prisma.consumerUnit.findFirst({
      where: { codigoUc: proprietario.codigoUc },
      select: { id: true, codigoUc: true, nome: true, distribuidora: true, active: true },
    });
    if (ucTitular) ucIds.add(ucTitular.id);
  }

  const beneficiarias = await prisma.brasilSolarBeneficiaria.findMany({
    where: { proprietarioId, active: true, consumerUnitId: { not: null } },
    select: {
      percentual: true,
      consumerUnit: {
        select: { id: true, codigoUc: true, nome: true, distribuidora: true, active: true },
      },
    },
  });
  const beneficiariasInfo = beneficiarias
    .filter((b) => b.consumerUnit != null)
    .map((b) => ({ uc: b.consumerUnit!, percentual: b.percentual }));
  for (const b of beneficiariasInfo) ucIds.add(b.uc.id);

  const proprietarioOut = {
    id: proprietario.id,
    nome: proprietario.nome,
    cidade: proprietario.cidade,
    uf: proprietario.uf,
  };
  const temBeneficiarias = beneficiariasInfo.length > 0;

  if (ucIds.size === 0) {
    return { proprietario: proprietarioOut, ucs: [], temBeneficiarias };
  }

  // Usinas monitoradas (BSCs) ativas do proprietário — totais usados nos cards.
  const monitoringClients = await prisma.brasilSolarClient.findMany({
    where: { proprietarioId, active: true },
    select: { id: true, potenciaInstalada: true, investimento: true },
  });
  const investimentoTotal = monitoringClients.reduce(
    (sum, c) => sum + (c.investimento ?? 0),
    0,
  );
  const potenciaTotalKwp = monitoringClients.reduce(
    (sum, c) => sum + (c.potenciaInstalada ?? 0),
    0,
  );

  // Faturas das UCs (metadados apenas), ordenadas desc. Deriva última fatura +
  // lista de meses distintos por UC numa só query.
  const todasBills = await prisma.consumerBill.findMany({
    where: { consumerUnitId: { in: Array.from(ucIds) } },
    orderBy: [{ anoReferencia: "desc" }, { mesReferencia: "desc" }],
    select: { consumerUnitId: true, anoReferencia: true, mesReferencia: true },
  });
  const ultimaBillByUc = new Map<string, { anoReferencia: number; mesReferencia: number }>();
  const mesesByUc = new Map<string, { ano: number; mes: number }[]>();
  const mesesSeenByUc = new Map<string, Set<string>>();
  for (const b of todasBills) {
    if (!b.consumerUnitId) continue;
    if (!ultimaBillByUc.has(b.consumerUnitId)) {
      ultimaBillByUc.set(b.consumerUnitId, {
        anoReferencia: b.anoReferencia,
        mesReferencia: b.mesReferencia,
      });
    }
    const key = `${b.anoReferencia}-${b.mesReferencia}`;
    let seen = mesesSeenByUc.get(b.consumerUnitId);
    if (!seen) {
      seen = new Set();
      mesesSeenByUc.set(b.consumerUnitId, seen);
      mesesByUc.set(b.consumerUnitId, []);
    }
    if (!seen.has(key)) {
      seen.add(key);
      mesesByUc.get(b.consumerUnitId)!.push({ ano: b.anoReferencia, mes: b.mesReferencia });
    }
  }

  const ucs: RelatorioUcResumo[] = [];
  if (ucTitular) {
    ucs.push({
      ucId: ucTitular.id,
      codigoUc: ucTitular.codigoUc,
      nome: ucTitular.nome,
      distribuidora: ucTitular.distribuidora,
      active: ucTitular.active,
      papel: "TITULAR",
      percentual: null,
      usinasMonitoradas: monitoringClients.length,
      potenciaTotalKwp,
      investimentoTotal,
      ultimaFatura: ultimaBillByUc.get(ucTitular.id) ?? null,
      meses: mesesByUc.get(ucTitular.id) ?? [],
    });
  }
  for (const b of beneficiariasInfo) {
    ucs.push({
      ucId: b.uc.id,
      codigoUc: b.uc.codigoUc,
      nome: b.uc.nome,
      distribuidora: b.uc.distribuidora,
      active: b.uc.active,
      papel: "BENEFICIARIA",
      percentual: b.percentual,
      usinasMonitoradas: monitoringClients.length,
      potenciaTotalKwp,
      investimentoTotal,
      ultimaFatura: ultimaBillByUc.get(b.uc.id) ?? null,
      meses: mesesByUc.get(b.uc.id) ?? [],
    });
  }

  return { proprietario: proprietarioOut, ucs, temBeneficiarias };
}

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
// Sungrow de propósito fora: seu getRangeTotal custa ~180 chamadas por mês.
// Ver PLATAFORMAS_SEM_FALLBACK_AO_VIVO abaixo.
import { getRangeTotal as solaredgeRangeTotal } from "@/lib/solaredge";
import { getRangeTotal as growattRangeTotal } from "@/lib/growatt";
import { getRelatorioParametros } from "@/lib/app-settings";
import { ehDiaSemDado } from "@/lib/dia-sem-dado";
import { formatCodigoUc, whereCodigoUc } from "@/lib/uc-codigo";
import {
  precoKwhSolar,
  TRIBUTOS_EFETIVOS_PADRAO,
  type PrecoKwhInput,
} from "@/lib/preco-kwh";
import {
  esperadaDoPeriodoKwh,
  esperadaMensalBaseTotalKwh,
} from "@/lib/geracao-esperada";

// `TRIBUTOS_EFETIVOS_PADRAO` (gross-up ICMS+PIS+COFINS "por dentro") mora em
// `lib/preco-kwh.ts`, junto da regra de preço do kWh — uma constante só.

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
  /** Tarifa cheia (TE com tributos, R$/kWh) — Grupo B / posto único */
  tarifaTeComTributos: number | null;
  /** Tarifa cheia (TUSD com tributos, R$/kWh) — Grupo B / posto único */
  tarifaTusdComTributos: number | null;
}

/**
 * Grupo A: campos do posto FORA PONTA, de onde sai o preço do kWh que o solar
 * evita. Opcionais — fatura Grupo B não os tem. Ver `lib/preco-kwh.ts`.
 */
export type ContaSemSolarInputGrupoA = Pick<
  PrecoKwhInput,
  | "consumoTeForaPontaKwh"
  | "consumoTeForaPontaValor"
  | "consumoTusdForaPontaKwh"
  | "consumoTusdForaPontaValor"
  | "tarifaTeForaPonta"
  | "tarifaTusdForaPonta"
>;

/**
 * Campos opcionais usados APENAS como fallback quando a fatura não trouxe o
 * detalhamento das linhas de crédito em R$ (faturas antigas / parser incompleto).
 */
export interface EconomiaMensalInput
  extends ContaSemSolarInput,
    ContaSemSolarInputGrupoA {
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
  /**
   * A parcela de autoconsumo instantâneo é DESCONHECIDA neste mês — a usina tem
   * geração própria, mas o período ficou sem dado de inversor (datalogger mudo,
   * ou geração menor que a injeção medida). Quando `true`, os valores acima são
   * PISO: contam só o que a fatura prova, e o total verdadeiro é maior.
   */
  autoconsumoIndisponivel: boolean;
}

export function calcularEconomiaMensal(
  bill: EconomiaMensalInput,
  consumoInstantaneoKwh: number | null,
  /**
   * `false` quando a UC TEM geração própria mas o período ficou sem dado de
   * inversor. Aí o autoconsumo é "não sei", não "zero" — ver a regra no fim
   * desta função. O padrão `true` cobre os dois casos em que zero é verdade:
   * a parcela não se aplica (beneficiária sem geração própria) ou
   * `consumoInstantaneoKwh` veio medido.
   */
  autoconsumoConhecido: boolean = true,
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
    // 🔑 No Grupo A o preço é o do posto FORA PONTA — é onde há sol. Usar a
    // tarifa cheia "única" aqui pegava a de PONTA e inflava o autoconsumo em
    // ~3,7×. Ver `precoKwhSolar` em `lib/preco-kwh.ts`.
    const preco = precoKwhSolar(bill);
    if (preco.precoKwh != null) {
      autoconsumoRs = consumoInstantaneoKwh * preco.precoKwh;
      if (preco.estimado) estimada = true;
    }
  }

  // 🔑 Autoconsumo desconhecido NÃO é autoconsumo zero. Sem dado de inversor no
  // período, o que a fatura prova (os créditos compensados em R$) continua
  // valendo integralmente — some só a parcela instantânea. Escrever "R$ 0,00" no
  // mês seria a mesma afirmação falsa que `ehDiaSemDado` mata na geração: o
  // cliente lê "não economizei nada" quando a verdade é "não sei quanto do
  // painel foi direto pro chuveiro". E NÃO se estima pela média — o padrão de
  // consumo é realidade do cliente, que não conhecemos (decisão do Paulo,
  // 13/08/2026).
  const autoconsumoIndisponivel = !autoconsumoConhecido;
  const semDadoAlgum =
    bill.valorTotal == null && compensacaoRs === 0 && autoconsumoRs === 0;

  let economiaMensalRs: number | null;
  let contaSemSolarRs: number | null;
  if (autoconsumoIndisponivel) {
    // Só a parcela provada pela fatura. Sem ela, nada a afirmar: `null`
    // ("indisponível"), nunca 0.
    economiaMensalRs = compensacaoRs > 0 ? compensacaoRs : null;
    contaSemSolarRs =
      economiaMensalRs != null && bill.valorTotal != null
        ? bill.valorTotal + compensacaoRs
        : null;
  } else {
    economiaMensalRs = semDadoAlgum ? null : compensacaoRs + autoconsumoRs;
    contaSemSolarRs =
      bill.valorTotal == null
        ? null
        : bill.valorTotal + compensacaoRs + autoconsumoRs;
  }
  // Nos dois ramos vale a identidade que o Paulo confere na mão:
  //   economia = contaSemSolar − faturado

  return {
    compensacaoRs,
    autoconsumoRs,
    economiaMensalRs,
    contaSemSolarRs,
    estimada,
    autoconsumoIndisponivel,
  };
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
  /**
   * Parte de `geracaoInversorKwh` que veio de lançamento MANUAL (a plataforma de
   * monitoramento não integra / não enviou). > 0 obriga a sinalizar o mês como
   * informado, não medido — ver src/lib/geracao-manual.ts.
   */
  geracaoManualKwh: number;
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
  /**
   * A usina tem geração própria, mas o período ficou SEM dado de inversor —
   * então `economiaMensalRs` conta só o que a fatura prova e é um PISO, e
   * `economiaInstantaneaRs` é desconhecida (não zero). A tela precisa avisar,
   * não exibir R$ 0,00. Ver `calcularEconomiaMensal`.
   */
  autoconsumoIndisponivel: boolean;
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
  /**
   * Prognóstico de geração DESTE período (kWh), já corrigido pela curva
   * sazonal e pelo tamanho do ciclo de leitura. `null` sem prognóstico.
   */
  geracaoEsperadaPeriodoKwh: number | null;
  /** Desempenho % = geracaoInversor / geracaoEsperadaPeriodo × 100 */
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
  /**
   * Soma do prognóstico mensal MÉDIO das usinas — `geracaoMediaEsperada`, ou
   * `geracaoAnualEsperada ÷ 12` quando a mensal não foi cadastrada. É a média
   * do ano: o esperado de cada mês sai em `RelatorioMonthRow.geracaoEsperadaPeriodoKwh`,
   * já com sazonalidade.
   */
  geracaoEsperadaMensalKwh: number;
  /** Soma do prognóstico anual das usinas (BSC.geracaoAnualEsperada) */
  geracaoEsperadaAnualKwh: number;
  economiaMediaMensalRs: number;
  /**
   * Quantos meses ficaram sem dado de inversor e por isso contam só a parcela
   * que a fatura prova. Maior que zero ⇒ `economiaMediaMensalRs`,
   * `retornoTotalPct` e o payback são PISO, não valor fechado — a tela avisa
   * em vez de exibir zero. Ver `RelatorioMonthRow.autoconsumoIndisponivel`.
   */
  mesesEconomiaParcial: number;
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
  /**
   * Preenchido EXATAMENTE quando `situacao` é `null` — diz, em texto de
   * cliente, por que a análise não pôde ser feita. Nunca os dois ao mesmo
   * tempo, nunca os dois vazios: a ausência do diagnóstico é informação e o
   * relatório precisa dizê-la, em vez de terminar sem explicação.
   */
  situacaoIndisponivel: SituacaoIndisponivel | null;
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
/** Competência para o texto do cliente ("de 05/2025 a 04/2026"). */
const rotuloCompetencia = (m: { ano: number; mes: number }) =>
  `${String(m.mes).padStart(2, "0")}/${m.ano}`;

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
  /**
   * Tamanho da janela de ciclo: meses CONSECUTIVOS com geração e consumo
   * conhecidos sobre os quais `coberturaPct` foi somada. Ver `janelaDeCiclo`.
   */
  mesesPareados: number;
  /** Primeiro e último mês da janela de ciclo (para o texto dizer o período). */
  cicloInicio: { ano: number; mes: number } | null;
  cicloFim: { ano: number; mes: number } | null;
  /**
   * `true` quando a janela de ciclo tem menos que 12 meses consecutivos — ou
   * seja, não dá para garantir um número inteiro de ciclos de leitura.
   *
   * Nesse estado o diagnóstico continua saindo — sumir com ele seria pior —
   * mas NUNCA como `ACAO`, e o texto diz sobre quantos meses ele se apoia. Uma
   * recomendação de ampliar usina não pode nascer de uma lacuna de medição.
   */
  baseIncompleta: boolean;
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
  /**
   * Média do desempenho vs. prognóstico do período, só de meses em que a
   * usina gerou. `null` quando não há prognóstico (nem mensal nem anual).
   */
  desempenhoMedioPct: number | null;
  /** Variação % da geração vs. os MESMOS meses do ano anterior */
  variacaoAnoAnteriorPct: number | null;
  /** Veredito de uma linha, pra abrir a seção */
  resumo: string;
  itens: SituacaoUsinaItem[];
}

/**
 * Por que a "Situação da usina" NÃO pôde ser apurada.
 *
 * 🔑 Até 03/09/2026 o diagnóstico simplesmente sumia do relatório quando
 * `avaliarSituacaoUsina` devolvia `null`: o PDF renderiza a seção sob
 * `{data.situacao && ...}`, então o cliente recebia o documento terminando
 * abruptamente, sem uma linha explicando a ausência — e o operador que gerou
 * também não era avisado. Foi assim que o Gliomar Bolson recebeu 31 meses de
 * relatório sem análise nenhuma (proprietário sem `BrasilSolarClient`, logo
 * sem geração medida).
 *
 * A ausência agora é INFORMAÇÃO, não silêncio: o relatório diz o que falta e
 * o que já dá pra afirmar mesmo assim.
 */
export type MotivoSemSituacao =
  /** Nenhuma usina monitorada vinculada ao proprietário — não temos acesso ao inversor. */
  | "SEM_USINA_MONITORADA"
  /** Usina vinculada, mas nenhum mês da janela trouxe leitura de geração. */
  | "SEM_GERACAO_MEDIDA"
  /** Nenhuma fatura no período — não há histórico sobre o que opinar. */
  | "SEM_HISTORICO";

export interface SituacaoIndisponivel {
  motivo: MotivoSemSituacao;
  titulo: string;
  /**
   * Texto que vai ao CLIENTE, no lugar da análise. Sem emoji e sem os glifos
   * que a Helvetica embutida do `@react-pdf` não desenha (≥ − ⚠ →) — ver
   * [[feedback_pdf_helvetica_winansi_glifos]].
   */
  texto: string;
  /** Complemento dirigido ao OPERADOR (tela do admin), não ao cliente. */
  acaoInterna: string;
}

/**
 * Traduz a ausência do diagnóstico em texto. Só é chamada quando
 * `avaliarSituacaoUsina` devolveu `null`, e é derivada do MESMO resultado —
 * assim os dois nunca aparecem juntos nem somem juntos, que é o modo de falha
 * de [[feedback_correcao_pela_metade_falha_calada]].
 */
export function explicarSituacaoIndisponivel(
  meses: RelatorioMonthRow[],
  usinasMonitoradas: number,
): SituacaoIndisponivel {
  if (meses.length === 0) {
    return {
      motivo: "SEM_HISTORICO",
      titulo: "Análise indisponível neste período",
      texto:
        "Ainda não há faturas registradas no período deste relatório, então não é possível " +
        "apurar consumo, cobertura nem saldo de créditos. Assim que as faturas do período " +
        "forem processadas, a análise passa a sair automaticamente no relatório.",
      acaoInterna:
        "Nenhuma fatura no período. Verifique o cadastro/sincronização de faturas desta UC.",
    };
  }
  if (usinasMonitoradas === 0) {
    return {
      motivo: "SEM_USINA_MONITORADA",
      titulo: "Análise da usina indisponível: sem acesso ao monitoramento",
      texto:
        "Não é possível apresentar a análise da usina neste relatório porque ainda não temos " +
        "acesso ao monitoramento do seu inversor. Sem a leitura de geração não dá para calcular " +
        "quanto a usina produziu, a cobertura em relação ao seu consumo, o desempenho frente ao " +
        "previsto nem o retorno do investimento. Os números de consumo, compensação e economia " +
        "que aparecem acima vêm das suas faturas e continuam válidos. Para liberar a análise " +
        "completa, basta nos dar acesso ao portal de monitoramento do inversor (usuário e senha " +
        "da plataforma do fabricante). Fale com a nossa equipe que fazemos a configuração.",
      acaoInterna:
        "Proprietário sem usina monitorada (BrasilSolarClient) vinculada. Cadastre a usina com a " +
        "plataforma de monitoramento e o ID da planta para liberar a análise.",
    };
  }
  return {
    motivo: "SEM_GERACAO_MEDIDA",
    titulo: "Análise da usina indisponível: sem leitura de geração no período",
    texto:
      "A usina está cadastrada, mas o monitoramento não enviou nenhuma leitura de geração nos " +
      "meses deste relatório. Sem esse dado não dá para calcular produção, cobertura, desempenho " +
      "nem retorno do investimento. Os números de consumo, compensação e economia acima vêm das " +
      "suas faturas e continuam válidos. Nossa equipe já foi acionada para restabelecer a " +
      "comunicação com o inversor.",
    acaoInterna:
      "Usina vinculada, porém sem leitura de geração na janela do relatório. Verifique credenciais " +
      "da plataforma, o vínculo do monitoramento e o datalogger da usina.",
  };
}

function media(valores: number[]): number | null {
  if (valores.length === 0) return null;
  return valores.reduce((a, b) => a + b, 0) / valores.length;
}

/** Mês completo = tem geração medida E consumo faturado. */
function mesCompleto(m: RelatorioMonthRow): boolean {
  return (
    m.geracaoInversorKwh != null &&
    m.geracaoInversorKwh > 0 &&
    m.consumoTotalKwh != null &&
    m.consumoTotalKwh > 0
  );
}

/** `a` é o mês de calendário imediatamente anterior a `b`? */
function ehMesAnterior(a: RelatorioMonthRow, b: RelatorioMonthRow): boolean {
  const anterior = b.mes === 1 ? { ano: b.ano - 1, mes: 12 } : { ano: b.ano, mes: b.mes - 1 };
  return a.ano === anterior.ano && a.mes === anterior.mes;
}

/**
 * A janela sobre a qual a cobertura é calculada: a sequência de meses
 * CONSECUTIVOS e COMPLETOS mais recente, com teto de `JANELA_MEDIAS_MESES`.
 *
 * ## Por que somar sobre um ciclo, e não tirar média de meses soltos
 *
 * "Consumo do mês" na fatura não é o consumo daquele mês quando a
 * concessionária não lê o medidor todo mês. Na UC do SANDRO a RGE lê de 3 em 3
 * meses: jan/2026 veio com 3.272 kWh (três meses de consumo real, apurados de
 * uma vez) e fev/2026 com 110 kWh (estimado). O consumo é o mesmo nos dois
 * meses — o que muda é quando a distribuidora o reconhece.
 *
 * Tirar média mensal sobre um SUBCONJUNTO desses meses enviesa conforme quais
 * meses entram: pegar os meses de leitura infla, pegar os estimados esvazia.
 * Foi assim que a mesma UC mediu 90% de cobertura por uma fórmula e 63,7% por
 * outra, sendo ~74% a conta feita sobre 12 meses fechados.
 *
 * Somar resolve, porque a estimativa é acertada na leitura seguinte: ao longo
 * de um ciclo inteiro, o total faturado converge para o total consumido. E 12
 * meses fecham um número INTEIRO de ciclos para todos os ritmos usados no
 * Brasil (mensal, bimestral, trimestral, semestral, anual) — daí o teto ser 12
 * e não um número qualquer.
 *
 * ## Por que consecutivos
 *
 * Um buraco no meio quebra a compensação: se falta justamente o mês da leitura,
 * ficam no somatório só os estimados, e o consumo do período aparece como uma
 * fração do real. Por isso a janela para no primeiro mês incompleto em vez de
 * pular por cima dele.
 *
 * Menos de 12 meses consecutivos ⇒ `baseIncompleta`: a conta ainda é a melhor
 * disponível, mas não se pode garantir ciclo fechado, e o diagnóstico sai
 * rebaixado e com ressalva.
 */
export function janelaDeCiclo(meses: RelatorioMonthRow[]): RelatorioMonthRow[] {
  const ciclo: RelatorioMonthRow[] = [];
  for (let i = meses.length - 1; i >= 0; i--) {
    const m = meses[i];
    if (!mesCompleto(m)) {
      // Ainda não começou a contar: segue procurando um fim de janela mais
      // antigo (o datalogger pode ter morrido nos últimos meses).
      if (ciclo.length === 0) continue;
      break;
    }
    // Já tem sequência: o mês só entra se for o anterior imediato.
    if (ciclo.length > 0 && !ehMesAnterior(m, ciclo[0])) break;
    ciclo.unshift(m);
    if (ciclo.length === JANELA_MEDIAS_MESES) break;
  }
  return ciclo;
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

  const ciclo = janelaDeCiclo(meses);
  const mesesPareados = ciclo.length;
  const baseIncompleta = mesesPareados < JANELA_MEDIAS_MESES;

  // Somas sobre a MESMA sequência de meses — ver `janelaDeCiclo`.
  const somaGeracao = ciclo.reduce((s, m) => s + m.geracaoInversorKwh!, 0);
  const somaConsumo = ciclo.reduce((s, m) => s + m.consumoTotalKwh!, 0);

  const geracaoMediaKwh = mesesPareados > 0 ? somaGeracao / mesesPareados : null;
  const consumoMedioKwh = mesesPareados > 0 ? somaConsumo / mesesPareados : null;
  const coberturaPct = somaConsumo > 0 ? (somaGeracao / somaConsumo) * 100 : null;

  const cicloInicio = ciclo.length ? { ano: ciclo[0].ano, mes: ciclo[0].mes } : null;
  const cicloFim = ciclo.length
    ? { ano: ciclo[ciclo.length - 1].ano, mes: ciclo[ciclo.length - 1].mes }
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

  // Mesma regra da média de geração: mês em que a usina não operou (geração 0,
  // ou monitoramento ainda não vinculado) não entra. Senão o mês anterior à
  // entrada em operação entra como 0% e derruba a média — foi o caso do TANER,
  // com out/25 zerado puxando 100% para 90% e acusando "abaixo do previsto".
  const desempenhoMedioPct =
    geracaoEsperadaMensalKwh > 0
      ? media(
          janela
            .filter((m) => (m.geracaoInversorKwh ?? 0) > 0)
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
    // O período citado é o da janela de CICLO, não o tamanho nominal da
    // janela: dizer "nos últimos 12 meses" quando só 8 sustentam a conta é
    // afirmar mais do que se mediu.
    const periodo =
      cicloInicio && cicloFim
        ? mesesPareados === 1
          ? ` em ${rotuloCompetencia(cicloFim)}`
          : ` de ${rotuloCompetencia(cicloInicio)} a ${rotuloCompetencia(cicloFim)}`
        : "";
    const base =
      `A usina gerou em média ${fmtKwh(geracaoMediaKwh)}/mês e o consumo médio foi de ` +
      `${fmtKwh(consumoMedioKwh)}/mês${periodo} ` +
      `(${mesesPareados} ${mesesPareados === 1 ? "mês" : "meses"} de medição completa, cobertura de ${coberturaPct.toFixed(0)}%).`;
    // Aviso que acompanha o diagnóstico quando a base é fina. Vai no TEXTO, e
    // não num campo novo, de propósito: assim tela, PDF e ação comercial
    // herdam sem precisar ser alterados um a um — o modo de falha de
    // [[feedback_correcao_pela_metade_falha_calada]].
    //
    // Sem emoji de propósito: este texto é renderizado também pelo
    // `@react-pdf` (`solar-payback-report-pdf.tsx`), cuja fonte embutida não
    // tem glifo de emoji — o aviso sairia como quadrado vazio justamente no
    // documento que vai ao cliente.
    const ressalva = baseIncompleta
      ? ` Atenção: este diagnóstico se apoia em ${mesesPareados} ${mesesPareados === 1 ? "mês" : "meses"} seguidos de medição completa, menos que os 12 que fecham um ciclo inteiro de leitura da distribuidora — trate-o como indicativo, não como conclusão fechada.`
      : "";
    if (coberturaPct < COBERTURA_DEFICIT_FORTE * 100 && !baseIncompleta) {
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
    } else if (coberturaPct < COBERTURA_DEFICIT_FORTE * 100) {
      // Mesma leitura do caso acima, mas com base fina: informa a lacuna e
      // convida a conversar, sem disparar recomendação de ampliação.
      itens.push({
        tema: "DIMENSIONAMENTO",
        nivel: "ATENCAO",
        titulo: "Indício de que a usina é menor que o seu consumo",
        texto:
          `${base} ` +
          (deficitMensalKwh != null
            ? `Pelos meses medidos, faltariam cerca de ${fmtKwh(deficitMensalKwh)}/mês de geração para cobrir todo o consumo. `
            : "") +
          "Antes de considerar uma ampliação, vale completar o histórico de medição." +
          ressalva,
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
          "nos meses de menor sol a fatura fica acima do mínimo." +
          ressalva,
      });
    } else if (coberturaPct <= COBERTURA_MAX_EQUILIBRIO * 100) {
      itens.push({
        tema: "DIMENSIONAMENTO",
        nivel: "OK",
        titulo: "Usina bem dimensionada para o seu consumo",
        texto: `${base} Não há necessidade de ampliar: mantenha a usina como está.${ressalva}`,
      });
    } else {
      itens.push({
        tema: "DIMENSIONAMENTO",
        nivel: "OK",
        titulo: "A usina gera mais do que você consome",
        texto: `${base} A sobra de cerca de ${fmtKwh(geracaoMediaKwh - consumoMedioKwh)}/mês vira crédito de energia.${ressalva}`,
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
  } else if (baseIncompleta) {
    // "Siga como está" é um veredito, e veredito exige base. Sem um ciclo de
    // leitura fechado, a frase honesta é a que diz o que se sabe e o que
    // falta — o cliente lê isso e decide; o "siga como está" ele só lê.
    resumo = `Pelos ${mesesPareados} ${mesesPareados === 1 ? "mês medido" : "meses medidos"}, a usina está adequada ao seu consumo — mas ainda falta histórico para fechar um ciclo completo de leitura.`;
  } else {
    resumo = "A usina está adequada ao seu consumo — siga como está.";
  }

  return {
    mesesConsiderados: janela.length,
    mesesPareados,
    cicloInicio,
    cicloFim,
    baseIncompleta,
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

// ---------------------------------------------------------------------------
// Orçamento de chamadas à API de monitoramento
//
// O relatório lê a geração do MonitoringLog (cache alimentado pelo cron). Em
// cache miss ele pode buscar ao vivo — mas o custo varia MUITO por plataforma:
//
//   Fronius / SolarEdge / Huawei → 1 chamada por mês (endpoint agrega o mês)
//   Sungrow                      → ~180 por mês (30 dias × 6 fatias de horário,
//                                  reconstruído a partir de dados por minuto)
//
// Uma UC com 12 faturas, cuja janela de leitura cruza 2 meses de calendário,
// gera ~4.320 chamadas na Sungrow — o relatório levava mais de 20 minutos e a
// tela ficava presa em "Carregando...". Por isso a Sungrow nunca é consultada
// ao vivo aqui: usa só o cache, e o mês sem cache aparece como sem dado.
// Preencher o cache é trabalho do sync/cron, que roda fora da requisição.
const PLATAFORMAS_SEM_FALLBACK_AO_VIVO = new Set(["SUNGROW"]);

/** Teto por chamada de plataforma — rede travada não pode prender a tela. */
const TIMEOUT_CHAMADA_API_MS = 15_000;

/** Teto de tempo somado em API por relatório. Estourou, o resto vem do cache. */
const ORCAMENTO_API_RELATORIO_MS = 30_000;

interface OrcamentoApi {
  restanteMs: number;
}

function novoOrcamentoApi(): OrcamentoApi {
  return { restanteMs: ORCAMENTO_API_RELATORIO_MS };
}

/**
 * Corre `p` contra um timeout. Atenção: o fetch subjacente não é cancelado —
 * isto protege o tempo de resposta da tela, não a chamada em si.
 */
async function comTimeout<T>(p: Promise<T>, ms: number, rotulo: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, rej) => {
        timer = setTimeout(
          () => rej(new Error(`${rotulo}: sem resposta em ${Math.round(ms / 1000)}s`)),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
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
  /** Orçamento compartilhado do relatório. Sem ele, não há teto de tempo. */
  orcamento?: OrcamentoApi,
): Promise<{ totalKwh: number | null; manualKwh: number; erros: string[] }> {
  const erros: string[] = [];
  let total = 0;
  let qualquerSucesso = false;
  // kWh do período que vem de lançamento manual (plataforma sem integração).
  // Viaja junto pro relatório poder dizer ao cliente que aquele mês é estimado.
  let manual = 0;

  // Lê primeiro do banco (MonitoringLog) — sem bater na API. Cron diário
  // já mantém isso atualizado. Só bate na API se não houver log algum
  // pra esse cliente no período (cliente novo / sem cron rodado ainda).
  const clientIds = monitoringClients.map((c) => c.id);
  const cachedLogs = await prisma.monitoringLog.findMany({
    where: {
      clientId: { in: clientIds },
      data: { gte: inicio, lt: fim },
    },
    select: { clientId: true, geracaoDiaria: true, origem: true },
  });
  const cachedByClient = new Map<string, number>();
  const manualByClient = new Map<string, number>();
  for (const log of cachedLogs) {
    cachedByClient.set(log.clientId, (cachedByClient.get(log.clientId) ?? 0) + log.geracaoDiaria);
    if (log.origem === "MANUAL") {
      manualByClient.set(log.clientId, (manualByClient.get(log.clientId) ?? 0) + log.geracaoDiaria);
    }
  }

  for (const c of monitoringClients) {
    const platform = c.plataformaMonitoramento?.toUpperCase() ?? null;
    if (!platform || !c.monitoramentoPlantId) continue;

    // Cache hit: usa o que está no banco
    const cachedKwh = cachedByClient.get(c.id);
    if (cachedKwh != null && cachedKwh > 0) {
      total += cachedKwh;
      manual += manualByClient.get(c.id) ?? 0;
      qualquerSucesso = true;
      continue;
    }

    // Sem cache: só bate na API se permitido (meses exibidos). Nos meses antigos
    // (só acúmulo) evita storm de chamadas → mantém o relatório rápido.
    if (!permitirApi) continue;

    // Sungrow reconstrói o dia a partir de dados por minuto (~180 chamadas por
    // mês). Buscar ao vivo aqui trava a tela por dezenas de minutos — só cache.
    if (PLATAFORMAS_SEM_FALLBACK_AO_VIVO.has(platform)) {
      erros.push(
        `${c.id}: sem geração em cache para o período (${platform} não é consultada ao vivo pelo relatório — aguarde o sync)`,
      );
      continue;
    }

    // Orçamento de tempo estourado: o que faltar vem só do cache.
    if (orcamento && orcamento.restanteMs <= 0) {
      erros.push(`${c.id}: orçamento de consulta à API esgotado neste relatório`);
      continue;
    }

    // Cache miss: bate na API e (idealmente) o sync grava no banco depois
    const t0 = Date.now();
    try {
      const limiteMs = Math.min(
        TIMEOUT_CHAMADA_API_MS,
        orcamento?.restanteMs ?? TIMEOUT_CHAMADA_API_MS,
      );
      let r: { totalKwh: number };
      if (platform === "FRONIUS") {
        r = await comTimeout(
          froniusRangeTotal(c.monitoramentoPlantId, inicio, fim),
          limiteMs,
          "Fronius",
        );
      } else if (platform === "HUAWEI") {
        r = await comTimeout(
          huaweiRangeTotal(c.monitoramentoPlantId, inicio, fim),
          limiteMs,
          "Huawei",
        );
      } else if (platform === "SOLAREDGE") {
        const siteId = parseInt(c.monitoramentoPlantId, 10);
        if (Number.isNaN(siteId)) {
          erros.push(`${c.id}: SolarEdge siteId inválido`);
          continue;
        }
        r = await comTimeout(solaredgeRangeTotal(siteId, inicio, fim), limiteMs, "SolarEdge");
      } else if (platform === "GROWATT") {
        r = await comTimeout(
          growattRangeTotal(c.monitoramentoPlantId, inicio, fim),
          limiteMs,
          "Growatt",
        );
      } else {
        erros.push(`${c.id}: plataforma '${platform}' não suportada`);
        continue;
      }
      // 🔑 Growatt: total ZERO num período de dias inteiros é datalogger mudo, não
      // usina parada — `plant/energy` devolve 0,0 nos dois casos. Contar isso como
      // sucesso faz o relatório AFIRMAR "não gerou" e zera a economia do mês. É o
      // mesmo defeito do `ehDiaSemDado`, mas na LEITURA ao vivo: os 4 pontos
      // corrigidos em `b95cdd5` eram todos de escrita, e este passou. Ver
      // [[project_growatt_zero_kwh_datalogger_mudo]].
      // ⚠️ Só GROWATT: as outras plataformas têm a mesma armadilha em tese, mas
      // não foram medidas — não se troca comportamento sem medir.
      if (platform === "GROWATT" && ehDiaSemDado(r.totalKwh)) {
        erros.push(
          `${c.id}: Growatt devolveu 0 kWh no período — sem comunicação do datalogger, não é geração zero`,
        );
        continue;
      }
      total += r.totalKwh;
      qualquerSucesso = true;
    } catch (e) {
      erros.push(`${c.id}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      if (orcamento) orcamento.restanteMs -= Date.now() - t0;
    }
  }
  return { totalKwh: qualquerSucesso ? total : null, manualKwh: manual, erros };
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
  // Prognóstico mensal médio: cai pra `anual ÷ 12` quando a mensal não foi
  // cadastrada (é o caso de toda a base hoje). Ver `geracao-esperada.ts`.
  const geracaoEsperadaMensalKwh = esperadaMensalBaseTotalKwh(monitoringClients);
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
      // Grupo A — posto FORA PONTA: de onde sai o preco do kWh que o solar
      // evita (ver lib/preco-kwh.ts). Ausentes em fatura Grupo B.
      consumoTeForaPontaKwh: true,
      consumoTeForaPontaValor: true,
      consumoTusdForaPontaKwh: true,
      consumoTusdForaPontaValor: true,
      tarifaTeForaPonta: true,
      tarifaTusdForaPonta: true,
    },
  });
  let economiaAcumulada = 0;
  // Quantos meses saíram com a parcela de autoconsumo desconhecida — o acumulado
  // e a média viram PISO, e a tela precisa dizer isso em vez de fingir exatidão.
  let mesesEconomiaParcial = 0;
  const mesesAll: RelatorioMonthRow[] = [];

  // Só os meses exibidos (últimos 12) podem bater na API de monitoramento;
  // os anteriores (só acúmulo) usam apenas o cache pra não travar o relatório.
  const idxDisplayInicio = Math.max(0, bills.length - 12);
  // Teto de tempo em API compartilhado por todos os meses deste relatório.
  const orcamentoApi = novoOrcamentoApi();
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

    const { totalKwh: geracaoInversorKwh, manualKwh: geracaoManualKwh, erros: inversoresErros } =
      await sumGenerationForPeriod(
        monitoringClients,
        inicio,
        fim,
        permitirApiMes,
        orcamentoApi,
      );

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
    // A parcela de autoconsumo só EXISTE pra UC com geração própria injetando
    // nela. Sem usina monitorada ela não se aplica e zero é a verdade (é o caso
    // do relatório lite e da beneficiária pura). Com usina monitorada e sem
    // `consumoInstantaneoKwh` resolvido — datalogger mudo, ou a anomalia acima —
    // ela é DESCONHECIDA, e aí o mês não pode sair como R$ 0,00.
    const autoconsumoSeAplica = monitoringClients.length > 0;
    // Marca só o caso que o Paulo descreveu: SEM dado de geração no período.
    // Quando a geração existe mas a fatura não trouxe a leitura de injeção, o
    // autoconsumo também não sai — mas essa é lacuna de FATURA, outra causa e
    // outra conversa; mexer nela aqui viraria "≥" em quase todo mês de todo
    // cliente sem eu ter medido o efeito.
    const autoconsumoConhecido =
      !autoconsumoSeAplica || geracaoInversorKwh != null;
    const eco = calcularEconomiaMensal(
      bill,
      consumoInstantaneoKwh,
      autoconsumoConhecido,
    );
    const economiaMensalRs = eco.economiaMensalRs;
    const economiaCompensadaRs =
      economiaMensalRs == null ? null : eco.compensacaoRs;
    // Desconhecida ≠ zero: `null` quando falta o dado de geração.
    const economiaInstantaneaRs = eco.autoconsumoIndisponivel
      ? null
      : economiaMensalRs == null
        ? null
        : eco.autoconsumoRs;
    const contaSemSolarRs = eco.contaSemSolarRs;
    if (eco.autoconsumoIndisponivel) mesesEconomiaParcial++;

    economiaAcumulada += economiaMensalRs ?? 0;
    const saldoPaybackRs = investimentoTotal - economiaAcumulada;

    // Prognóstico DO PERÍODO da fatura, não da média anual: o ciclo de leitura
    // tem 28–33 dias e a geração no RS varia mais de 2,5× entre junho e
    // janeiro. Comparar junho com a média anual reprovaria toda usina saudável
    // no inverno. Ver `geracao-esperada.ts`.
    const geracaoEsperadaPeriodoKwh =
      geracaoEsperadaMensalKwh > 0
        ? esperadaDoPeriodoKwh(geracaoEsperadaMensalKwh, inicio, fim)
        : 0;
    const desempenhoPct =
      geracaoInversorKwh != null && geracaoEsperadaPeriodoKwh > 0
        ? (geracaoInversorKwh / geracaoEsperadaPeriodoKwh) * 100
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
      geracaoManualKwh,
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
      autoconsumoIndisponivel: eco.autoconsumoIndisponivel,
      economiaAcumuladaRs: economiaAcumulada,
      saldoPaybackRs,
      faturadoRs: bill.valorTotal,
      contaSemSolarRs,
      geracaoEsperadaPeriodoKwh: geracaoEsperadaPeriodoKwh > 0 ? geracaoEsperadaPeriodoKwh : null,
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

  // Diagnóstico e sua ausência saem da MESMA avaliação, de propósito: derivar
  // `situacaoIndisponivel` do resultado (e não recalcular as guardas) garante
  // que nunca apareçam os dois, nem falte os dois.
  const situacao = avaliarSituacaoUsina(meses, geracaoEsperadaMensalKwh);

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
    mesesEconomiaParcial,
    retornoTotalPct,
    paybackRestanteMeses,
    paybackQuitacaoPrevista,
    paybackQuitado,
    meses,
    mesesComFatura,
    situacao,
    situacaoIndisponivel:
      situacao == null
        ? explicarSituacaoIndisponivel(meses, monitoringClients.length)
        : null,
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
  /**
   * Saldo de créditos GD remanescente na fatura DESTA beneficiária. É o que
   * permite ver crédito parado numa UC enquanto outra passa aperto — sem ele
   * só existiria o total do grupo, que esconde o desequilíbrio.
   */
  saldoCreditosKwh: number | null;
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
  /** Parte de `geracaoInversorKwh` informada à mão (ver src/lib/geracao-manual.ts) */
  geracaoManualKwh: number;
  /** Da fatura da UC titular — energia injetada na rede */
  injetadaMedidorKwh: number | null;
  /** Da fatura da UC titular — saldo de créditos GD acumulado */
  saldoCreditosTitular: number | null;
  /** Breakdown por UC beneficiária do mês */
  beneficiarias: RelatorioAgregadoBeneficiariaRow[];
  /**
   * Alguma beneficiária tem fatura NESTE mês. Falso nos meses em que só a
   * geradora tinha fatura — que entram no histórico pela geração (ver
   * `periodosUsados`), mas NÃO podem alimentar o diagnóstico do rateio: mês sem
   * fatura de beneficiária é mês sem dado, não "crédito que não chegou".
   */
  temFaturaBeneficiaria: boolean;
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
  /**
   * Diagnóstico "Situação do rateio" — conclusão do relatório agregado.
   * `null` quando não há consumo faturado no período (nada a concluir).
   */
  situacao: SituacaoRateio | null;
  /**
   * Preenchido EXATAMENTE quando `situacao` é `null` — mesma regra do
   * relatório por UC: a conclusão nunca some calada do documento.
   */
  situacaoIndisponivel: SituacaoIndisponivel | null;
}

// =============================================================================
// SITUAÇÃO DO RATEIO (diagnóstico do relatório agregado)
// =============================================================================
//
// O equivalente do "Situação da usina" para autoconsumo remoto. As perguntas
// mudam: com N beneficiárias não basta saber se a usina é grande o bastante —
// a energia pode ser suficiente e mesmo assim não chegar, porque o rateio está
// desbalanceado, porque a geradora consumiu tudo antes de injetar, ou porque a
// concessionária faturou errado. Cada item abaixo é uma dessas hipóteses.
//
// Mesmas regras do diagnóstico por UC: texto determinístico (mesma entrada →
// mesmo texto), linguagem de cliente, lacuna sempre em kWh e nunca em kWp.

/** Cobertura do grupo (compensado ÷ consumo) abaixo disso = não foi atendido. */
const RATEIO_COBERTURA_DEFICIT = 0.85;
/**
 * Diferença, em pontos percentuais, entre o rateio de uma UC e sua participação
 * no consumo do grupo que já justifica revisar os percentuais.
 */
const RATEIO_DESVIO_PP = 10;
/**
 * Fração da geração que precisa ser injetada pra o rateio fazer sentido. Abaixo
 * disso a própria geradora consumiu quase tudo e sobrou pouco crédito.
 */
const INJECAO_MINIMA_FRACAO = 0.5;
/** Folga aceita antes de acusar leitura inconsistente (5% acima do teto físico). */
const TOLERANCIA_LEITURA = 1.05;
/** Meses recentes considerados nos itens de usina/leitura. */
const JANELA_RECENTE_MESES = 3;
/** Máximo de ocorrências citadas nominalmente antes de virar "e mais N". */
const MAX_OCORRENCIAS_CITADAS = 3;

const MES_ABREV_DIAG = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];
const rotuloMes = (ano: number, mes: number) =>
  `${MES_ABREV_DIAG[mes - 1]}/${ano}`;

/** "a, b e c" — o texto vai direto pro cliente. */
function listar(itens: string[]): string {
  if (itens.length === 0) return "";
  if (itens.length === 1) return itens[0];
  return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

/** Junta as primeiras N ocorrências e resume o resto em "e mais X". */
function resumirOcorrencias(ocorrencias: string[]): string {
  const citadas = ocorrencias.slice(0, MAX_OCORRENCIAS_CITADAS);
  const resto = ocorrencias.length - citadas.length;
  return listar(citadas) + (resto > 0 ? `, e mais ${resto} caso(s)` : "");
}

export interface SituacaoRateioItem {
  tema:
    | "ATENDIMENTO"
    | "DISTRIBUICAO"
    | "USINA"
    | "LEITURA"
    | "DADOS";
  /** OK = nada a fazer · ATENCAO = acompanhar · ACAO = precisa de decisão */
  nivel: "OK" | "ATENCAO" | "ACAO";
  titulo: string;
  texto: string;
}

/** Retrato de uma beneficiária na janela analisada. */
export interface SituacaoRateioUc {
  ucId: string;
  codigoUc: string;
  nome: string;
  /** Percentual de rateio cadastrado na concessionária */
  percentual: number;
  consumoMedioKwh: number | null;
  compensadoMedioKwh: number | null;
  /** Participação da UC no consumo do grupo (%) — comparável ao rateio */
  participacaoConsumoPct: number | null;
  /** Saldo de créditos da fatura mais recente da UC */
  saldoCreditosKwh: number | null;
  /** Saldo ÷ consumo médio da própria UC — "meses de consumo em caixa" */
  saldoEmMesesDeConsumo: number | null;
}

export interface SituacaoRateio {
  mesesConsiderados: number;
  /** Soma das beneficiárias, média dos meses */
  consumoMedioTotalKwh: number | null;
  compensadoMedioTotalKwh: number | null;
  /** compensado ÷ consumo do grupo × 100 — quanto do consumo virou crédito */
  coberturaPct: number | null;
  /**
   * kWh/mês que faltaram pra cobrir o consumo do grupo. Em kWh, NUNCA em kWp:
   * dimensionar é trabalho do projeto (ver `SituacaoUsina.deficitMensalKwh`).
   */
  deficitMensalKwh: number | null;
  /** Média injetada na rede pela UC titular (fatura da titular) */
  injetadaMediaKwh: number | null;
  /** Média gerada pelo(s) inversor(es) */
  geracaoMediaKwh: number | null;
  ucs: SituacaoRateioUc[];
  resumo: string;
  itens: SituacaoRateioItem[];
}

/**
 * Monta a conclusão do relatório agregado a partir do histórico consolidado.
 *
 * Retorna `null` quando nenhum mês da janela tem consumo faturado — sem consumo
 * medido não há como afirmar se o grupo foi atendido.
 */
/**
 * Contraparte de `explicarSituacaoIndisponivel` para o relatório agregado. As
 * guardas de `avaliarSituacaoRateio` são outras — ele conclui a partir do
 * CONSUMO faturado das beneficiárias, não da geração —, então os motivos
 * também são outros: aqui não ter monitoramento não impede a conclusão.
 */
export function explicarSituacaoRateioIndisponivel(
  meses: RelatorioAgregadoMonthRow[],
): SituacaoIndisponivel {
  // Mesma base do diagnóstico: mês só-geradora não conta como "fatura existe".
  if (mesesComDadoDeBeneficiaria(meses).length === 0) {
    return {
      motivo: "SEM_HISTORICO",
      titulo: "Análise do rateio indisponível neste período",
      texto:
        "Ainda não há faturas registradas no período deste relatório para as unidades " +
        "beneficiárias, então não é possível concluir se os créditos chegaram e se os " +
        "percentuais do rateio estão adequados. Assim que as faturas forem processadas, a " +
        "análise passa a sair automaticamente.",
      acaoInterna:
        "Nenhuma fatura das beneficiárias no período. Verifique cadastro/sincronização de faturas.",
    };
  }
  return {
    motivo: "SEM_HISTORICO",
    titulo: "Análise do rateio indisponível neste período",
    texto:
      "As faturas do período não trouxeram consumo da rede nas unidades beneficiárias, e é sobre " +
      "esse consumo que a análise do rateio se apoia. Sem ele não é possível concluir se os " +
      "créditos cobriram a necessidade do grupo. Os números apresentados acima continuam válidos.",
    acaoInterna:
      "Faturas existem, mas sem consumo da rede lido. Confira o parser/leitura das faturas das beneficiárias.",
  };
}

/**
 * Meses que sustentam o diagnóstico do rateio: os que têm fatura de alguma
 * beneficiária. O histórico consolidado inclui também os meses em que só a
 * geradora tinha fatura (pra não perder o histórico de geração), mas esses NÃO
 * entram aqui — sem fatura da beneficiária não há consumo do grupo pra medir, e
 * contá-los faria o relatório acusar "a usina gerou e o crédito não chegou" num
 * mês em que a unidade sequer estava no rateio.
 */
export function mesesComDadoDeBeneficiaria(
  meses: RelatorioAgregadoMonthRow[],
): RelatorioAgregadoMonthRow[] {
  return meses.filter((m) => m.temFaturaBeneficiaria);
}

export function avaliarSituacaoRateio(
  meses: RelatorioAgregadoMonthRow[],
): SituacaoRateio | null {
  const mesesBase = mesesComDadoDeBeneficiaria(meses);
  if (mesesBase.length === 0) return null;

  const janela = mesesBase.slice(-JANELA_MEDIAS_MESES);
  const consumosTotais = janela
    .map((m) => m.consumoRedeKwhTotal)
    .filter((v): v is number => v != null && v > 0);
  if (consumosTotais.length === 0) return null;

  const consumoMedioTotalKwh = media(consumosTotais);
  // Mês com zero compensado ENTRA na média — é justamente o sintoma de crédito
  // que não chegou. Só mês sem fatura (null) fica de fora.
  const compensadoMedioTotalKwh = media(
    janela
      .map((m) => m.energiaCompensadaKwhTotal)
      .filter((v): v is number => v != null),
  );
  const injetadaMediaKwh = media(
    janela
      .map((m) => m.injetadaMedidorKwh)
      .filter((v): v is number => v != null && v > 0),
  );
  const geracaoMediaKwh = media(
    janela
      .map((m) => m.geracaoInversorKwh)
      .filter((v): v is number => v != null && v > 0),
  );

  const coberturaPct =
    compensadoMedioTotalKwh != null &&
    consumoMedioTotalKwh != null &&
    consumoMedioTotalKwh > 0
      ? (compensadoMedioTotalKwh / consumoMedioTotalKwh) * 100
      : null;
  const faltaKwh =
    compensadoMedioTotalKwh != null && consumoMedioTotalKwh != null
      ? consumoMedioTotalKwh - compensadoMedioTotalKwh
      : null;
  const deficitMensalKwh = faltaKwh != null && faltaKwh > 0 ? faltaKwh : null;

  // --- Retrato por beneficiária ----------------------------------------------
  const acc = new Map<
    string,
    {
      codigoUc: string;
      nome: string;
      percentual: number;
      consumos: number[];
      compensados: number[];
      saldo: number | null;
      /** Meses (rótulo) em que a UC já operava mas não veio fatura */
      mesesSemFatura: string[];
      viuFatura: boolean;
    }
  >();
  for (const m of janela) {
    for (const b of m.beneficiarias) {
      let a = acc.get(b.ucId);
      if (!a) {
        a = {
          codigoUc: b.codigoUc,
          nome: b.nome,
          percentual: b.percentual,
          consumos: [],
          compensados: [],
          saldo: null,
          mesesSemFatura: [],
          viuFatura: false,
        };
        acc.set(b.ucId, a);
      }
      const temFatura = b.consumoRedeKwh != null || b.faturadoRs != null;
      if (temFatura) a.viuFatura = true;
      // Só conta lacuna DEPOIS da primeira fatura da UC: beneficiária que
      // entrou no rateio no meio do período não tem "fatura faltando" antes.
      else if (a.viuFatura) a.mesesSemFatura.push(rotuloMes(m.ano, m.mes));
      if (b.consumoRedeKwh != null && b.consumoRedeKwh > 0)
        a.consumos.push(b.consumoRedeKwh);
      if (b.energiaCompensadaKwh != null) a.compensados.push(b.energiaCompensadaKwh);
      // janela é cronológica → a última atribuição é a fatura mais recente
      if (b.saldoCreditosKwh != null) a.saldo = b.saldoCreditosKwh;
    }
  }

  const ucsBase = Array.from(acc.entries()).map(([ucId, a]) => {
    const consumoMedioKwh = media(a.consumos);
    const saldoEmMesesDeConsumo =
      a.saldo != null && consumoMedioKwh != null && consumoMedioKwh > 0
        ? a.saldo / consumoMedioKwh
        : null;
    return {
      ucId,
      codigoUc: a.codigoUc,
      nome: a.nome,
      percentual: a.percentual,
      consumoMedioKwh,
      compensadoMedioKwh: media(a.compensados),
      saldoCreditosKwh: a.saldo,
      saldoEmMesesDeConsumo,
      mesesSemFatura: a.mesesSemFatura,
    };
  });
  const somaConsumoMedio = ucsBase.reduce(
    (t, u) => t + (u.consumoMedioKwh ?? 0),
    0,
  );
  const ucs: SituacaoRateioUc[] = ucsBase.map((u) => ({
    ucId: u.ucId,
    codigoUc: u.codigoUc,
    nome: u.nome,
    percentual: u.percentual,
    consumoMedioKwh: u.consumoMedioKwh,
    compensadoMedioKwh: u.compensadoMedioKwh,
    participacaoConsumoPct:
      u.consumoMedioKwh != null && somaConsumoMedio > 0
        ? (u.consumoMedioKwh / somaConsumoMedio) * 100
        : null,
    saldoCreditosKwh: u.saldoCreditosKwh,
    saldoEmMesesDeConsumo: u.saldoEmMesesDeConsumo,
  }));

  const itens: SituacaoRateioItem[] = [];
  const recentes = janela.slice(-JANELA_RECENTE_MESES);

  // --- 1. Usina: gerou e virou crédito pras beneficiárias? --------------------
  // Vem antes do atendimento porque, quando a energia não sai da geradora, é
  // essa a causa raiz — dizer "faltou geração" seria diagnóstico errado.
  const recentesComEnergia = recentes.filter(
    (m) => (m.geracaoInversorKwh ?? 0) > 0 || (m.injetadaMedidorKwh ?? 0) > 0,
  );
  const recentesSemCredito = recentesComEnergia.filter(
    (m) => (m.energiaCompensadaKwhTotal ?? 0) <= 0,
  );
  const paresGeracaoInjecao = janela.filter(
    (m) =>
      m.geracaoInversorKwh != null &&
      m.geracaoInversorKwh > 0 &&
      m.injetadaMedidorKwh != null,
  );
  const somaGeracao = paresGeracaoInjecao.reduce(
    (t, m) => t + (m.geracaoInversorKwh ?? 0),
    0,
  );
  const somaInjecao = paresGeracaoInjecao.reduce(
    (t, m) => t + (m.injetadaMedidorKwh ?? 0),
    0,
  );
  const fracaoInjetada =
    paresGeracaoInjecao.length > 0 && somaGeracao > 0
      ? somaInjecao / somaGeracao
      : null;
  const poucaInjecao =
    fracaoInjetada != null && fracaoInjetada < INJECAO_MINIMA_FRACAO;

  if (recentesSemCredito.length > 0) {
    itens.push({
      tema: "USINA",
      nivel: "ACAO",
      titulo: "A usina gerou, mas os créditos não chegaram às unidades",
      texto:
        `Em ${recentesSemCredito.length} dos últimos ${recentes.length} meses (${listar(recentesSemCredito.map((m) => rotuloMes(m.ano, m.mes)))}) a usina registrou geração e nenhuma unidade beneficiária teve energia compensada. ` +
        (poucaInjecao
          ? `No período, apenas ${(fracaoInjetada! * 100).toFixed(0)}% da energia gerada foi injetada na rede — o restante foi consumido na própria unidade geradora, e energia consumida na hora não vira crédito. `
          : "A energia foi injetada na rede, mas não foi distribuída às beneficiárias. ") +
        "As causas mais comuns são rateio não cadastrado ou desatualizado junto à concessionária. Vamos verificar o cadastro do rateio e regularizar.",
    });
  } else if (poucaInjecao) {
    itens.push({
      tema: "USINA",
      nivel: "ATENCAO",
      titulo: "Boa parte da energia ficou na própria unidade geradora",
      texto: `Do total gerado no período (${fmtKwh(somaGeracao)}), ${fmtKwh(somaInjecao)} (${(fracaoInjetada! * 100).toFixed(0)}%) foram injetados na rede. O restante foi consumido na hora pela própria unidade geradora — energia consumida no local não gera crédito para as beneficiárias, o que reduz o que sobra para o rateio.`,
    });
  }

  // --- 2. Atendimento do grupo -----------------------------------------------
  // Quando o item da usina já apontou a causa, aqui só entra o tamanho da
  // lacuna — repetir a explicação faria o cliente ler a mesma coisa duas vezes.
  const causaJaExplicada = itens.some(
    (i) => i.tema === "USINA" && i.nivel === "ACAO",
  );
  if (coberturaPct != null && consumoMedioTotalKwh != null && compensadoMedioTotalKwh != null) {
    const base = `Nos últimos ${janela.length} meses, as ${ucs.length} unidades consumiram em média ${fmtKwh(consumoMedioTotalKwh)}/mês e tiveram ${fmtKwh(compensadoMedioTotalKwh)}/mês compensados por créditos (cobertura de ${coberturaPct.toFixed(0)}%).`;
    const energiaDisponivel = injetadaMediaKwh ?? geracaoMediaKwh;
    // Distingue as duas causas: energia insuficiente × energia suficiente que
    // não chegou. A recomendação é oposta em cada caso.
    const usinaCurta =
      energiaDisponivel != null && energiaDisponivel < consumoMedioTotalKwh * 0.95;
    if (coberturaPct < RATEIO_COBERTURA_DEFICIT * 100) {
      itens.push({
        tema: "ATENDIMENTO",
        nivel: "ACAO",
        titulo: "As unidades não foram totalmente atendidas pelos créditos",
        texto:
          `${base} ` +
          (deficitMensalKwh != null
            ? `Faltaram em média ${fmtKwh(deficitMensalKwh)}/mês de energia compensada para cobrir todo o consumo. `
            : "") +
          (causaJaExplicada
            ? "Esse é o efeito, na conta das unidades, do ponto apontado acima."
            : usinaCurta
            ? `A energia disponível da usina (${fmtKwh(energiaDisponivel!)}/mês${injetadaMediaKwh != null ? " injetados na rede" : " gerados"}) já é menor que o consumo do grupo: a diferença não se resolve só com rateio. Vale avaliar uma ampliação da usina com a nossa equipe técnica.`
            : energiaDisponivel != null
              ? `A usina disponibilizou ${fmtKwh(energiaDisponivel)}/mês — energia suficiente para o grupo. A diferença está na distribuição dos créditos entre as unidades ou no faturamento da concessionária.`
              : "Enquanto essa diferença existir, parte do consumo continua sendo paga à concessionária."),
      });
    } else if (coberturaPct < 100) {
      itens.push({
        tema: "ATENDIMENTO",
        nivel: "ATENCAO",
        titulo: "Quase todo o consumo do grupo foi coberto",
        texto:
          `${base} ` +
          (deficitMensalKwh != null
            ? `Faltaram ${fmtKwh(deficitMensalKwh)}/mês para zerar a diferença; `
            : "") +
          "nos meses de menor sol a fatura das unidades fica acima do mínimo.",
      });
    } else {
      itens.push({
        tema: "ATENDIMENTO",
        nivel: "OK",
        titulo: "Todo o consumo do grupo foi coberto por créditos",
        texto: `${base} As unidades pagaram apenas o custo de disponibilidade e os encargos que não são compensáveis.`,
      });
    }
  }

  // --- 3. Distribuição entre as unidades -------------------------------------
  const comSaldo = ucs.filter((u) => u.saldoEmMesesDeConsumo != null);
  const sobrando = comSaldo
    .filter((u) => u.saldoEmMesesDeConsumo! > SALDO_MESES_EXCEDENTE)
    .sort((a, b) => b.saldoEmMesesDeConsumo! - a.saldoEmMesesDeConsumo!);
  const faltando = comSaldo
    .filter((u) => u.saldoEmMesesDeConsumo! < SALDO_MESES_RESERVA_MINIMA)
    .sort((a, b) => a.saldoEmMesesDeConsumo! - b.saldoEmMesesDeConsumo!);
  const desalinhadas = ucs
    .filter(
      (u) =>
        u.participacaoConsumoPct != null &&
        Math.abs(u.percentual - u.participacaoConsumoPct) >= RATEIO_DESVIO_PP,
    )
    .sort(
      (a, b) =>
        Math.abs(b.percentual - b.participacaoConsumoPct!) -
        Math.abs(a.percentual - a.participacaoConsumoPct!),
    );
  const frasesDesalinhadas = desalinhadas
    .slice(0, 2)
    .map(
      (u) =>
        `a UC ${formatCodigoUc(u.codigoUc)} responde por ${u.participacaoConsumoPct!.toFixed(0)}% do consumo do grupo e recebe ${u.percentual.toFixed(0)}% do rateio`,
    );
  const sugestaoRateio = frasesDesalinhadas.length
    ? ` Comparando o rateio com o consumo real, ${listar(frasesDesalinhadas)}.`
    : "";

  if (comSaldo.length >= 2 && sobrando.length > 0 && faltando.length > 0) {
    const a = sobrando[0];
    const b = faltando[0];
    itens.push({
      tema: "DISTRIBUICAO",
      nivel: "ACAO",
      titulo: "Créditos concentrados em uma unidade e faltando em outra",
      texto:
        `A UC ${formatCodigoUc(a.codigoUc)} (${a.nome}) acumula ${fmtKwh(a.saldoCreditosKwh!)} de créditos — ${fmt1(a.saldoEmMesesDeConsumo!)} meses do próprio consumo — enquanto a UC ${formatCodigoUc(b.codigoUc)} (${b.nome}) está com ${fmtKwh(b.saldoCreditosKwh!)}, praticamente sem reserva.` +
        sugestaoRateio +
        ` Vale rever os percentuais de rateio junto à concessionária para direcionar o excedente a quem consome mais — créditos parados expiram em ${VALIDADE_CREDITOS_MESES} meses.`,
    });
  } else if (sobrando.length > 0 && sobrando.length === comSaldo.length) {
    itens.push({
      tema: "DISTRIBUICAO",
      nivel: "ATENCAO",
      titulo: "Créditos acumulados acima do necessário",
      texto: `Todas as unidades estão com reserva acima de ${SALDO_MESES_EXCEDENTE} meses de consumo (maior saldo: UC ${formatCodigoUc(sobrando[0].codigoUc)}, ${fmtKwh(sobrando[0].saldoCreditosKwh!)}). Créditos não utilizados expiram em ${VALIDADE_CREDITOS_MESES} meses — vale incluir outra unidade consumidora no rateio ou migrar mais consumo para a energia elétrica.`,
    });
  } else if (faltando.length > 0 && faltando.length === comSaldo.length) {
    // Todas zeradas: dizer "unidade X está sem reserva" não distingue nada e
    // repete o item de atendimento. O fato aqui é a ausência de reserva no grupo.
    itens.push({
      tema: "DISTRIBUICAO",
      nivel: "ATENCAO",
      titulo: "Nenhuma unidade acumulou reserva de créditos",
      texto:
        `Todo o crédito recebido foi consumido no próprio mês — as ${comSaldo.length} unidades terminaram o período com saldo próximo de zero. Sem reserva acumulada, qualquer queda de geração (outono e inverno, chuva prolongada) aparece direto na fatura.` +
        sugestaoRateio,
    });
  } else if (faltando.length > 0) {
    itens.push({
      tema: "DISTRIBUICAO",
      nivel: "ATENCAO",
      titulo: "Unidades sem reserva de créditos",
      texto:
        `${resumirOcorrencias(faltando.map((u) => `UC ${formatCodigoUc(u.codigoUc)} (${fmtKwh(u.saldoCreditosKwh!)})`))} estão sem reserva acumulada, enquanto as demais terminaram o período com saldo. Nos meses de menor geração essas unidades chegam com a fatura mais alta.` +
        sugestaoRateio,
    });
  } else if (frasesDesalinhadas.length > 0) {
    itens.push({
      tema: "DISTRIBUICAO",
      nivel: "ATENCAO",
      titulo: "Rateio diferente do consumo real das unidades",
      texto: `O rateio cadastrado não acompanha o consumo:${sugestaoRateio.replace(" Comparando o rateio com o consumo real,", "")} Revisar os percentuais faz os créditos chegarem onde são consumidos.`,
    });
  } else if (comSaldo.length > 0) {
    itens.push({
      tema: "DISTRIBUICAO",
      nivel: "OK",
      titulo: "Créditos bem distribuídos entre as unidades",
      texto: `Todas as unidades terminaram o período com reserva de créditos compatível com o próprio consumo — o rateio está equilibrado.`,
    });
  }

  // --- 4. Possível erro de leitura / faturamento ------------------------------
  // Situações fisicamente impossíveis ou improváveis na fatura. Sinalizar, não
  // silenciar: o cliente enxerga o mesmo número e precisa saber que vamos
  // contestar (ver feedback_anomalias_sinalizar).
  const suspeitas: string[] = [];
  for (const m of janela) {
    const rot = rotuloMes(m.ano, m.mes);
    if (
      m.injetadaMedidorKwh != null &&
      m.geracaoInversorKwh != null &&
      m.geracaoInversorKwh > 0 &&
      m.injetadaMedidorKwh > m.geracaoInversorKwh * TOLERANCIA_LEITURA
    ) {
      suspeitas.push(
        `em ${rot} o medidor registrou ${fmtKwh(m.injetadaMedidorKwh)} injetados, acima dos ${fmtKwh(m.geracaoInversorKwh)} gerados pelo inversor`,
      );
    }
    if (m.faturadoRs != null && (m.consumoRedeKwhTotal ?? 0) === 0) {
      suspeitas.push(
        `em ${rot} houve faturamento sem nenhum consumo medido nas unidades`,
      );
    }
    for (const b of m.beneficiarias) {
      if (
        b.consumoRedeKwh != null &&
        b.consumoRedeKwh > 0 &&
        b.energiaCompensadaKwh != null &&
        b.energiaCompensadaKwh > b.consumoRedeKwh * TOLERANCIA_LEITURA
      ) {
        suspeitas.push(
          `em ${rot} a UC ${formatCodigoUc(b.codigoUc)} teve ${fmtKwh(b.energiaCompensadaKwh)} compensados para um consumo de ${fmtKwh(b.consumoRedeKwh)}`,
        );
      }
    }
  }
  if (suspeitas.length > 0) {
    itens.push({
      tema: "LEITURA",
      nivel: "ATENCAO",
      titulo: "Possível erro de leitura na concessionária",
      texto: `Encontramos registros que não fecham entre si: ${resumirOcorrencias(suspeitas)}. Normalmente é leitura estimada, leitura fora do ciclo ou lançamento incorreto de créditos. Vamos conferir essas faturas junto à concessionária e, se confirmado, pedir a revisão do faturamento.`,
    });
  }

  // --- 5. Faturas ainda não recebidas ----------------------------------------
  const lacunas = ucsBase.filter((u) => u.mesesSemFatura.length > 0);
  if (lacunas.length > 0) {
    itens.push({
      tema: "DADOS",
      nivel: "ATENCAO",
      titulo: "Faturas ainda não recebidas",
      texto: `${resumirOcorrencias(lacunas.map((u) => `UC ${formatCodigoUc(u.codigoUc)} (${listar(u.mesesSemFatura)})`))} — os totais desses meses estão incompletos e serão atualizados quando as faturas chegarem.`,
    });
  }

  // --- Veredito ---------------------------------------------------------------
  const item = (tema: SituacaoRateioItem["tema"]) =>
    itens.find((i) => i.tema === tema);
  let resumo: string;
  if (item("USINA")?.nivel === "ACAO") {
    resumo =
      "A energia gerada não está chegando às unidades — precisamos regularizar o rateio junto à concessionária.";
  } else if (item("ATENDIMENTO")?.nivel === "ACAO") {
    resumo = `Os créditos cobriram parte do consumo do grupo${deficitMensalKwh != null ? `: faltaram cerca de ${fmtKwh(deficitMensalKwh)}/mês` : ""}.`;
  } else if (item("DISTRIBUICAO")?.nivel === "ACAO") {
    resumo =
      "A energia atendeu o grupo, mas está mal distribuída: sobra crédito numa unidade e falta em outra.";
  } else if (item("LEITURA")) {
    resumo =
      "As unidades foram atendidas, mas há números da concessionária que não fecham — vamos conferir esse faturamento.";
  } else if (itens.some((i) => i.nivel === "ATENCAO")) {
    resumo =
      "O rateio está atendendo as unidades, com um ponto que pede atenção.";
  } else {
    resumo =
      "O rateio está equilibrado e as unidades foram atendidas pelos créditos.";
  }

  return {
    mesesConsiderados: janela.length,
    consumoMedioTotalKwh,
    compensadoMedioTotalKwh,
    coberturaPct,
    deficitMensalKwh,
    injetadaMediaKwh,
    geracaoMediaKwh,
    ucs,
    resumo,
    itens,
  };
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
      // Casa também pelo código antigo — ver `whereCodigoUc`.
      where: whereCodigoUc(proprietario.codigoUc),
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
  const geracaoEsperadaMensalKwh = esperadaMensalBaseTotalKwh(monitoringClients);
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
      // Grupo A — posto FORA PONTA: de onde sai o preco do kWh que o solar
      // evita (ver lib/preco-kwh.ts). Ausentes em fatura Grupo B.
      consumoTeForaPontaKwh: true,
      consumoTeForaPontaValor: true,
      consumoTusdForaPontaKwh: true,
      consumoTusdForaPontaValor: true,
      tarifaTeForaPonta: true,
      tarifaTusdForaPonta: true,
    },
  });

  // Agrupa por (ano, mes).
  const periodKey = (a: number, m: number) =>
    `${String(a).padStart(4, "0")}-${String(m).padStart(2, "0")}`;
  const billsByPeriod = new Map<string, typeof todasBills>();
  for (const b of todasBills) {
    if (!b.consumerUnitId) continue;
    const key = periodKey(b.anoReferencia, b.mesReferencia);
    if (!billsByPeriod.has(key)) billsByPeriod.set(key, []);
    billsByPeriod.get(key)!.push(b);
  }

  // UNIÃO dos períodos: mês com fatura da GERADORA entra mesmo sem fatura de
  // beneficiária. Até 03/09/2026 o histórico era ancorado só nas beneficiárias
  // ("titular sozinha não conta"), e beneficiária cadastrada DEPOIS da geradora
  // apagava todo o passado: o Sandro Souza tinha 25 meses de fatura na geradora
  // e 1 na beneficiária, e o "Histórico consolidado por mês" saía com UMA linha
  // — sem o histórico de geração que o cliente foi ver. Ver
  // [[project_historico_consolidado_uniao_meses]].
  //
  // O mês só-geradora traz geração, injeção e saldo da titular; as colunas das
  // beneficiárias saem vazias (`temFaturaBeneficiaria: false`) porque não havia
  // fatura — e é assim que o diagnóstico do rateio as ignora.
  const sortedPeriods = Array.from(billsByPeriod.keys()).sort();
  // TODOS os períodos desde a operação (tabela + acúmulo). Os gráficos do PDF
  // agregado fatiam os últimos 12 internamente pra ficarem legíveis.
  const periodosUsados = sortedPeriods;

  const meses: RelatorioAgregadoMonthRow[] = [];
  let economiaAcumulada = 0;

  // Só os últimos 12 períodos podem bater na API; os anteriores usam só cache.
  const idxDisplayInicioAgg = Math.max(0, periodosUsados.length - 12);
  // Teto de tempo em API compartilhado por todos os períodos deste relatório.
  const orcamentoApiAgg = novoOrcamentoApi();
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

    const { totalKwh: geracaoInversorKwh, manualKwh: geracaoManualKwh, erros: inversoresErros } =
      await sumGenerationForPeriod(
        monitoringClients,
        inicio,
        fim,
        permitirApiMes,
        orcamentoApiAgg,
      );

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
          saldoCreditosKwh: null,
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
        saldoCreditosKwh: bill.saldoCreditos,
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
      geracaoManualKwh,
      injetadaMedidorKwh: billTitular?.energiaInjetadaMedidorKwh ?? null,
      saldoCreditosTitular: billTitular?.saldoCreditos ?? null,
      beneficiarias: beneficiariasRows,
      temFaturaBeneficiaria: billsBenef.length > 0,
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

  // Mesma amarração do relatório por UC: a explicação é DERIVADA do resultado.
  const situacaoRateio = avaliarSituacaoRateio(meses);

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
    situacao: situacaoRateio,
    situacaoIndisponivel:
      situacaoRateio == null ? explicarSituacaoRateioIndisponivel(meses) : null,
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
      // Casa também pelo código antigo — ver `whereCodigoUc`.
      where: whereCodigoUc(proprietario.codigoUc),
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

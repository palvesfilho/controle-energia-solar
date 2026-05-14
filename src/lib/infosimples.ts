/**
 * Cliente da API Infosimples para consulta de faturas CPFL/RGE Sul
 *
 * Servicos utilizados:
 * - contas/cpfl/download-ocr: Download da fatura + leitura OCR dos dados
 * - contas/cpfl/download: Apenas download da fatura PDF
 *
 * A RGE Sul faz parte do grupo CPFL, entao usa o mesmo endpoint.
 * A API retorna dados da fatura mais recente da instalacao,
 * incluindo consumo, valores, creditos GD e codigo de barras.
 */

import { EMPTY_GRUPO_A_BILL_FIELDS } from "./fatura-pdf-parser-grupo-a";

const INFOSIMPLES_BASE_URL = "https://api.infosimples.com/api/v2/consultas/contas/cpfl/download-ocr";

export interface InfosimplesBillResponse {
  code: number;
  code_message: string;
  header: Record<string, unknown>;
  data: InfosimplesBillData[];
  errors: string[];
  site_receipts: string[];
}

/**
 * Resposta do endpoint download-ocr:
 * - Campos do download (conta_paga, instalacao, mes, nome, valor, vencimento)
 * - Campos do OCR dentro do array "ocr" (cliente, codigo_barras, energia, leituras, tributos, etc.)
 *
 * IMPORTANTE: ocr vem como ARRAY (múltiplas páginas/faturas OCR'd), não objeto.
 */
export interface InfosimplesOcrConsumoItem {
  descricao?: string;
  unidade?: string;
  quantidade_faturada?: string;
  tarifa_aneel?: string;
  tarifa_com_tributos?: string;
  valor_total?: string;
  base_icms?: string;
  aliquota_icms?: string;
  icms?: string;
  pis?: string;
  cofins?: string;
  [key: string]: unknown;
}

export interface InfosimplesOcrItem {
  cliente?: Record<string, unknown>;
  leituras?: {
    leitura_anterior_data?: string;
    leitura_atual_data?: string;
    proxima_leitura_data?: string;
    dias_leitura?: string;
  };
  mes?: number;
  ano?: number;
  valor_total?: string;
  normalizado_valor_total?: number | string;
  vencimento?: string;
  aviso?: string;
  energia?: {
    consumo?: InfosimplesOcrConsumoItem[];
    outros_debitos?: Array<{ descricao?: string; valor_total?: string | null }>;
    historico_consumo?: Array<{ mes_ano?: string; kwh?: string; dias?: string }>;
    medidor?: Array<{
      numero_medidor?: string;
      leitura_anterior?: string;
      leitura_atual?: string;
      consumo_kwh?: string;
      constante_medidor?: string;
      grandeza?: string;
    }>;
  };
  tributos?: Array<{
    tributo?: string;
    base_calculo?: string;
    aliquota?: string;
    valor_total?: string;
  }>;
  codigo_barras?: string;
  ref_mes?: string;
  ref_ano?: string;
  nota_fiscal?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface InfosimplesBillData {
  // Campos do download
  conta_paga: boolean | string;
  instalacao: string;
  mes: string;               // "01/04/2026"
  nome: string;
  valor: string;             // "R$ 125,50"
  normalizado_valor: number | string;
  vencimento: string;        // "15/03/2026"
  normalizado_vencimento: string; // "2026-03-15"

  // OCR vem como array
  ocr?: InfosimplesOcrItem[];

  pdf_url?: string;
  site_receipt?: string;
  site_receipts?: string[];

  [key: string]: unknown;
}

export interface InfosimplesRequest {
  email: string;
  senha: string;
  instalacao: string;
}

export class InfosimplesApiError extends Error {
  constructor(
    message: string,
    public code: number,
    public errors: string[]
  ) {
    super(message);
    this.name = "InfosimplesApiError";
  }
}

export async function consultarFatura(
  params: InfosimplesRequest
): Promise<InfosimplesBillData[]> {
  const token = process.env.INFOSIMPLES_API_TOKEN;
  if (!token) {
    throw new InfosimplesApiError(
      "Token da API Infosimples nao configurado. Configure INFOSIMPLES_API_TOKEN no .env",
      0,
      ["MISSING_TOKEN"]
    );
  }

  const body = new URLSearchParams({
    token,
    email: params.email,
    senha: params.senha,
    instalacao: params.instalacao,
    timeout: "300",
  });

  const response = await fetch(INFOSIMPLES_BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new InfosimplesApiError(
      `Erro HTTP ${response.status} na API Infosimples`,
      response.status,
      [`HTTP_${response.status}`]
    );
  }

  const result: InfosimplesBillResponse = await response.json();

  // Codigos da Infosimples: 200 = sucesso, outros = erro
  if (result.code !== 200) {
    throw new InfosimplesApiError(
      result.code_message || "Erro na consulta Infosimples",
      result.code,
      result.errors || []
    );
  }

  // A API coloca site_receipts (URLs dos PDFs) no nível raiz da resposta,
  // não dentro de cada item de data. Aqui propagamos para cada fatura:
  // pareando por índice quando possível, caindo no primeiro receipt como fallback.
  const receipts = result.site_receipts ?? [];
  return result.data.map((d, i) => ({
    ...d,
    site_receipts: d.site_receipts ?? (receipts[i] ? [receipts[i]] : receipts.length > 0 ? [receipts[0]] : undefined),
  }));
}

/**
 * Converte dados da API Infosimples para o formato do banco de dados (ConsumerBill).
 *
 * Estrutura real da resposta CPFL/RGE:
 * - `ocr` é um ARRAY; geralmente só item [0] interessa.
 * - `ocr[0].energia.consumo` é um ARRAY de itens (Consumo TUSD/TE, Energ Atv Inj, bandeiras, etc).
 * - `ocr[0].energia.medidor[0].consumo_kwh` traz o consumo agregado do mês.
 * - `ocr[0].aviso` é um texto livre onde aparece "Saldo em Energia da Instalação: ... kWh".
 * - `ocr[0].tributos` é um ARRAY com ICMS, PIS/PASEP, COFINS.
 */
export function parseBillData(data: InfosimplesBillData) {
  const ocr = Array.isArray(data.ocr) ? data.ocr[0] : undefined;

  // Referencia
  const refMesStr = ocr?.ref_mes ? String(ocr.ref_mes) : "";
  const refAno = ocr?.ref_ano ? parseInt(String(ocr.ref_ano)) : 0;
  const refMesNum = ocr?.mes ?? parseMesAbreviado(refMesStr);
  const anoOcr = ocr?.ano ?? refAno;
  const { mes, ano } = (refMesNum && anoOcr)
    ? { mes: refMesNum, ano: anoOcr }
    : parseReferencia(data.mes || "");

  // Valores / vencimento
  const valorTotal = parseNum(ocr?.normalizado_valor_total)
    ?? parseNum(ocr?.valor_total)
    ?? parseNum(data.normalizado_valor);
  const vencimento = parseDate(ocr?.vencimento)
    ?? parseDateISO(data.normalizado_vencimento)
    ?? parseDate(data.vencimento);

  // Energia — trabalhar com arrays
  const energia = ocr?.energia;
  const consumoItems = energia?.consumo ?? [];
  const medidores = energia?.medidor ?? [];
  // Medidor "principal" (Energia Ativa): primeiro que não for injetada.
  const medidor = medidores.find((m) => !normDesc(m?.grandeza).includes("inj")) ?? medidores[0];
  // Medidor de injeção (fatura de usina): grandeza contém "injetada".
  const medidorInj = medidores.find((m) => normDesc(m?.grandeza).includes("inj"));
  const leituras = ocr?.leituras;

  // Consumo: preferir medidor, fallback para primeiro item "Consumo"
  const consumoKwh =
    parseNum(medidor?.consumo_kwh)
    ?? parseConsumoFromItems(consumoItems);

  // Leituras
  const leituraAnterior = parseNum(medidor?.leitura_anterior);
  const leituraAtual = parseNum(medidor?.leitura_atual);
  const diasFaturamento = parseIntSafe(leituras?.dias_leitura);
  const proximaLeitura = parseDate(leituras?.proxima_leitura_data);
  // Datas do ciclo de leitura — janela real da fatura, não coincide com mês calendário.
  const dataLeituraAnterior = parseDate(leituras?.leitura_anterior_data);
  const dataLeituraAtual = parseDate(leituras?.leitura_atual_data);

  // Consumo faturado TE e TUSD (quantidade + valor do mês atual)
  const consumoDetalhado = parseConsumoDetalhado(consumoItems);

  // Custo de Disp. Energia (fatura de usina / B3 mínimo de 100 kWh)
  const custoDisp = parseCustoDisp(consumoItems);

  // Leituras de injeção do medidor (fatura de usina)
  const leituraInjetadaAnterior = parseNum(medidorInj?.leitura_anterior);
  const leituraInjetadaAtual = parseNum(medidorInj?.leitura_atual);
  const constanteMedidorInjetada = parseNum(medidorInj?.constante_medidor);
  const energiaInjetadaMedidorKwh = parseNum(medidorInj?.consumo_kwh);

  // Energia injetada oUC — soma por lado (TE ou TUSD dão mesma qtd total).
  // Em faturas com OCR parcialmente corrompido (colunas deslocadas), um dos lados pode vir
  // incompleto. Usamos o maior dos dois para refletir o total real compensado.
  const injetada = parseInjetadaOuc(consumoItems);
  const energiaInjetada = maxLado(injetada.tusdKwh, injetada.teKwh);
  const energiaCompensada = energiaInjetada;

  // Tarifas: pegar tarifa_aneel das linhas "Consumo - TE" e "Consumo ... TUSD"
  const { tarifaTE, tarifaTUSD } = parseTarifas(consumoItems);

  // Bandeira: procurar linhas de bandeira em consumo; default Verde se nenhuma aparece
  const bandeiraTarifaria = parseBandeira(consumoItems);
  const bandeiraValor = parseBandeiraValor(consumoItems);

  // Aviso: saldo, participação, saldo a expirar
  const saldoCreditos = parseSaldoCreditos(ocr?.aviso);
  const saldoInstalacaoKwh = saldoCreditos;
  const saldoExpirarProxMesKwh = parseSaldoExpirar(ocr?.aviso);
  const participacaoGeracaoPct = parseParticipacaoGeracao(ocr?.aviso);

  // Tributos (array)
  const tributos = ocr?.tributos ?? [];
  const icms = parseTributo(tributos, "ICMS");
  const pis = parseTributo(tributos, "PIS");
  const cofins = parseTributo(tributos, "COFINS");

  // Outros débitos: juros, multa, atualização, IP/CIP, ajuste de saldo
  const outrosDebitos = ocr?.energia?.outros_debitos ?? [];
  const encargos = parseEncargos(outrosDebitos, consumoItems);

  // Histórico de consumo (13 meses)
  const historicoConsumo = parseHistoricoConsumo(ocr?.energia?.historico_consumo);

  return {
    mesReferencia: mes,
    anoReferencia: ano,
    instalacao: data.instalacao || null,
    valorTotal,
    vencimento,
    contaPaga: data.conta_paga === true || data.conta_paga === "true" || data.conta_paga === "sim",
    codigoBarras: ocr?.codigo_barras ?? null,
    consumoKwh,
    leituraAnterior,
    leituraAtual,
    diasFaturamento,
    proximaLeitura,
    dataLeituraAnterior,
    dataLeituraAtual,

    // Novos: consumo faturado TE/TUSD
    consumoTeKwh: consumoDetalhado.teKwh,
    consumoTeValor: consumoDetalhado.teValor,
    consumoTusdKwh: consumoDetalhado.tusdKwh,
    consumoTusdValor: consumoDetalhado.tusdValor,

    // GD
    energiaInjetada,
    energiaCompensada,
    saldoCreditos,

    // Novos: injetada oUC agregada + detalhamento por mês de origem
    injetadaOucTeKwh: injetada.teKwh,
    injetadaOucTeValor: injetada.teValor,
    injetadaOucTusdKwh: injetada.tusdKwh,
    injetadaOucTusdValor: injetada.tusdValor,
    injetadaDetalhes: injetada.detalhes.length > 0 ? JSON.stringify(injetada.detalhes) : null,

    // Novos: histórico 13 meses
    historicoConsumo: historicoConsumo ? JSON.stringify(historicoConsumo) : null,

    // Novos: saldo detalhado
    saldoInstalacaoKwh,
    saldoExpirarProxMesKwh,
    participacaoGeracaoPct,

    // Novos: leitura física da injeção (usina)
    energiaInjetadaMedidorKwh,
    leituraInjetadaAnterior,
    leituraInjetadaAtual,
    constanteMedidorInjetada,

    // Novos: Custo de Disponibilidade (B3 trifásico 100 kWh)
    custoDispTusdKwh: custoDisp.tusdKwh,
    custoDispTusdValor: custoDisp.tusdValor,
    custoDispTeKwh: custoDisp.teKwh,
    custoDispTeValor: custoDisp.teValor,

    tarifaTE,
    tarifaTUSD,
    bandeiraTarifaria,
    bandeiraValor,
    icms,
    pis,
    cofins,

    // Novos: encargos
    jurosMora: encargos.jurosMora,
    multaAtraso: encargos.multaAtraso,
    atualizacaoMonetaria: encargos.atualizacaoMonetaria,
    iluminacaoPublicaCip: encargos.iluminacaoPublicaCip,
    ajusteSaldoCredito: encargos.ajusteSaldoCredito,

    pdfUrl: data.pdf_url || data.site_receipt || data.site_receipts?.[0] || null,
    fonteConsulta: "INFOSIMPLES" as const,
    rawJson: JSON.stringify(data),

    // Grupo A — placeholder até confirmarmos o formato do payload OCR Infosimples
    // pra Grupo A. Quando o primeiro payload chegar, popular com extração análoga
    // ao parseBillData (consumo, demanda, ultrapassagem, TUSD-G, reativo, saldo P/FP).
    // Veja: src/lib/fatura-pdf-parser-grupo-a.ts (referência da estrutura).
    ...EMPTY_GRUPO_A_BILL_FIELDS,
  };
}

/** Normaliza descrição para matching case/acento-insensitive. */
function normDesc(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** "ABR" → 4, "JAN" → 1. */
function parseMesAbreviado(s: string): number {
  const map: Record<string, number> = {
    jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
    jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
  };
  const key = normDesc(s).slice(0, 3);
  return map[key] ?? 0;
}

/** Soma não funciona (duplicaria TUSD+TE). Pega só o primeiro item "Consumo". */
function parseConsumoFromItems(items: InfosimplesOcrConsumoItem[]): number | null {
  for (const it of items) {
    const d = normDesc(it.descricao);
    if (d.startsWith("consumo") && !d.includes("inj") && !d.includes("bandeira")) {
      return parseNum(it.quantidade_faturada);
    }
  }
  return null;
}

/** Retorna true se a linha for um Energ Atv Inj oUC */
function isInjecaoOuc(it: InfosimplesOcrConsumoItem): boolean {
  const d = normDesc(it.descricao);
  return d.includes("energ") && d.includes("inj");
}

/**
 * Detecta linhas de injeção com OCR "deslocado": em algumas faturas RGE Sul com múltiplos
 * meses de origem, o Infosimples retorna linhas onde as colunas estão deslocadas 2 posições
 * à esquerda — a descricao vira a tarifa_aneel, unidade vira tarifa_com_tributos, e
 * quantidade_faturada vira o valor_total (negativo, indicando crédito).
 * Nesse caso o kWh real precisa ser recalculado como |valor_total| / tarifa_com_tributos.
 */
function looksLikeShiftedInjectionOuc(it: InfosimplesOcrConsumoItem): boolean {
  const desc = String(it.descricao ?? "").trim();
  const unid = String(it.unidade ?? "").trim();
  const qtd = String(it.quantidade_faturada ?? "").trim();
  // descricao deve ser só um número de tarifa (ex.: "0,30445000")
  if (!/^0[.,]\d{3,}$/.test(desc)) return false;
  // unidade também (tarifa_com_tributos)
  if (!/^0[.,]\d{3,}$/.test(unid)) return false;
  // quantidade_faturada deve ser valor negativo (acaba com "-")
  if (!qtd.endsWith("-")) return false;
  return true;
}

/** "MAR/26", "Jun/2025" → "MAR/26" uppercase curto. Extrai do final da descrição. */
function extractMesOrigem(desc: unknown): string | null {
  const s = String(desc ?? "").toUpperCase();
  const m = s.match(/([A-Z]{3})\/(\d{2}(?:\d{2})?)/);
  if (!m) return null;
  const mes = m[1];
  const ano = m[2].length === 4 ? m[2].slice(-2) : m[2];
  return `${mes}/${ano}`;
}

export interface InjetadaDetalhe {
  mesOrigem: string;
  teKwh: number | null;
  teValor: number | null;
  tusdKwh: number | null;
  tusdValor: number | null;
}

interface InjetadaResumo {
  teKwh: number | null;
  teValor: number | null;
  tusdKwh: number | null;
  tusdValor: number | null;
  detalhes: InjetadaDetalhe[];
}

/**
 * Processa todas as linhas "Energ Atv Inj. oUC ..." agrupando por mês de origem.
 * Cada origem aparece em duas linhas (TUSD + TE).
 * Totais = soma por lado (TE e TUSD dão a mesma qtd somada).
 */
function parseInjetadaOuc(items: InfosimplesOcrConsumoItem[]): InjetadaResumo {
  const byOrigem = new Map<string, InjetadaDetalhe>();
  let teKwhTotal = 0, teValorTotal = 0, tusdKwhTotal = 0, tusdValorTotal = 0;
  let temTe = false, temTusd = false;
  let lastOrigem: string | null = null;
  let shiftedIdx = 0;

  for (const it of items) {
    const isValid = isInjecaoOuc(it);
    const isShifted = !isValid && looksLikeShiftedInjectionOuc(it);
    if (!isValid && !isShifted) continue;

    let qtd: number | null;
    let valor: number | null;
    let origem: string;
    let isTusd: boolean;
    let isTe: boolean;

    if (isValid) {
      const d = normDesc(it.descricao);
      qtd = parseNum(it.quantidade_faturada);
      valor = parseNum(it.valor_total);
      origem = extractMesOrigem(it.descricao) ?? "SEM_ORIGEM";
      isTusd = d.includes("tusd");
      isTe = !isTusd && (d.includes(" te ") || d.endsWith(" te") || d.includes("- te") || d.includes("-te"));
      lastOrigem = origem;
    } else {
      // Linha com colunas deslocadas: descricao=tarifa_aneel, unidade=tarifa_com_tributos, qtd=valor_total
      const tarifaAneel = parseNum(it.descricao);
      const tarifaTrib = parseNum(it.unidade);
      valor = parseNum(it.quantidade_faturada);
      qtd = tarifaTrib && valor != null ? Math.abs(valor) / tarifaTrib : null;
      // Lado: tarifa_aneel ~0.30 = TE; ~0.33+ = TUSD
      isTe = tarifaAneel != null && tarifaAneel < 0.32;
      isTusd = tarifaAneel != null && tarifaAneel >= 0.32;
      // Origem não recuperável — usa chave sintética para não colidir com entradas válidas
      origem = `SHIFTED_${shiftedIdx++}`;
    }

    const entry = byOrigem.get(origem) ?? {
      mesOrigem: origem,
      teKwh: null,
      teValor: null,
      tusdKwh: null,
      tusdValor: null,
    };

    if (isTusd) {
      entry.tusdKwh = qtd;
      entry.tusdValor = valor;
      if (qtd != null) { tusdKwhTotal += qtd; temTusd = true; }
      if (valor != null) tusdValorTotal += valor;
    } else if (isTe) {
      entry.teKwh = qtd;
      entry.teValor = valor;
      if (qtd != null) { teKwhTotal += qtd; temTe = true; }
      if (valor != null) teValorTotal += valor;
    }
    byOrigem.set(origem, entry);
  }

  // evita "unused var" warning (lastOrigem fica disponível pra futura associação por proximidade)
  void lastOrigem;

  // Pós-processamento: funde linhas SHIFTED_* com origens válidas quando o kWh bate com o
  // lado faltante (ex.: SET/25 TUSD=1590,23 + SHIFTED_0 TE=1590,23 → fundir em SET/25).
  const KWH_TOLERANCE = 0.5;
  const valids: InjetadaDetalhe[] = [];
  const shifteds: InjetadaDetalhe[] = [];
  for (const entry of byOrigem.values()) {
    (entry.mesOrigem.startsWith("SHIFTED_") ? shifteds : valids).push(entry);
  }
  const mergedShiftedKeys = new Set<string>();
  for (const s of shifteds) {
    const sKwh = s.teKwh ?? s.tusdKwh;
    if (sKwh == null) continue;
    const match = valids.find((v) => {
      if (s.teKwh != null && v.teKwh == null && v.tusdKwh != null) {
        return Math.abs(v.tusdKwh - sKwh) < KWH_TOLERANCE;
      }
      if (s.tusdKwh != null && v.tusdKwh == null && v.teKwh != null) {
        return Math.abs(v.teKwh - sKwh) < KWH_TOLERANCE;
      }
      return false;
    });
    if (match) {
      if (s.teKwh != null) { match.teKwh = s.teKwh; match.teValor = s.teValor; }
      if (s.tusdKwh != null) { match.tusdKwh = s.tusdKwh; match.tusdValor = s.tusdValor; }
      mergedShiftedKeys.add(s.mesOrigem);
    }
  }
  const detalhes = [
    ...valids,
    ...shifteds.filter((s) => !mergedShiftedKeys.has(s.mesOrigem)),
  ];

  return {
    teKwh: temTe ? teKwhTotal : null,
    teValor: temTe ? teValorTotal : null,
    tusdKwh: temTusd ? tusdKwhTotal : null,
    tusdValor: temTusd ? tusdValorTotal : null,
    detalhes,
  };
}

interface ConsumoDetalhado {
  teKwh: number | null;
  teValor: number | null;
  tusdKwh: number | null;
  tusdValor: number | null;
}

/** Extrai quantidade e valor_total das linhas "Consumo - TE" e "Consumo ... TUSD" do mês atual. */
function parseConsumoDetalhado(items: InfosimplesOcrConsumoItem[]): ConsumoDetalhado {
  const out: ConsumoDetalhado = { teKwh: null, teValor: null, tusdKwh: null, tusdValor: null };
  for (const it of items) {
    const d = normDesc(it.descricao);
    if (!d.startsWith("consumo") || d.includes("inj") || d.includes("bandeira")) continue;
    const qtd = parseNum(it.quantidade_faturada);
    const valor = parseNum(it.valor_total);
    if (d.includes("tusd")) {
      if (out.tusdKwh == null) out.tusdKwh = qtd;
      if (out.tusdValor == null) out.tusdValor = valor;
    } else if (d.includes(" te ") || d.endsWith(" te") || d.includes("- te") || d.includes("-te")) {
      if (out.teKwh == null) out.teKwh = qtd;
      if (out.teValor == null) out.teValor = valor;
    }
  }
  return out;
}

/**
 * Custo de Disponibilidade (fatura de usina / B3 mínimo de 100 kWh).
 * Linhas "Custo de Disp. Energia TUSD" / "Custo de Disp. Energia - TE".
 */
function parseCustoDisp(items: InfosimplesOcrConsumoItem[]): ConsumoDetalhado {
  const out: ConsumoDetalhado = { teKwh: null, teValor: null, tusdKwh: null, tusdValor: null };
  for (const it of items) {
    const d = normDesc(it.descricao);
    if (!d.includes("disp") || !d.includes("energ") || d.includes("inj")) continue;
    const qtd = parseNum(it.quantidade_faturada);
    const valor = parseNum(it.valor_total);
    if (d.includes("tusd")) {
      if (out.tusdKwh == null) out.tusdKwh = qtd;
      if (out.tusdValor == null) out.tusdValor = valor;
    } else if (d.includes(" te ") || d.endsWith(" te") || d.includes("- te") || d.includes("-te")) {
      if (out.teKwh == null) out.teKwh = qtd;
      if (out.teValor == null) out.teValor = valor;
    }
  }
  return out;
}

export interface HistoricoConsumoItem {
  mesAno: string;
  consumoKwh: number | null;
  dias: number | null;
}

/** Converte energia.historico_consumo em array limpo. */
function parseHistoricoConsumo(
  historico: Array<{ mes_ano?: string; kwh?: string; dias?: string }> | undefined,
): HistoricoConsumoItem[] | null {
  if (!historico || historico.length === 0) return null;
  return historico.map((h) => ({
    mesAno: String(h.mes_ano ?? "").toUpperCase().replace(/\s+/g, "/").replace(/\/+/g, "/"),
    consumoKwh: parseNum(h.kwh),
    dias: parseIntSafe(h.dias),
  }));
}

interface Encargos {
  jurosMora: number | null;
  multaAtraso: number | null;
  atualizacaoMonetaria: number | null;
  iluminacaoPublicaCip: number | null;
  ajusteSaldoCredito: number | null;
}

/**
 * Extrai encargos de outros_debitos e consumo_items (RGE às vezes joga juros/multa
 * na seção "Descrição da operação", não em outros_debitos).
 */
function parseEncargos(
  outros: Array<{ descricao?: string; valor_total?: string | null }>,
  items: InfosimplesOcrConsumoItem[],
): Encargos {
  const out: Encargos = {
    jurosMora: null,
    multaAtraso: null,
    atualizacaoMonetaria: null,
    iluminacaoPublicaCip: null,
    ajusteSaldoCredito: null,
  };

  const scan = (desc: unknown, valor: unknown) => {
    const d = normDesc(desc);
    const v = parseNum(valor);
    if (v == null) return;
    if (d.includes("juros") && d.includes("mora")) out.jurosMora ??= v;
    else if (d.includes("multa") && d.includes("atraso")) out.multaAtraso ??= v;
    else if (d.includes("atualizacao") && d.includes("monetaria")) out.atualizacaoMonetaria ??= v;
    else if ((d.includes("ilumin") && d.includes("public")) || d.includes("cip") || d.includes("custeio ip"))
      out.iluminacaoPublicaCip ??= v;
    else if (d.includes("ajuste") && d.includes("saldo")) out.ajusteSaldoCredito ??= v;
  };

  for (const it of outros) scan(it.descricao, it.valor_total);
  for (const it of items) scan(it.descricao, it.valor_total);

  return out;
}

/** Regex no aviso: "Saldo a expirar próximo mês: 0,0000000000 kWh" */
function parseSaldoExpirar(aviso: string | undefined): number | null {
  if (!aviso) return null;
  const m = aviso.match(/saldo a expirar[^0-9]*([\d.]+(?:,\d+)?)\s*kwh/i);
  if (!m) return null;
  return parseNum(m[1]);
}

/** Regex no aviso: "Participação na geração 42.0000%" */
function parseParticipacaoGeracao(aviso: string | undefined): number | null {
  if (!aviso) return null;
  const m = aviso.match(/participac[aã]o na gerac[aã]o[^0-9]*([\d.,]+)\s*%?/i);
  if (!m) return null;
  return parseNum(m[1]);
}

/** Extrai tarifas TE e TUSD (tarifa_aneel) das linhas de Consumo. */
function parseTarifas(items: InfosimplesOcrConsumoItem[]): { tarifaTE: number | null; tarifaTUSD: number | null } {
  let tarifaTE: number | null = null;
  let tarifaTUSD: number | null = null;
  for (const it of items) {
    const d = normDesc(it.descricao);
    if (!d.startsWith("consumo") || d.includes("inj") || d.includes("bandeira")) continue;
    const v = parseNum(it.tarifa_aneel);
    if (v == null) continue;
    if (d.includes("tusd") && tarifaTUSD == null) tarifaTUSD = v;
    else if ((d.includes(" te ") || d.endsWith(" te") || d.includes("- te")) && tarifaTE == null) tarifaTE = v;
  }
  return { tarifaTE, tarifaTUSD };
}

/** Procura linhas de bandeira nos consumo items. Ausência = Verde. */
function parseBandeira(items: InfosimplesOcrConsumoItem[]): string | null {
  for (const it of items) {
    const d = normDesc(it.descricao);
    if (!d.includes("bandeira")) continue;
    if (d.includes("vermelha 2")) return "Vermelha 2";
    if (d.includes("vermelha")) return "Vermelha 1";
    if (d.includes("amarela")) return "Amarela";
    if (d.includes("verde")) return "Verde";
  }
  return "Verde";
}

/**
 * Soma o valor em R$ de todas as linhas de bandeira. Pode haver mais de uma
 * (ex.: transição de bandeira no mês). Retorna null se nenhuma linha aparece.
 */
function parseBandeiraValor(items: InfosimplesOcrConsumoItem[]): number | null {
  let total = 0;
  let encontrou = false;
  for (const it of items) {
    const d = normDesc(it.descricao);
    if (!d.includes("bandeira")) continue;
    const v = parseNum(it.valor_total);
    if (v == null) continue;
    total += v;
    encontrou = true;
  }
  return encontrou ? total : null;
}

/** Regex no texto "aviso" para "Saldo em Energia da Instalação: ... 1.059,0000 kWh". */
function parseSaldoCreditos(aviso: string | undefined): number | null {
  if (!aviso) return null;
  const m = aviso.match(/saldo em energia[^0-9]*([\d.]+(?:,\d+)?)\s*kwh/i);
  if (!m) return null;
  return parseNum(m[1]);
}

/** Extrai valor_total de um tributo do array (match por prefixo). */
function parseTributo(
  tributos: Array<{ tributo?: string; valor_total?: string }>,
  prefix: string
): number | null {
  const p = normDesc(prefix);
  for (const t of tributos) {
    if (normDesc(t.tributo).startsWith(p)) return parseNum(t.valor_total);
  }
  return null;
}

function parseNum(val: unknown): number | null {
  if (val == null || val === "") return null;
  if (typeof val === "number") return isNaN(val) ? null : val;
  // Tratar formatos brasileiros: "1.234,56" -> 1234.56 e "R$ 125,50" -> 125.50
  let str = String(val).replace(/[R$\s]/g, "");
  // Trailing "-" means negative (ex.: "116,81-")
  let negative = false;
  if (str.endsWith("-")) {
    negative = true;
    str = str.slice(0, -1);
  }
  // Formato BR com vírgula decimal: remove pontos (milhar), troca vírgula por ponto
  if (str.includes(",")) {
    const normalized = str.replace(/\./g, "").replace(",", ".");
    const num = parseFloat(normalized);
    return isNaN(num) ? null : negative ? -num : num;
  }
  // Sem vírgula: se tem ponto seguido de exatamente 3 dígitos em qualquer posição,
  // trata todos os pontos como separador de milhar BR ("3.414" -> 3414, "1.234.567" -> 1234567).
  if (/\.\d{3}(?:\.|$)/.test(str)) {
    const num = parseInt(str.replace(/\./g, ""), 10);
    return isNaN(num) ? null : negative ? -num : num;
  }
  const num = parseFloat(str);
  return isNaN(num) ? null : negative ? -num : num;
}

/** Retorna o maior dos dois valores, ignorando null. */
function maxLado(a: number | null, b: number | null): number | null {
  if (a == null) return b;
  if (b == null) return a;
  return Math.max(a, b);
}

function parseIntSafe(val: unknown): number | null {
  if (val == null || val === "") return null;
  const num = parseInt(String(val));
  return isNaN(num) ? null : num;
}

function parseReferencia(ref: string): { mes: number; ano: number } {
  if (!ref) return { mes: 1, ano: new Date().getFullYear() };

  // Tentar formato "03/2026" ou "3/2026"
  const numericMatch = ref.match(/(\d{1,2})\/?(\d{4})/);
  if (numericMatch) {
    return { mes: parseInt(numericMatch[1]), ano: parseInt(numericMatch[2]) };
  }

  // Tentar formato "janeiro/2026" ou "marco/2026"
  const meses: Record<string, number> = {
    janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6,
    julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
  };
  const parts = ref.toLowerCase().split("/");
  if (parts.length === 2 && meses[parts[0]]) {
    return { mes: meses[parts[0]], ano: parseInt(parts[1]) };
  }

  return { mes: 1, ano: new Date().getFullYear() };
}

function parseDate(dateStr: string | undefined | null): Date | null {
  if (!dateStr) return null;
  // Formato "15/01/2026"
  const match = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (match) {
    return new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
  }
  return null;
}

function parseDateISO(dateStr: string | undefined | null): Date | null {
  if (!dateStr) return null;
  // Formato "2026-03-15"
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

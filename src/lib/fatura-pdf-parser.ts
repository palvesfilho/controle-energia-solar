/**
 * Parser de fatura RGE Sul / CPFL em PDF.
 *
 * Extrai texto via pdfjs-dist (mesmo pattern do anexo-f-parser) e retorna
 * uma estrutura compatível com o output do parseBillData do infosimples.ts,
 * de modo que possa ser persistida no ConsumerBill pelo mesmo upsert.
 *
 * Cobre os cenários observados na amostra:
 *  - Faturas de 1 ou 2 páginas (RGE Sul imprime página 1 com valores
 *    mascarados quando há cobrança ativa; valores reais só na página 2).
 *  - Energia injetada oUC vinda de múltiplos meses de origem (soma por lado).
 *  - Histórico "Consumo / kWh" dos 13 últimos meses (mes-ano, kwh, dias).
 *
 * NÃO faz fallback de OCR (scanneadas). PDFs sem camada de texto falham —
 * o upload retorna erro e o admin sobe outro.
 */

import type { InjetadaDetalhe, HistoricoConsumoItem } from "./infosimples";
import {
  extractGrupoA,
  grupoAToBillFields,
  type GrupoAData,
  type GrupoABillFields,
} from "./fatura-pdf-parser-grupo-a";
import { ehNovaPalma, parseNovaPalma } from "./fatura-pdf-parser-nova-palma";
import { dateOnlyUTC, parseDateOnlyBR } from "./date-only";

interface TextItem {
  str: string;
  transform: number[];
}

async function extractLines(buffer: Uint8Array): Promise<string[]> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    const { join } = await import("node:path");
    const { pathToFileURL } = await import("node:url");
    const workerPath = join(
      process.cwd(),
      "node_modules",
      "pdfjs-dist",
      "legacy",
      "build",
      "pdf.worker.mjs",
    );
    pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
  }

  const doc = await pdfjsLib.getDocument({
    data: buffer,
    useSystemFonts: true,
    disableFontFace: true,
  }).promise;

  const allLines: string[] = [];
  const Y_TOLERANCE = 3;

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();

    const items = (content.items as TextItem[])
      .filter((i) => i.str && i.str.trim())
      .map((i) => ({ x: i.transform[4], y: i.transform[5], str: i.str }))
      .sort((a, b) => b.y - a.y);

    const clusters: Array<{ y: number; items: Array<{ x: number; str: string }> }> = [];
    for (const it of items) {
      const last = clusters[clusters.length - 1];
      if (last && Math.abs(last.y - it.y) <= Y_TOLERANCE) {
        last.items.push({ x: it.x, str: it.str });
      } else {
        clusters.push({ y: it.y, items: [{ x: it.x, str: it.str }] });
      }
    }

    for (const cluster of clusters) {
      cluster.items.sort((a, b) => a.x - b.x);
      const line = cluster.items.map((i) => i.str).join(" ").replace(/\s+/g, " ").trim();
      if (line) allLines.push(line);
    }
  }

  await doc.destroy();
  return allLines;
}

const MES_ABRV: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

function normDesc(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function isMasked(s: string | undefined | null): boolean {
  return !!s && /\*{3,}/.test(s);
}

function parseNumBR(raw: string | undefined | null): number | null {
  if (!raw) return null;
  let str = raw.trim().replace(/R\$\s*/gi, "").replace(/\s/g, "");
  if (!str) return null;
  if (isMasked(str)) return null;
  let negative = false;
  if (str.endsWith("-")) {
    negative = true;
    str = str.slice(0, -1);
  }
  if (str.includes(",")) {
    const n = parseFloat(str.replace(/\./g, "").replace(",", "."));
    return isNaN(n) ? null : negative ? -n : n;
  }
  if (/\.\d{3}(?:\.|$)/.test(str)) {
    const n = parseInt(str.replace(/\./g, ""), 10);
    return isNaN(n) ? null : negative ? -n : n;
  }
  const n = parseFloat(str);
  return isNaN(n) ? null : negative ? -n : n;
}

// Data-calendário ancorada em 12:00 UTC (ver date-only.ts) — não meia-noite
// local, que gravava o dia anterior quando o processo roda em UTC.
function parseDateBR(s: string | undefined | null): Date | null {
  return parseDateOnlyBR(s);
}

function extractMesOrigem(s: string): string | null {
  const m = s.toUpperCase().match(/([A-Z]{3})\/(\d{2}(?:\d{2})?)/);
  if (!m) return null;
  const mes = m[1];
  const ano = m[2].length === 4 ? m[2].slice(-2) : m[2];
  return `${mes}/${ano}`;
}

/**
 * "Devol Pagamento Indevido" — linha da seção CRÉDITOS / DEVOLUÇÕES da RGE/CPFL.
 *
 * A concessionária devolve na conta do mês um valor pago a maior numa conta
 * ANTERIOR, e já o abateu do total impresso (LABIMED jul/26: Total Distribuidora
 * 311,13 + CIP 18,78 − Devol 329,91 = R$ 0,00, "conta quitada"). Devolvemos o
 * valor como vem impresso — NEGATIVO. Quem soma de volta é o billing-calculator,
 * e só em fatura única, onde quem pagou a conta antiga foi a nossa empresa.
 *
 * Casamos ancorado no rótulo em vez de pegar o 1º número da linha porque o pdfjs
 * clusteriza o histograma de consumo na mesma altura ("…329,91- lllll JUL 25 628
 * 31") e o mês de origem às vezes vem entre a descrição e o valor
 * ("Devol Pagamento Indevido SET/25 246,96-").
 *
 * Exportada porque o backfill das faturas já gravadas precisa da MESMA regra —
 * duas cópias divergem no primeiro layout novo.
 */
export function extrairDevolPagamentoIndevido(lines: string[]): number | null {
  const REGEX_DEVOL =
    /devol\w*\s+pagamento\s+indevid\w*\s+(?:[a-z]{3}\/\d{2,4}\s+)?(-?\d{1,3}(?:\.\d{3})*,\d{2}-?)/;
  let total: number | null = null;
  for (const line of lines) {
    const m = normDesc(line).match(REGEX_DEVOL);
    if (!m) continue;
    const v = parseNumBR(m[1]);
    // Fatura atrasada pode trazer mais de uma devolução; somamos, como nos encargos.
    if (v != null) total = (total ?? 0) + v;
  }
  return total;
}

/**
 * Total da fatura pela LINHA DE TOTAIS que a RGE imprime no rodapé do quadro de
 * tributos: `[TOTAL] [base ICMS] [ICMS] [PIS] [COFINS]` — cinco valores, sem
 * rótulo nenhum (ex.: `0,00 525,90 89,40 1,79 8,39`).
 *
 * Por que existe: quando há débito em aberto, a RGE MASCARA o total no cabeçalho
 * (`R$ **********`) e o valor real só sairia na página 2 — que em vários PDFs
 * vem sem camada de texto. Nessas faturas o total ficava `null`, a tela de
 * Fechamento marcava "Sem valor total" e a UC aparecia com erro mesmo com a
 * cobrança certa. É o caso das contas zeradas por devolução
 * (`Conta quitada, em razão de crédito de valor faturado à maior`).
 *
 * 🔑 A linha se auto-valida: só aceitamos aquela cuja 3ª coluna bate com o ICMS
 * que o parser leu por outro caminho (`ICMS 525,90 17,00 89,40`). Sem essa
 * âncora seria só "uma linha com cinco números".
 *
 * ⛔ NÃO tente derivar o total somando as seções (`Total Distribuidora` + CIP +
 * devoluções): parece certo em algumas faturas e erra em 388 de 1.752 da base.
 * Esta leitura bate em 1.718 e não diverge em nenhuma.
 */
export function extrairTotalPelaLinhaDeTributos(
  lines: string[],
  icms: number | null,
): number | null {
  if (icms == null) return null;
  const REGEX_BRL_GLOBAL = /-?\d{1,3}(?:\.\d{3})*,\d{2}-?/g;
  for (const line of lines) {
    // Só linhas puramente numéricas — qualquer letra sobrando é outra coisa.
    if (/[a-zA-Z]/.test(line.replace(/[.,\d\s-]/g, ""))) continue;
    const nums = (line.match(REGEX_BRL_GLOBAL) ?? [])
      .map(parseNumBR)
      .filter((v): v is number => v != null);
    if (nums.length !== 5) continue;
    if (Math.abs(nums[2] - icms) < 0.005) return nums[0];
  }
  return null;
}

export interface ParsedFaturaPdf {
  /** Informação suficiente pra achar a UC correspondente. */
  codigoInstalacao: string | null;

  /** Payload pronto pra upsert no ConsumerBill. Mesma forma do parseBillData. */
  bill: {
    mesReferencia: number;
    anoReferencia: number;
    instalacao: string | null;
    valorTotal: number | null;
    vencimento: Date | null;
    contaPaga: boolean;
    codigoBarras: string | null;

    consumoKwh: number | null;
    leituraAnterior: number | null;
    leituraAtual: number | null;
    diasFaturamento: number | null;
    proximaLeitura: Date | null;
    dataLeituraAnterior: Date | null;
    dataLeituraAtual: Date | null;

    consumoTeKwh: number | null;
    consumoTeValor: number | null;
    consumoTusdKwh: number | null;
    consumoTusdValor: number | null;

    energiaInjetada: number | null;
    energiaCompensada: number | null;
    saldoCreditos: number | null;

    injetadaOucTeKwh: number | null;
    injetadaOucTeValor: number | null;
    injetadaOucTusdKwh: number | null;
    injetadaOucTusdValor: number | null;
    energiaInjetadaPropriaTeKwh: number | null;
    energiaInjetadaPropriaTeValor: number | null;
    energiaInjetadaPropriaTusdKwh: number | null;
    energiaInjetadaPropriaTusdValor: number | null;
    injetadaDetalhes: string | null;

    historicoConsumo: string | null;

    saldoInstalacaoKwh: number | null;
    saldoExpirarProxMesKwh: number | null;
    participacaoGeracaoPct: number | null;

    energiaInjetadaMedidorKwh: number | null;
    leituraInjetadaAnterior: number | null;
    leituraInjetadaAtual: number | null;
    constanteMedidorInjetada: number | null;

    // Grupo A injeta nos dois postos — o total acima não substitui a quebra.
    energiaInjetadaMedidorPontaKwh: number | null;
    leituraInjetadaPontaAnterior: number | null;
    leituraInjetadaPontaAtual: number | null;
    energiaInjetadaMedidorForaPontaKwh: number | null;
    leituraInjetadaForaPontaAnterior: number | null;
    leituraInjetadaForaPontaAtual: number | null;

    custoDispTusdKwh: number | null;
    custoDispTusdValor: number | null;
    custoDispTeKwh: number | null;
    custoDispTeValor: number | null;

    tarifaTE: number | null;
    tarifaTUSD: number | null;
    tarifaTeComTributos: number | null;
    tarifaTusdComTributos: number | null;
    bandeiraTarifaria: string | null;
    bandeiraValor: number | null;
    // Bandeiras por cor — cobrança (positivo)
    bandeiraAmarelaValor: number | null;
    bandeiraVermelhaValor: number | null;
    bandeiraVermelha2Valor: number | null;
    // Créditos de bandeira por cor — descontos (negativo, vêm com "-" na fatura)
    bandeiraAmarelaCreditoValor: number | null;
    bandeiraVermelhaCreditoValor: number | null;
    bandeiraVermelha2CreditoValor: number | null;

    icms: number | null;
    pis: number | null;
    cofins: number | null;

    jurosMora: number | null;
    multaAtraso: number | null;
    atualizacaoMonetaria: number | null;
    iluminacaoPublicaCip: number | null;
    ajusteSaldoCredito: number | null;
    devolPagamentoIndevido: number | null;

    pdfUrl: string | null;
    fonteConsulta: "UPLOAD_MANUAL";
    rawJson: string;
  } & GrupoABillFields;

  /**
   * Estrutura rica de Grupo A (com leituras separadas, modalidade, subgrupo, etc.).
   * `null` quando a fatura é Grupo B. Os subset de campos planos compatíveis com
   * o schema Prisma já vão spreaded em `bill` (via grupoAToBillFields). Esta
   * versão é útil pra UIs que querem mostrar leituras detalhadas / modalidade.
   */
  grupoA: GrupoAData | null;

  /** Texto extraído (debug). */
  rawText: string;

  /**
   * Anomalias encontradas na extração (conferências que não fecharam). Sinalizar
   * pro operador em vez de silenciar — ver feedback_anomalias_sinalizar.
   * Só o parser da Nova Palma preenche hoje; na RGE vem undefined.
   */
  avisos?: string[];
}

export async function parseFaturaPdf(buffer: Uint8Array): Promise<ParsedFaturaPdf> {
  const lines = await extractLines(buffer);

  // A Nova Palma Energia (Faxinal do Soturno/RS) emite DANF3E com layout e
  // vocabulário próprios — desvia pro parser dedicado, que devolve o MESMO
  // ParsedFaturaPdf e portanto persiste pelo mesmo upsert.
  if (ehNovaPalma(lines)) return parseNovaPalma(lines);

  const rawText = lines.join("\n");

  // === Referência mês/ano ===
  // Linha típica: "MAR/2026 08/04/2026 R$ 1.161,28" ou "MAR/2026 08/04/2026 **********"
  let mesReferencia = 0;
  let anoReferencia = 0;
  let valorTotalHeader: number | null = null;
  let vencimentoHeader: Date | null = null;

  // Percorre todas as linhas que contenham o padrão MÊS/ANO e coleta a
  // melhor versão de venc/valor (página 1 na RGE vem mascarada quando há
  // débito ativo; a página 2 traz os valores reais).
  for (const line of lines) {
    const m = line.match(/\b([A-Z]{3})\/(\d{4})\b/);
    if (!m || !MES_ABRV[m[1].toLowerCase()]) continue;
    if (!mesReferencia) {
      mesReferencia = MES_ABRV[m[1].toLowerCase()];
      anoReferencia = parseInt(m[2]);
    }
    const rest = line.slice(m.index! + m[0].length);
    if (!vencimentoHeader) {
      const venc = rest.match(/(\d{2}\/\d{2}\/\d{4})/);
      if (venc) vencimentoHeader = parseDateBR(venc[1]);
    }
    if (valorTotalHeader == null) {
      const valor = rest.match(/R\$\s*([\d.,]+)/);
      if (valor) {
        const parsed = parseNumBR(valor[1]);
        if (parsed != null && parsed > 0) valorTotalHeader = parsed;
      }
    }
  }

  // === Identificador da UC (Código da Instalação OU Número da UC) ===
  // A RGE/CPFL migrou o identificador a partir da referência jul/2026 (REN ANEEL
  // 1095/24): faturas ANTIGAS trazem "Código da Instalação" com 10 dígitos puros
  // (ex. "4003655398"); faturas NOVAS trazem "Número da UC" no formato pontuado
  // "3.562.981.001-26". A fatura nova NÃO imprime o código antigo — o de-para
  // antigo→novo só existe no portal (robô conversor). Aqui extraímos o que a
  // fatura mostrar e normalizamos pra SÓ DÍGITOS, que é a forma canônica gravada
  // em ConsumerUnit.codigoUc / codigoUcAntigo e usada no match do ingest/upload.
  const onlyDigits = (s: string): string => s.replace(/\D/g, "");
  // Padrão do número novo: dígito + 3 grupos de 3 + traço + 2 (12 dígitos).
  // Inconfundível: CNPJ usa "/" antes dos 4 finais, CPF vem mascarado, código de
  // barras e chave de acesso não têm pontuação nesse arranjo.
  const NUMERO_UC_RE = /\b\d\.\d{3}\.\d{3}\.\d{3}-\d{2}\b/;
  // Variante CURTA de 11 dígitos, sem o primeiro grupo: "429.474.001-20".
  // Confirmada no portal da RGE (2026-07-22) em UCs antigas — não é zero comido
  // na digitação. ⚠️ Tem EXATAMENTE a forma de um CPF (3+3+3-2), então só pode
  // ser aceita colada no rótulo "Número da UC"; nunca numa varredura solta.
  const NUMERO_UC_CURTO_RE = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/;
  let codigoInstalacao: string | null = null;

  // (1) Formato NOVO ("Número da UC") — prioridade: só aparece em faturas migradas.
  for (const line of lines) {
    const m = line.match(NUMERO_UC_RE);
    if (m) { codigoInstalacao = onlyDigits(m[0]); break; }
  }

  // (1b) Formato NOVO curto — exige o rótulo por perto (ver aviso do CPF acima).
  if (!codigoInstalacao) {
    for (let i = 0; i < lines.length; i++) {
      if (!/n[uú]mero\s+da\s+uc/i.test(lines[i])) continue;
      for (let j = i; j < Math.min(i + 4, lines.length); j++) {
        const m = lines[j].match(NUMERO_UC_CURTO_RE);
        if (m) { codigoInstalacao = onlyDigits(m[0]); break; }
      }
      if (codigoInstalacao) break;
    }
  }

  // (2) Formato ANTIGO ("Código da Instalação") — padrões observados:
  //  (a) "4003655398 Próxima leitura 20/04/2026" (pdfjs cluster Y junta label-ao-lado)
  //  (b) Número isolado em linha própria
  //  (c) Linha contendo "Código da Instalação" seguida do número
  if (!codigoInstalacao) {
    for (let i = 0; i < lines.length; i++) {
      if (/c[oó]digo da instala[cç][aã]o/i.test(lines[i])) {
        for (let j = i; j < Math.min(i + 4, lines.length); j++) {
          const m = lines[j].match(/\b(\d{10})\b/);
          if (m) { codigoInstalacao = m[1]; break; }
        }
        if (codigoInstalacao) break;
      }
    }
  }
  // (2b) Formato ANTIGO do Grupo A: o rótulo vem SEM "Código da" — a linha é só
  // "Instalação 3095355874" (GRAFICA JACUI 07/2025 a 05/2026). O número fica no
  // FIM da linha, então nem (2) nem o fallback (a)/(b) pegavam e a fatura era
  // recusada com "Código da instalação não encontrado".
  // O número tem que estar COLADO no rótulo: "Saldo em Energia da Instalação:
  // Ponta 0,0000000000 kWh" também contém "Instalação" e traria 0000000000.
  if (!codigoInstalacao) {
    for (const line of lines) {
      const m = line.match(/\binstala[cç][aã]o\s*:?\s*(\d{10})\b/i);
      if (m) { codigoInstalacao = m[1]; break; }
    }
  }
  // Fallback (a)/(b): 10 dígitos no início de uma linha.
  if (!codigoInstalacao) {
    for (const line of lines) {
      const m = line.match(/^\s*(\d{10})\b/);
      if (m) { codigoInstalacao = m[1]; break; }
    }
  }

  // === Próxima leitura ===
  // Pode aparecer como "Próxima leitura 20/04/2026" clusterizado com outros textos
  // (ver "Padrão (a)" na seção do código de instalação).
  let proximaLeitura: Date | null = null;
  for (const line of lines) {
    const m = line.match(/pr[oó]xima\s+leitura[:\s]+(\d{2})\/(\d{2})\/(\d{4})/i);
    if (m) {
      proximaLeitura = dateOnlyUTC(parseInt(m[3]), parseInt(m[2]), parseInt(m[1]));
      break;
    }
  }

  // === Leituras e dias ===
  let leituraAnterior: number | null = null;
  let leituraAtual: number | null = null;
  let diasFaturamento: number | null = null;
  // Datas do ciclo (janela real da fatura). Na RGE imprime atual primeiro, anterior depois.
  let dataLeituraAtual: Date | null = null;
  let dataLeituraAnterior: Date | null = null;
  for (const line of lines) {
    // "20/03/2026 20/02/2026 28"
    // Lookahead (?!\/) garante que o "28" não é parte de outra data tipo "28/04/2026"
    // (que apareceu em linhas de cabeçalho com 3 datas seguidas e quebrava o parser).
    const m = line.match(/(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{1,3})(?!\/)\b/);
    if (m) {
      dataLeituraAtual = parseDateBR(m[1]);
      dataLeituraAnterior = parseDateBR(m[2]);
      diasFaturamento = parseInt(m[3]);
      break;
    }
  }
  // Leituras numéricas (anterior/atual/const/consumo): linha do medidor final
  // "4452306 Energia Ativa-kWh único 81885 85342 1,00 3.457"
  for (const line of lines) {
    const m = line.match(/energia\s+ativa[-\s]+kwh[^0-9]+\S+\s+(\d+)\s+(\d+)\s+([\d,]+)\s+([\d.,]+)/i);
    if (m) {
      leituraAnterior = parseNumBR(m[1]);
      leituraAtual = parseNumBR(m[2]);
      break;
    }
  }

  // Leitura da grandeza "Energia Injetada" (fatura de usina).
  // "40182851 Energia Injetada único 5020 5412 40,00 15.680"
  let leituraInjetadaAnterior: number | null = null;
  let leituraInjetadaAtual: number | null = null;
  let constanteMedidorInjetada: number | null = null;
  let energiaInjetadaMedidorKwh: number | null = null;
  for (const line of lines) {
    const m = line.match(/energia\s+injetada[^0-9]+\S+\s+(\d+)\s+(\d+)\s+([\d,]+)\s+([\d.,]+)/i);
    if (m) {
      leituraInjetadaAnterior = parseNumBR(m[1]);
      leituraInjetadaAtual = parseNumBR(m[2]);
      constanteMedidorInjetada = parseNumBR(m[3]);
      energiaInjetadaMedidorKwh = parseNumBR(m[4]);
      break;
    }
  }

  // === Consumo + Energia Injetada + Bandeira + Tarifas ===
  // Linhas da seção "Descrição da operação" têm formato:
  //   "<Descrição> <Mês/Ano?> kWh <qtd> <tarifaAneel> <tarifaCTrib> <valorTotal> [..colunas..]"
  //
  // Heurística: pega todas as linhas que contenham "kWh" (ou "kwh") e tentam
  // extrair qtd, tarifa_aneel, valor_total via regex tolerante.

  interface LinhaConsumo {
    raw: string;
    desc: string; // tudo antes do " kWh "
    qtd: number | null;
    tarifaAneel: number | null;
    tarifaCTrib: number | null;
    valorTotal: number | null;
  }

  function parseLinhaConsumo(line: string): LinhaConsumo | null {
    const idx = line.toLowerCase().indexOf(" kwh ");
    if (idx < 0) return null;
    const desc = line.slice(0, idx).trim();
    const rest = line.slice(idx + 5).trim();
    // Pegar primeiros 4 tokens numéricos (qtd, tarifaAneel, tarifaCTrib, valorTotal)
    const nums = rest.match(/[\d]{1,3}(?:\.\d{3})*(?:,\d+)?-?|\d+(?:,\d+)?-?/g) ?? [];
    if (nums.length === 0) return null;
    return {
      raw: line,
      desc,
      qtd: parseNumBR(nums[0] ?? null),
      tarifaAneel: parseNumBR(nums[1] ?? null),
      tarifaCTrib: parseNumBR(nums[2] ?? null),
      valorTotal: parseNumBR(nums[3] ?? null),
    };
  }

  const linhasConsumo: LinhaConsumo[] = [];
  for (const line of lines) {
    const parsed = parseLinhaConsumo(line);
    if (parsed) linhasConsumo.push(parsed);
  }

  // Classificar linhas
  let consumoTeKwh: number | null = null, consumoTeValor: number | null = null;
  let consumoTusdKwh: number | null = null, consumoTusdValor: number | null = null;
  let custoDispTeKwh: number | null = null, custoDispTeValor: number | null = null;
  let custoDispTusdKwh: number | null = null, custoDispTusdValor: number | null = null;
  let tarifaTE: number | null = null, tarifaTUSD: number | null = null;
  let tarifaTeComTributos: number | null = null, tarifaTusdComTributos: number | null = null;
  let bandeiraTarifaria: string | null = null;
  let bandeiraValor: number | null = null;
  let bandeiraAmarelaValor: number | null = null;
  let bandeiraVermelhaValor: number | null = null;
  let bandeiraVermelha2Valor: number | null = null;
  let bandeiraAmarelaCreditoValor: number | null = null;
  let bandeiraVermelhaCreditoValor: number | null = null;
  let bandeiraVermelha2CreditoValor: number | null = null;

  const injByOrigem = new Map<string, InjetadaDetalhe>();
  let injTeKwh = 0, injTeValor = 0, injTusdKwh = 0, injTusdValor = 0;
  let temInjTe = false, temInjTusd = false;
  // Geração própria do cliente (linhas "Energia Ativa Injetada" SEM "oUC").
  let energiaInjetadaPropriaTeKwh: number | null = null;
  let energiaInjetadaPropriaTeValor: number | null = null;
  let energiaInjetadaPropriaTusdKwh: number | null = null;
  let energiaInjetadaPropriaTusdValor: number | null = null;

  for (const lc of linhasConsumo) {
    const d = normDesc(lc.desc);
    const isInjAny = d.includes("energ") && d.includes("inj");
    // "oUC"/"mUC" = crédito de outra(s) UC — compensação por rateio da nossa usina.
    // A RGE trocou o rótulo "oUC" por "mUC mPT" a partir de mai/2026 (mesma Lei
    // 14.300, nomenclatura nova). "Energia Ativa Injetada" SEM esses marcadores =
    // painel solar do próprio cliente.
    const isCompensacao = d.includes("ouc") || d.includes("muc");
    const isInjPropria = isInjAny && !isCompensacao;
    const isInj = isInjAny && isCompensacao;
    // A RGE trunca "TUSD" em "TUS" nas linhas de crédito por posto do Grupo A
    // ("Energ Atv Inj. mUC oPT Pta-TUS", "... oPT-Pta-TUS"). Um includes("tusd")
    // não casa e a linha some das DUAS laterais — nem TUSD nem TE. Aceitar o
    // rótulo curto exige delimitador: "tus" solto casaria dentro de palavras.
    const isTusd = /(?:^|[^a-z])tusd?(?:[^a-z]|$)/.test(d);
    const isTe = !isTusd && (d.includes(" te ") || d.endsWith(" te") || d.includes("- te") || d.includes("-te"));
    // Linha de bandeira cobrada ("Adicional de Bandeira X") ou de crédito
    // ("Cred Adc Band X" — note "band" abreviado no PDF). Ambas seguem o mesmo
    // formato de colunas; o sinal do valor (negativo no crédito) vem de fábrica.
    const isCreditoBandeira =
      (d.includes("cred") || d.includes("credito")) && d.includes("band");
    const isBandeira = d.includes("bandeira") || isCreditoBandeira;
    const isDisp = d.includes("disp") && d.includes("energ") && !isInjAny;
    const isConsumo = !isDisp && d.startsWith("consumo") && !isInjAny;

    if (isBandeira) {
      // Detecta cor — vale tanto pra cobrança quanto pra crédito.
      let cor: "amarela" | "vermelha" | "vermelha2" | "verde" | null = null;
      if (d.includes("vermelha 2") || d.includes("vermelha2") || d.includes("vermelha p2")) {
        cor = "vermelha2";
      } else if (d.includes("vermelha")) {
        cor = "vermelha";
      } else if (d.includes("amarela")) {
        cor = "amarela";
      } else if (d.includes("verde")) {
        cor = "verde";
      }
      // Só registra a cor predominante quando for cobrança — créditos podem
      // referenciar mês passado e não definem a cor do mês atual.
      if (!isCreditoBandeira) {
        if (cor === "vermelha2") bandeiraTarifaria = "Vermelha 2";
        else if (cor === "vermelha") bandeiraTarifaria = "Vermelha 1";
        else if (cor === "amarela") bandeiraTarifaria = "Amarela";
        else if (cor === "verde") bandeiraTarifaria = "Verde";
      }
      // O valor monetário da bandeira (cobrança ou crédito) fica na PRIMEIRA
      // coluna após "kWh" (lc.qtd), não na 4ª (lc.valorTotal) — estrutura RGE:
      // "Adicional de Bandeira X MES/AA kWh <VALOR> <repete> <tarifa> ..."
      // Crédito vem com "-" no final do valor; parseNumBR já entrega negativo.
      if (lc.qtd != null) {
        if (isCreditoBandeira) {
          if (cor === "amarela") {
            bandeiraAmarelaCreditoValor = (bandeiraAmarelaCreditoValor ?? 0) + lc.qtd;
          } else if (cor === "vermelha") {
            bandeiraVermelhaCreditoValor = (bandeiraVermelhaCreditoValor ?? 0) + lc.qtd;
          } else if (cor === "vermelha2") {
            bandeiraVermelha2CreditoValor = (bandeiraVermelha2CreditoValor ?? 0) + lc.qtd;
          }
        } else {
          if (cor === "amarela") {
            bandeiraAmarelaValor = (bandeiraAmarelaValor ?? 0) + lc.qtd;
          } else if (cor === "vermelha") {
            bandeiraVermelhaValor = (bandeiraVermelhaValor ?? 0) + lc.qtd;
          } else if (cor === "vermelha2") {
            bandeiraVermelha2Valor = (bandeiraVermelha2Valor ?? 0) + lc.qtd;
          }
          // bandeiraValor genérico continua sendo a soma das cobranças (não
          // dos créditos) — preserva compatibilidade com o uso atual.
          bandeiraValor = (bandeiraValor ?? 0) + lc.qtd;
        }
      }
      continue;
    }

    if (isInjPropria) {
      // Linha "Energia Ativa Injetada TE/TUSD" — geração do painel próprio do cliente.
      // O valor monetário negativo (crédito) entra como Math.abs.
      const valor = lc.valorTotal != null ? Math.abs(lc.valorTotal) : null;
      const qtd = lc.qtd != null ? Math.abs(lc.qtd) : null;
      if (isTusd) {
        if (qtd != null) energiaInjetadaPropriaTusdKwh = (energiaInjetadaPropriaTusdKwh ?? 0) + qtd;
        if (valor != null) energiaInjetadaPropriaTusdValor = (energiaInjetadaPropriaTusdValor ?? 0) + valor;
      } else if (isTe) {
        if (qtd != null) energiaInjetadaPropriaTeKwh = (energiaInjetadaPropriaTeKwh ?? 0) + qtd;
        if (valor != null) energiaInjetadaPropriaTeValor = (energiaInjetadaPropriaTeValor ?? 0) + valor;
      }
      continue;
    }

    if (isInj) {
      const origem = extractMesOrigem(lc.desc) ?? "SEM_ORIGEM";
      const entry = injByOrigem.get(origem) ?? {
        mesOrigem: origem,
        teKwh: null, teValor: null, tusdKwh: null, tusdValor: null,
      };
      // ACUMULA (não sobrescreve): a fatura pode ter múltiplas linhas pro
      // mesmo mês de origem (sub-lotes da própria concessionária).
      if (isTusd) {
        entry.tusdKwh = (entry.tusdKwh ?? 0) + (lc.qtd ?? 0);
        entry.tusdValor = (entry.tusdValor ?? 0) + (lc.valorTotal ?? 0);
        if (lc.qtd != null) { injTusdKwh += lc.qtd; temInjTusd = true; }
        if (lc.valorTotal != null) injTusdValor += lc.valorTotal;
      } else if (isTe) {
        entry.teKwh = (entry.teKwh ?? 0) + (lc.qtd ?? 0);
        entry.teValor = (entry.teValor ?? 0) + (lc.valorTotal ?? 0);
        if (lc.qtd != null) { injTeKwh += lc.qtd; temInjTe = true; }
        if (lc.valorTotal != null) injTeValor += lc.valorTotal;
      }
      injByOrigem.set(origem, entry);
      continue;
    }

    if (isDisp) {
      if (isTusd) {
        if (custoDispTusdKwh == null) custoDispTusdKwh = lc.qtd;
        if (custoDispTusdValor == null) custoDispTusdValor = lc.valorTotal;
        if (tarifaTUSD == null) tarifaTUSD = lc.tarifaAneel;
      } else if (isTe) {
        if (custoDispTeKwh == null) custoDispTeKwh = lc.qtd;
        if (custoDispTeValor == null) custoDispTeValor = lc.valorTotal;
        if (tarifaTE == null) tarifaTE = lc.tarifaAneel;
      }
      continue;
    }

    if (isConsumo) {
      if (isTusd) {
        if (consumoTusdKwh == null) consumoTusdKwh = lc.qtd;
        if (consumoTusdValor == null) consumoTusdValor = lc.valorTotal;
        if (tarifaTUSD == null) tarifaTUSD = lc.tarifaAneel;
        if (tarifaTusdComTributos == null) tarifaTusdComTributos = lc.tarifaCTrib;
      } else if (isTe) {
        if (consumoTeKwh == null) consumoTeKwh = lc.qtd;
        if (consumoTeValor == null) consumoTeValor = lc.valorTotal;
        if (tarifaTE == null) tarifaTE = lc.tarifaAneel;
        if (tarifaTeComTributos == null) tarifaTeComTributos = lc.tarifaCTrib;
      }
    }
  }

  const injetadaDetalhes = Array.from(injByOrigem.values());

  // Fallback de bandeira para fatura de usina: o painel "Bandeiras Tarifárias"
  // lista "Verde 21 Dias", "Amarela 08 Dias" etc. Pode haver 2 (transição do
  // mês). Guardamos a cor dominante (mais dias).
  if (bandeiraTarifaria == null) {
    const bandeirasEncontradas = new Map<string, number>();
    for (const line of lines) {
      // O Grupo A escreve o patamar com "P": "Vermelha P1 31 Dias".
      const matches = line.matchAll(/(Verde|Amarela|Vermelha(?:\s*P?\s*[12])?)\s+(\d{1,2})\s+Dias/gi);
      for (const mm of matches) {
        let cor = mm[1].replace(/\s+/g, " ").trim();
        // normaliza "vermelha1"/"vermelha 1"/"vermelha 2"/"vermelha p1"/"vermelha p2"
        const corLower = cor.toLowerCase().replace(/\bp\s*([12])\b/, "$1");
        if (corLower.startsWith("vermelha 2")) cor = "Vermelha 2";
        else if (corLower.startsWith("vermelha")) cor = "Vermelha 1";
        else if (corLower === "amarela") cor = "Amarela";
        else if (corLower === "verde") cor = "Verde";
        const dias = parseInt(mm[2], 10);
        bandeirasEncontradas.set(cor, (bandeirasEncontradas.get(cor) ?? 0) + dias);
      }
    }
    if (bandeirasEncontradas.size > 0) {
      bandeiraTarifaria = [...bandeirasEncontradas.entries()]
        .sort((a, b) => b[1] - a[1])[0][0];
    }
  }

  // === Tributos ===
  // Linhas como "ICMS 2.298,64 17,00 390,77"
  let icms: number | null = null, pis: number | null = null, cofins: number | null = null;
  for (const line of lines) {
    const d = normDesc(line);
    const nums = line.match(/[\d.]+(?:,\d+)?/g) ?? [];
    if (nums.length >= 3) {
      if (d.startsWith("pis") && pis == null) pis = parseNumBR(nums[nums.length - 1]);
      else if (d.startsWith("cofins") && cofins == null) cofins = parseNumBR(nums[nums.length - 1]);
    }
    // No Grupo A o ICMS não abre linha própria: vem grudado no FIM da linha do
    // Consumo Ponta ("...74,96 ICMS 5.344,49 17,00 908,55"), então exigir
    // startsWith deixava o campo nulo em 11/11 faturas da GRÁFICA JACUI.
    // Procuramos o trio base/alíquota/valor onde quer que o rótulo apareça;
    // é sempre um só por fatura (a 2ª ocorrência, quando existe, repete a 1ª
    // na página 2 — por isso continua first-wins, não soma).
    if (icms == null) {
      const m = line.match(/ICMS\s+([\d.]+,\d+)\s+([\d.]+(?:,\d+)?)\s+([\d.]+,\d+)/i);
      if (m) icms = parseNumBR(m[3]);
    }
  }

  // === Encargos ===
  // Faturas atrasadas trazem múltiplas linhas do mesmo tipo (uma por fatura
  // em aberto), então acumulamos por soma — não pegamos só a primeira.
  // Ex.: Walter Beltrame 04/26 tinha 2× "Juros de Mora JAN/26" (R$ 29,96 +
  // R$ 15,00); somar é o correto.
  // CIP é única por fatura, mas usar a mesma soma é seguro (sempre 1 linha).
  let jurosMora: number | null = null, multaAtraso: number | null = null;
  let atualizacaoMonetaria: number | null = null, iluminacaoPublicaCip: number | null = null;
  let ajusteSaldoCredito: number | null = null;
  // Seção "CRÉDITOS / DEVOLUÇÕES": a RGE devolve na conta do mês um valor pago
  // a maior em conta anterior. Vem negativo ("329,91-") e já está descontado do
  // valor impresso da fatura. Quem pagou aquela conta antiga, em fatura única,
  // foi a nossa empresa — por isso ele volta a somar no repasse cobrado do
  // cliente (billing-calculator). Aqui só extraímos, como vem impresso.
  const devolPagamentoIndevido = extrairDevolPagamentoIndevido(lines);
  // Pega o PRIMEIRO valor monetário BRL (com vírgula decimal) da linha.
  // A linha tem códigos de barras no final (ex: "573 31") que são inteiros sem
  // vírgula — então restringir a regex pra "X,YY" evita capturar esses lixos.
  // O valor real do encargo aparece logo após a descrição, antes do código.
  const REGEX_BRL = /-?\d{1,3}(?:\.\d{3})*,\d{2}-?/;
  // O rodapé legal fala dos mesmos encargos sem cobrar nenhum: "Atraso no
  // pagamento será cobrado em conta futura: Multa 2%. Juros 0,033% ao dia...".
  // A linha casa com "multa"+"atraso" e o primeiro valor com vírgula é o
  // "0,033" da taxa — somava +0,03 em TODA fatura (12/2025: multa real 70,15,
  // parser 70,21, porque o aviso se repete nas 2 páginas).
  const REGEX_RODAPE_LEGAL = /sera cobrado|conta futura|legislacao vigente/;
  for (const line of lines) {
    const d = normDesc(line);
    if (REGEX_RODAPE_LEGAL.test(d)) continue;
    const match = line.match(REGEX_BRL);
    const valor = match ? parseNumBR(match[0]) : null;
    if (valor == null) continue;
    if (d.includes("juros") && d.includes("mora")) jurosMora = (jurosMora ?? 0) + valor;
    else if (d.includes("multa") && d.includes("atraso")) multaAtraso = (multaAtraso ?? 0) + valor;
    else if (d.includes("atualizacao") && d.includes("monetaria"))
      atualizacaoMonetaria = (atualizacaoMonetaria ?? 0) + valor;
    else if (d.includes("custeio ip") || d.includes("cip mar") || (d.includes("ilumin") && d.includes("public")))
      iluminacaoPublicaCip = (iluminacaoPublicaCip ?? 0) + valor;
    else if (d.includes("ajuste") && d.includes("saldo"))
      ajusteSaldoCredito = (ajusteSaldoCredito ?? 0) + valor;
  }

  // === Saldo da instalação + participação + saldo a expirar ===
  let saldoInstalacaoKwh: number | null = null;
  let saldoExpirarProxMesKwh: number | null = null;
  let participacaoGeracaoPct: number | null = null;
  for (const line of lines) {
    const d = normDesc(line);
    if (saldoInstalacaoKwh == null && d.includes("saldo em energia")) {
      // Algumas faturas imprimem "kW" (usina) em vez de "kWh". Aceita ambos.
      const m = line.match(/([\d.]+(?:,\d+)?)\s*kwh?/i);
      if (m) saldoInstalacaoKwh = parseNumBR(m[1]);
    }
    if (saldoExpirarProxMesKwh == null && d.includes("saldo a expirar")) {
      const m = line.match(/([\d.]+(?:,\d+)?)\s*kwh/i);
      if (m) saldoExpirarProxMesKwh = parseNumBR(m[1]);
    }
    if (participacaoGeracaoPct == null && d.includes("participacao na geracao")) {
      const m = line.match(/([\d.,]+)\s*%?/);
      if (m) participacaoGeracaoPct = parseNumBR(m[1]);
    }
  }

  // === Histórico de consumo (13 meses) ===
  // Linha típica: "MAR 26 lllllllll 3457 28"
  const historico: HistoricoConsumoItem[] = [];
  const seenMesAno = new Set<string>();
  for (const line of lines) {
    // Padrão com barras ("MAR 26 lllll 120 32") ou linha zerada ("ABR 26 0 29").
    // Em faturas de usina, o pdfjs pode clusterizar o histórico com outro
    // texto à esquerda (ex: "Total Distribuidora 108,13 ABR 26 0 29"),
    // então aceitamos o match também no FIM da linha (não só no início).
    // [l\s]* aceita barras quebradas em múltiplos runs ("lllll lllll lllll").
    const m = line.match(/(?:^|\s)([A-Z]{3})\s+(\d{2})\s+[l\s]*(\d+)\s+(\d+)\s*$/i);
    if (!m) continue;
    const mes = m[1].toUpperCase();
    const ano = m[2];
    const mesAno = `${mes}/${ano}`;
    if (seenMesAno.has(mesAno)) continue;
    seenMesAno.add(mesAno);
    historico.push({
      mesAno,
      consumoKwh: parseNumBR(m[3]),
      dias: parseInt(m[4]),
    });
  }

  // No Grupo A o painel tem TRÊS séries lado a lado — "Consumo Ponta",
  // "Consumo Fora de Ponta" e "Demanda" — e cada linha repete o mês três vezes:
  //   "MAR 26 lll... 1353,00 31 MAR 26 lll... 6645,00 31 MAR 26 lll... 74,00 31"
  // O padrão monômio acima está ancorado no fim da linha e não pega nada disso,
  // então a fatura Grupo A ficava sem histórico. Os valores vêm truncados no
  // inteiro (1353,00 pro faturado 1.353,8364) — é painel, não fonte de cálculo.
  if (historico.length === 0) {
    for (const line of lines) {
      const grupos = [...line.matchAll(/\b([A-Z]{3})\s+(\d{2})\s+[l\s]*([\d.]+,\d{2})\s+(\d{1,2})\b/g)];
      if (grupos.length !== 3) continue;
      const [ponta, foraPonta, demanda] = grupos;
      const mesAno = `${ponta[1].toUpperCase()}/${ponta[2]}`;
      if (seenMesAno.has(mesAno)) continue;
      // As três séries têm que falar do mesmo mês; se não, não é esse painel.
      if (`${foraPonta[1].toUpperCase()}/${foraPonta[2]}` !== mesAno) continue;
      if (`${demanda[1].toUpperCase()}/${demanda[2]}` !== mesAno) continue;
      seenMesAno.add(mesAno);
      const pontaKwh = parseNumBR(ponta[3]);
      const foraPontaKwh = parseNumBR(foraPonta[3]);
      historico.push({
        mesAno,
        consumoKwh: (pontaKwh ?? 0) + (foraPontaKwh ?? 0),
        dias: parseInt(ponta[4]),
        pontaKwh,
        foraPontaKwh,
        demandaKw: parseNumBR(demanda[3]),
      });
    }
  }

  // Consumo total do mês: preferir linha do medidor, fallback primeiro "Consumo"
  let consumoKwh: number | null = consumoTusdKwh ?? consumoTeKwh;
  for (const line of lines) {
    const m = line.match(/energia\s+ativa[-\s]+kwh[^0-9]+\S+\s+\d+\s+\d+\s+[\d,]+\s+([\d.,]+)/i);
    if (m) {
      consumoKwh = parseNumBR(m[1]) ?? consumoKwh;
      break;
    }
  }

  // === Código de barras (segunda página, 4 blocos de dígitos) ===
  let codigoBarras: string | null = null;
  for (const line of lines) {
    const m = line.match(/(\b\d{11,12}\b[\s.-]*){4,}/);
    if (m) {
      codigoBarras = m[0].replace(/[^\d]/g, "").slice(0, 48); // 47/48 dígitos
      if (codigoBarras.length >= 44) break;
      codigoBarras = null;
    }
  }
  // A fatura Grupo A vem com boleto bancário, cuja linha digitável tem campos
  // de 5 dígitos + ponto ("341-7 34191.09909 32608.212935 83792.250009 4
  // 14170000552793"). O padrão acima procura blocos de 11-12 dígitos e não via
  // nada. Casar o layout inteiro em vez de "um monte de dígitos": a mesma
  // fatura traz um número de 44 dígitos que É OUTRA COISA — a chave de acesso
  // da NF-e (UF 43 + AAMM + CNPJ da RGE) — e viraria código de barras errado.
  if (codigoBarras == null) {
    for (const line of lines) {
      const m = line.match(
        /(\d{5})[.\s](\d{5,6})\s+(\d{5})[.\s](\d{5,6})\s+(\d{5})[.\s](\d{5,6})\s+(\d)\s+(\d{14})/,
      );
      if (m) {
        codigoBarras = m.slice(1).join("");
        break;
      }
    }
  }

  // === Valor total (preferir página 2, com venc + valor juntos não mascarados) ===
  // Na página 2: "1.161,28 08/04/2026" ou "Total a Pagar 1.161,28"
  let valorTotal: number | null = valorTotalHeader;
  let vencimento: Date | null = vencimentoHeader;
  for (const line of lines) {
    const d = normDesc(line);
    if ((d.includes("total a pagar") || d.includes("total consolidado")) && !isMasked(line)) {
      const m = line.match(/([\d.]+,\d{2})/);
      if (m) {
        const v = parseNumBR(m[1]);
        if (v != null && v > 0) valorTotal = v;
      }
      const venc = line.match(/(\d{2}\/\d{2}\/\d{4})/);
      if (venc) vencimento = parseDateBR(venc[1]);
    }
  }

  // Último recurso: cabeçalho mascarado e sem "Total a Pagar" legível. A linha
  // de totais do quadro de tributos ainda traz o valor — inclusive R$ 0,00, que
  // é informação (conta quitada), não ausência dela.
  if (valorTotal == null) {
    valorTotal = extrairTotalPelaLinhaDeTributos(lines, icms);
  }

  // Energia TOTAL injetada/compensada = geração própria do painel do cliente
  // (linhas "Energia Ativa Injetada" SEM oUC/mUC) + rateio da usina (linhas
  // oUC/mUC). É o total de energia que abateu o consumo do cliente. A geração
  // própria continua disponível separada em energiaInjetadaPropria* (o cálculo
  // do investidor subtrai a própria pra isolar só o rateio). TE e TUSD são as
  // duas laterais do MESMO kWh — somar as duas dobraria o crédito, então cada
  // origem escolhe uma.
  //
  // A escolha é POR ORIGEM, não uma vez pra fatura inteira: uma fatura pode
  // trazer um crédito com as duas laterais e outro só com TE. Decidindo global
  // "tem TUSD? use TUSD", a origem que só tem TE era descartada mesmo já
  // capturada — 5.593 kWh (−11,5%) sumiram em 12 meses da GRÁFICA JACUI, sem
  // erro nenhum na tela.
  function kwhDaOrigem(tusd: number | null, te: number | null): number | null {
    if (tusd != null && tusd > 0) return tusd;
    if (te != null && te > 0) return te;
    return tusd ?? te;
  }
  let injKwh = 0;
  let temInjKwh = false;
  for (const det of injetadaDetalhes) {
    const kwh = kwhDaOrigem(det.tusdKwh, det.teKwh);
    if (kwh != null) {
      injKwh += kwh;
      temInjKwh = true;
    }
  }
  const propriaKwh = kwhDaOrigem(energiaInjetadaPropriaTusdKwh, energiaInjetadaPropriaTeKwh);
  const energiaInjetada =
    temInjKwh || propriaKwh != null ? injKwh + (propriaKwh ?? 0) : null;
  const energiaCompensada = energiaInjetada;

  const grupoA = extractGrupoA(lines);

  // A leitura de injeção acima para na PRIMEIRA linha "Energia Injetada". Isso
  // valia enquanto a fatura tinha um posto só. No Grupo A com dois postos a
  // primeira linha é a de PONTA — que numa usina solar é ~zero — e a injeção
  // real, toda em FORA PONTA, era descartada em silêncio: a GRAFICA JACUI
  // registrou 0 kWh injetado de 12/2025 a 07/2026 enquanto o medidor marcava
  // 1.829 a 6.486 kWh por mês.
  //
  // Quando o Grupo A leu as grandezas do medidor, elas mandam. O cliente Grupo A
  // injeta em PONTA e em FORA PONTA, e cada posto tem seu próprio par de
  // leituras: guardar só o total apagaria a quebra. Então grava-se as DUAS
  // informações — cada posto inteiro (kWh + leituras que o explicam) — e o
  // total como soma, porque é o total que relatório e validação do inversor
  // comparam contra a geração.
  //
  // O par legado `leituraInjetadaAnterior/Atual` é um só e não representa dois
  // postos: fica nulo quando há dois, senão publicaria índices que não fecham
  // com o total pra quem audita. A quebra mora nos campos por posto.
  const injecoesMedidor = grupoA?.leiturasMedidor.filter(
    (l) => /injetada|inj\b/i.test(l.grandeza) && l.consumo != null,
  );
  const injPonta = injecoesMedidor?.find((l) => l.posto === "PONTA") ?? null;
  const injForaPonta = injecoesMedidor?.find((l) => l.posto === "FORA_PONTA") ?? null;
  const injetadaMedidor =
    injecoesMedidor && injecoesMedidor.length > 0
      ? {
          energiaInjetadaMedidorKwh: injecoesMedidor.reduce((s, l) => s + (l.consumo ?? 0), 0),
          leituraInjetadaAnterior:
            injecoesMedidor.length === 1 ? injecoesMedidor[0].leituraAnterior : null,
          leituraInjetadaAtual:
            injecoesMedidor.length === 1 ? injecoesMedidor[0].leituraAtual : null,
          constanteMedidorInjetada: injecoesMedidor[0].constante,

          energiaInjetadaMedidorPontaKwh: injPonta?.consumo ?? null,
          leituraInjetadaPontaAnterior: injPonta?.leituraAnterior ?? null,
          leituraInjetadaPontaAtual: injPonta?.leituraAtual ?? null,
          energiaInjetadaMedidorForaPontaKwh: injForaPonta?.consumo ?? null,
          leituraInjetadaForaPontaAnterior: injForaPonta?.leituraAnterior ?? null,
          leituraInjetadaForaPontaAtual: injForaPonta?.leituraAtual ?? null,
        }
      : {
          energiaInjetadaMedidorKwh,
          leituraInjetadaAnterior,
          leituraInjetadaAtual,
          constanteMedidorInjetada,

          energiaInjetadaMedidorPontaKwh: null,
          leituraInjetadaPontaAnterior: null,
          leituraInjetadaPontaAtual: null,
          energiaInjetadaMedidorForaPontaKwh: null,
          leituraInjetadaForaPontaAnterior: null,
          leituraInjetadaForaPontaAtual: null,
        };

  // Mesma armadilha da injeção, nos dois campos monômios que sobraram.
  //
  // `consumoKwh` sai da linha "Energia Ativa - kWh" do medidor e parava na
  // primeira, que no Grupo A é a de PONTA: a GRÁFICA JACUI registrava 1.090 kWh
  // num mês de 4.618. Aqui somam-se os dois postos, e continua sendo o MEDIDO
  // (o faturado, 2,5% maior por conta da taxa de perda, mora nos campos por
  // posto) — é o medido que o relatório soma com o autoconsumo instantâneo,
  // que também vem do medidor.
  const ativasMedidor = grupoA?.leiturasMedidor.filter(
    (l) => /ativa/i.test(l.grandeza) && l.unidade === "kWh" && l.consumo != null,
  );
  if (ativasMedidor && ativasMedidor.length > 1) {
    consumoKwh = ativasMedidor.reduce((s, l) => s + (l.consumo ?? 0), 0);
  }

  // `saldoCreditos` lia "Saldo em Energia da Instalação: Ponta ..." e ficava com
  // a Ponta — sempre 0 nessa UC. O saldo Fora Ponta vem na linha seguinte e
  // chegou a 3.303 kWh sem aparecer em lugar nenhum.
  let saldoCreditos: number | null = saldoInstalacaoKwh;
  if (grupoA && (grupoA.saldoPontaKwh != null || grupoA.saldoForaPontaKwh != null)) {
    saldoCreditos = (grupoA.saldoPontaKwh ?? 0) + (grupoA.saldoForaPontaKwh ?? 0);
  }

  return {
    codigoInstalacao,
    rawText,
    grupoA,
    bill: {
      mesReferencia: mesReferencia || new Date().getMonth() + 1,
      anoReferencia: anoReferencia || new Date().getFullYear(),
      instalacao: codigoInstalacao,
      valorTotal,
      vencimento,
      contaPaga: false,
      codigoBarras,
      consumoKwh,
      leituraAnterior,
      leituraAtual,
      diasFaturamento,
      proximaLeitura,
      dataLeituraAnterior,
      dataLeituraAtual,

      consumoTeKwh,
      consumoTeValor,
      consumoTusdKwh,
      consumoTusdValor,

      energiaInjetada,
      energiaCompensada,
      saldoCreditos,

      injetadaOucTeKwh: temInjTe ? injTeKwh : null,
      injetadaOucTeValor: temInjTe ? injTeValor : null,
      injetadaOucTusdKwh: temInjTusd ? injTusdKwh : null,
      injetadaOucTusdValor: temInjTusd ? injTusdValor : null,
      energiaInjetadaPropriaTeKwh,
      energiaInjetadaPropriaTeValor,
      energiaInjetadaPropriaTusdKwh,
      energiaInjetadaPropriaTusdValor,
      injetadaDetalhes: injetadaDetalhes.length > 0 ? JSON.stringify(injetadaDetalhes) : null,

      historicoConsumo: historico.length > 0 ? JSON.stringify(historico) : null,

      saldoInstalacaoKwh,
      saldoExpirarProxMesKwh,
      participacaoGeracaoPct,

      ...injetadaMedidor,

      custoDispTusdKwh,
      custoDispTusdValor,
      custoDispTeKwh,
      custoDispTeValor,

      tarifaTE,
      tarifaTUSD,
      tarifaTeComTributos,
      tarifaTusdComTributos,
      bandeiraTarifaria,
      bandeiraValor,
      bandeiraAmarelaValor,
      bandeiraVermelhaValor,
      bandeiraVermelha2Valor,
      bandeiraAmarelaCreditoValor,
      bandeiraVermelhaCreditoValor,
      bandeiraVermelha2CreditoValor,

      icms, pis, cofins,

      jurosMora, multaAtraso, atualizacaoMonetaria,
      iluminacaoPublicaCip, ajusteSaldoCredito, devolPagamentoIndevido,

      pdfUrl: null,
      fonteConsulta: "UPLOAD_MANUAL",
      rawJson: JSON.stringify({ source: "UPLOAD_MANUAL", lines }),
      ...grupoAToBillFields(grupoA),
    },
  };
}

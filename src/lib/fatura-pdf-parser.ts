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

function parseDateBR(s: string | undefined | null): Date | null {
  if (!s) return null;
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
}

function extractMesOrigem(s: string): string | null {
  const m = s.toUpperCase().match(/([A-Z]{3})\/(\d{2}(?:\d{2})?)/);
  if (!m) return null;
  const mes = m[1];
  const ano = m[2].length === 4 ? m[2].slice(-2) : m[2];
  return `${mes}/${ano}`;
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
    injetadaDetalhes: string | null;

    historicoConsumo: string | null;

    saldoInstalacaoKwh: number | null;
    saldoExpirarProxMesKwh: number | null;
    participacaoGeracaoPct: number | null;

    energiaInjetadaMedidorKwh: number | null;
    leituraInjetadaAnterior: number | null;
    leituraInjetadaAtual: number | null;
    constanteMedidorInjetada: number | null;

    custoDispTusdKwh: number | null;
    custoDispTusdValor: number | null;
    custoDispTeKwh: number | null;
    custoDispTeValor: number | null;

    tarifaTE: number | null;
    tarifaTUSD: number | null;
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
}

export async function parseFaturaPdf(buffer: Uint8Array): Promise<ParsedFaturaPdf> {
  const lines = await extractLines(buffer);
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

  // === Código da Instalação ===
  // Padrões observados em faturas RGE/CPFL:
  //  (a) "3095156869 Próxima leitura 20/04/2026" (pdfjs cluster Y junta label-ao-lado)
  //  (b) Número isolado em linha própria
  //  (c) Linha contendo "Código da Instalação" seguida do número
  let codigoInstalacao: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    if (/c[oó]digo da instala[cç][aã]o/i.test(lines[i])) {
      for (let j = i; j < Math.min(i + 4, lines.length); j++) {
        const m = lines[j].match(/\b(\d{10})\b/);
        if (m) { codigoInstalacao = m[1]; break; }
      }
      if (codigoInstalacao) break;
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
      proximaLeitura = new Date(Date.UTC(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1])));
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

  for (const lc of linhasConsumo) {
    const d = normDesc(lc.desc);
    const isInj = d.includes("energ") && d.includes("inj");
    const isTusd = d.includes("tusd");
    const isTe = !isTusd && (d.includes(" te ") || d.endsWith(" te") || d.includes("- te") || d.includes("-te"));
    // Linha de bandeira cobrada ("Adicional de Bandeira X") ou de crédito
    // ("Cred Adc Band X" — note "band" abreviado no PDF). Ambas seguem o mesmo
    // formato de colunas; o sinal do valor (negativo no crédito) vem de fábrica.
    const isCreditoBandeira =
      (d.includes("cred") || d.includes("credito")) && d.includes("band");
    const isBandeira = d.includes("bandeira") || isCreditoBandeira;
    const isDisp = d.includes("disp") && d.includes("energ") && !isInj;
    const isConsumo = !isDisp && d.startsWith("consumo") && !isInj;

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
      } else if (isTe) {
        if (consumoTeKwh == null) consumoTeKwh = lc.qtd;
        if (consumoTeValor == null) consumoTeValor = lc.valorTotal;
        if (tarifaTE == null) tarifaTE = lc.tarifaAneel;
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
      const matches = line.matchAll(/(Verde|Amarela|Vermelha\s*[12]?)\s+(\d{1,2})\s+Dias/gi);
      for (const mm of matches) {
        let cor = mm[1].replace(/\s+/g, " ").trim();
        // normaliza "vermelha1"/"vermelha 1"/"vermelha 2"
        const corLower = cor.toLowerCase();
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
      if (d.startsWith("icms") && icms == null) icms = parseNumBR(nums[nums.length - 1]);
      else if (d.startsWith("pis") && pis == null) pis = parseNumBR(nums[nums.length - 1]);
      else if (d.startsWith("cofins") && cofins == null) cofins = parseNumBR(nums[nums.length - 1]);
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
  // Pega o PRIMEIRO valor monetário BRL (com vírgula decimal) da linha.
  // A linha tem códigos de barras no final (ex: "573 31") que são inteiros sem
  // vírgula — então restringir a regex pra "X,YY" evita capturar esses lixos.
  // O valor real do encargo aparece logo após a descrição, antes do código.
  const REGEX_BRL = /-?\d{1,3}(?:\.\d{3})*,\d{2}-?/;
  for (const line of lines) {
    const d = normDesc(line);
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

  // Energia injetada/compensada total (uma das laterais; ambas iguais)
  const energiaInjetada = temInjTusd ? injTusdKwh : temInjTe ? injTeKwh : null;
  const energiaCompensada = energiaInjetada;

  const grupoA = extractGrupoA(lines);

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
      saldoCreditos: saldoInstalacaoKwh,

      injetadaOucTeKwh: temInjTe ? injTeKwh : null,
      injetadaOucTeValor: temInjTe ? injTeValor : null,
      injetadaOucTusdKwh: temInjTusd ? injTusdKwh : null,
      injetadaOucTusdValor: temInjTusd ? injTusdValor : null,
      injetadaDetalhes: injetadaDetalhes.length > 0 ? JSON.stringify(injetadaDetalhes) : null,

      historicoConsumo: historico.length > 0 ? JSON.stringify(historico) : null,

      saldoInstalacaoKwh,
      saldoExpirarProxMesKwh,
      participacaoGeracaoPct,

      energiaInjetadaMedidorKwh,
      leituraInjetadaAnterior,
      leituraInjetadaAtual,
      constanteMedidorInjetada,

      custoDispTusdKwh,
      custoDispTusdValor,
      custoDispTeKwh,
      custoDispTeValor,

      tarifaTE,
      tarifaTUSD,
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
      iluminacaoPublicaCip, ajusteSaldoCredito,

      pdfUrl: null,
      fonteConsulta: "UPLOAD_MANUAL",
      rawJson: JSON.stringify({ source: "UPLOAD_MANUAL", lines }),
      ...grupoAToBillFields(grupoA),
    },
  };
}

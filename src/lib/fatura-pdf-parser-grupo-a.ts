/**
 * Extrator dos campos específicos de fatura Grupo A (RGE/CPFL).
 *
 * Diferenças vs Grupo B (cobertas aqui):
 *  - Tarifa binômia: cobra demanda (kW) além de consumo (kWh)
 *  - Posto horário: consumo, TE, TUSD, bandeira e injeção dobrados em Ponta/Fora-Ponta
 *  - Demanda Ultrapassagem (kW × 2× tarifa quando excede contratada)
 *  - TUSD-G ("Uso Sist Distr Geração [kW]") — proporcional aos kW de geração contratada
 *  - Reativo excedente (penalidade por baixo fator de potência)
 *  - Saldo de créditos GD separado por posto (Ponta + Fora Ponta)
 *  - Leituras de 8 grandezas no medidor (Ativa P/FP, Demanda P/FP, Reativa P/FP, Injetada P/FP)
 *
 * Recebe `lines: string[]` já extraídas pelo extractLines do parser principal,
 * pra não duplicar pdfjs setup. Retorna `null` se a fatura não for Grupo A.
 *
 * UC-exemplo de validação: 4003710227 (OBA FOOD SERVICE — Verde-A4, 300 kW geração).
 */

const SUBGRUPOS_A = ["A1", "A2", "A3", "A3a", "A4", "AS"] as const;
type SubgrupoA = typeof SUBGRUPOS_A[number];
type Modalidade = "Verde" | "Azul" | "Convencional" | "Branca";

export interface GrupoALeituraMedidor {
  grandeza: string;
  posto: "PONTA" | "FORA_PONTA" | "UNICO";
  unidade: "kWh" | "kW" | "kVAr";
  leituraAnterior: number | null;
  leituraAtual: number | null;
  constante: number | null;
  consumo: number | null;
}

export interface GrupoAData {
  modalidade: Modalidade | null;
  subgrupo: SubgrupoA | null;
  tensaoNominalContratadaV: number | null;

  // Demanda contratada (cadastro / nameplate)
  geracaoContratadaKw: number | null;        // kW de geração contratada (UC com mini/microGD)
  demandaContratadaKw: number | null;        // Verde/Convencional: única; Azul: FPonta
  demandaContratadaPontaKw: number | null;   // só Azul

  // Demanda medida e cobrada
  demandaMedidaKw: number | null;
  demandaMedidaPontaKw: number | null;       // só Azul
  demandaTusdValor: number | null;
  tarifaDemanda: number | null;
  demandaUltrapassagemKw: number | null;
  demandaUltrapassagemValor: number | null;

  // TUSD-G (geração)
  tusdGeracaoKw: number | null;
  tusdGeracaoValor: number | null;
  tarifaTusdGeracao: number | null;

  // Consumo por posto
  consumoPontaKwh: number | null;
  consumoForaPontaKwh: number | null;
  consumoTePontaKwh: number | null;
  consumoTePontaValor: number | null;
  consumoTeForaPontaKwh: number | null;
  consumoTeForaPontaValor: number | null;
  consumoTusdPontaKwh: number | null;
  consumoTusdPontaValor: number | null;
  consumoTusdForaPontaKwh: number | null;
  consumoTusdForaPontaValor: number | null;

  // Tarifas por posto
  tarifaTePonta: number | null;
  tarifaTeForaPonta: number | null;
  tarifaTusdPonta: number | null;
  tarifaTusdForaPonta: number | null;

  // Bandeira por posto (positivo = adicional, negativo = crédito)
  bandeiraValorPonta: number | null;
  bandeiraValorForaPonta: number | null;
  bandeiraCreditoPontaValor: number | null;
  bandeiraCreditoForaPontaValor: number | null;

  // Compensação Lei 14.300 por posto (TUSD + TE somados em kWh; valores absolutos)
  injetadaPontaKwh: number | null;
  injetadaPontaValor: number | null;       // negativo (crédito)
  injetadaForaPontaKwh: number | null;
  injetadaForaPontaValor: number | null;   // negativo (crédito)

  // Saldo por posto
  saldoPontaKwh: number | null;
  saldoForaPontaKwh: number | null;

  // Reativo excedente
  reativoExcedentePontaKvar: number | null;
  reativoExcedentePontaValor: number | null;
  reativoExcedenteForaPontaKvar: number | null;
  reativoExcedenteForaPontaValor: number | null;

  // Leituras das 8 grandezas (raw)
  leiturasMedidor: GrupoALeituraMedidor[];
}

function parseNumBR(raw: string | undefined | null): number | null {
  if (raw == null || raw === "") return null;
  let str = String(raw).trim().replace(/R\$\s*/gi, "").replace(/\s/g, "");
  if (!str) return null;
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

function normDesc(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Detecta posto a partir da descrição.
 * Variações observadas: "Ponta", "Fora Ponta", "FPonta", "Fponta".
 * IMPORTANTE: testa Fora Ponta antes de Ponta (substring-trap).
 */
function detectPosto(desc: string): "PONTA" | "FORA_PONTA" | null {
  const d = normDesc(desc);
  if (d.includes("fora ponta") || /\bfponta\b/.test(d) || /\bf\.?ponta\b/.test(d)) {
    return "FORA_PONTA";
  }
  if (/\bponta\b/.test(d)) return "PONTA";
  return null;
}

/** "Tarifa Verde-A4 Industrial" → { modalidade: "Verde", subgrupo: "A4" } */
function parseClassificacao(lines: string[]): { modalidade: Modalidade | null; subgrupo: SubgrupoA | null } {
  for (const line of lines) {
    const m = line.match(/Classifica[cç][aã]o[:\s]+Tarifa\s+([A-Za-zçÇ]+)[\s-]+(A[1-4]a?|AS|B[1-4])/i);
    if (m) {
      const modRaw = normDesc(m[1]);
      let modalidade: Modalidade | null = null;
      if (modRaw.startsWith("verde")) modalidade = "Verde";
      else if (modRaw.startsWith("azul")) modalidade = "Azul";
      else if (modRaw.startsWith("convenc")) modalidade = "Convencional";
      else if (modRaw.startsWith("branca")) modalidade = "Branca";
      const subRaw = m[2].toUpperCase();
      const subgrupo = (SUBGRUPOS_A as readonly string[]).includes(subRaw) ? (subRaw as SubgrupoA) : null;
      return { modalidade, subgrupo };
    }
  }
  return { modalidade: null, subgrupo: null };
}

/** "TENSÃO NOMINAL EM VOLTS Disp.: 13.800 Lim. mín.: 12.834 Lim. máx.: 14.490" */
function parseTensaoContratada(lines: string[]): number | null {
  for (const line of lines) {
    const d = normDesc(line);
    if (!d.includes("tensao nominal") && !d.includes("tensao nominal em volts")) continue;
    const m = line.match(/Disp[\.:]*\s*([\d.,]+)/i);
    if (m) return parseNumBR(m[1]);
  }
  return null;
}

/**
 * Bloco "Grandezas contratadas" / cabeçalho:
 *  - "Geração kW 300"  → geracaoContratadaKw=300
 *  - "Demanda kW 50"   → demandaContratadaKw=50 (Verde/Conv)
 *  - "Demanda Ponta kW X" + "Demanda Fora Ponta kW Y"  → Azul (TODO confirmar)
 */
function parseDemandaContratada(lines: string[]): {
  geracaoContratadaKw: number | null;
  demandaContratadaKw: number | null;
  demandaContratadaPontaKw: number | null;
} {
  let geracao: number | null = null;
  let demanda: number | null = null;
  let demandaPonta: number | null = null;
  for (const line of lines) {
    const d = normDesc(line);
    // "Geração kW 300"
    const mGer = line.match(/Gera[cç][aã]o\s+kW\s+([\d.,]+)/i);
    if (mGer && geracao == null) geracao = parseNumBR(mGer[1]);
    // "Demanda kW 50" (sem posto)
    if (/^demanda\s+kw\s+[\d.,]+$/.test(d)) {
      const m = line.match(/Demanda\s+kW\s+([\d.,]+)/i);
      if (m && demanda == null) demanda = parseNumBR(m[1]);
    }
    // "Demanda Ponta kW X" / "Demanda Fora Ponta kW Y"
    const mPosto = line.match(/Demanda\s+(Ponta|Fora\s+Ponta|FPonta)\s+kW\s+([\d.,]+)/i);
    if (mPosto) {
      const posto = detectPosto(mPosto[1]);
      if (posto === "PONTA" && demandaPonta == null) demandaPonta = parseNumBR(mPosto[2]);
      else if (posto === "FORA_PONTA" && demanda == null) demanda = parseNumBR(mPosto[2]);
    }
  }
  return { geracaoContratadaKw: geracao, demandaContratadaKw: demanda, demandaContratadaPontaKw: demandaPonta };
}

interface LinhaDescOp {
  raw: string;
  desc: string;
  unidade: "kWh" | "kW" | "kVAr" | null;
  qtd: number | null;
  tarifaAneel: number | null;
  tarifaCTrib: number | null;
  valorTotal: number | null;
}

/**
 * Extrai linhas da seção "Descrição da operação".
 * Formato: "<descrição> <Mes/Ano?> <kWh|kW|kVAr> <qtd> <tarifa_aneel> <tarifa_c_trib> <valor_total> [...]"
 */
function parseDescOpLines(lines: string[]): LinhaDescOp[] {
  const out: LinhaDescOp[] = [];
  for (const line of lines) {
    // Encontra unidade (espaço-delimitada): " kWh ", " kW ", " kVAr ", "kva " (variação)
    let idx = -1;
    let unidLen = 0;
    let unidade: LinhaDescOp["unidade"] = null;
    const lower = line.toLowerCase();
    const unidades: Array<{ tok: string; norm: LinhaDescOp["unidade"] }> = [
      { tok: " kwh ", norm: "kWh" },
      { tok: " kw ", norm: "kW" },
      { tok: " kvar ", norm: "kVAr" },
      { tok: " kva ", norm: "kVAr" },
    ];
    for (const u of unidades) {
      const i = lower.indexOf(u.tok);
      if (i >= 0 && (idx < 0 || i < idx)) {
        idx = i;
        unidLen = u.tok.length;
        unidade = u.norm;
      }
    }
    if (idx < 0) continue;
    const desc = line.slice(0, idx).trim();
    const rest = line.slice(idx + unidLen).trim();
    const nums = rest.match(/-?[\d]{1,3}(?:\.\d{3})*(?:,\d+)?-?|-?\d+(?:[.,]\d+)?-?/g) ?? [];
    if (nums.length === 0) continue;
    out.push({
      raw: line,
      desc,
      unidade,
      qtd: parseNumBR(nums[0] ?? null),
      tarifaAneel: parseNumBR(nums[1] ?? null),
      tarifaCTrib: parseNumBR(nums[2] ?? null),
      valorTotal: parseNumBR(nums[3] ?? null),
    });
  }
  return out;
}

interface DemandaInfo {
  demandaMedidaKw: number | null;
  demandaMedidaPontaKw: number | null;
  demandaTusdValor: number | null;
  tarifaDemanda: number | null;
  demandaUltrapassagemKw: number | null;
  demandaUltrapassagemValor: number | null;
}

function parseDemanda(items: LinhaDescOp[]): DemandaInfo {
  const out: DemandaInfo = {
    demandaMedidaKw: null,
    demandaMedidaPontaKw: null,
    demandaTusdValor: null,
    tarifaDemanda: null,
    demandaUltrapassagemKw: null,
    demandaUltrapassagemValor: null,
  };
  for (const it of items) {
    if (it.unidade !== "kW") continue;
    const d = normDesc(it.desc);
    if (!d.startsWith("demanda")) continue;
    const isUltrap = d.includes("ultrap");
    const isGeracao = d.includes("gera");
    if (isGeracao) continue; // tratado em parseTusdG
    const posto = detectPosto(it.desc);
    if (isUltrap) {
      // Demanda Ultrap [kW] - TUSD ...
      if (out.demandaUltrapassagemKw == null) out.demandaUltrapassagemKw = it.qtd;
      if (out.demandaUltrapassagemValor == null) out.demandaUltrapassagemValor = it.valorTotal;
    } else {
      // Demanda [kW] - TUSD ...
      if (posto === "PONTA") {
        if (out.demandaMedidaPontaKw == null) out.demandaMedidaPontaKw = it.qtd;
      } else {
        if (out.demandaMedidaKw == null) out.demandaMedidaKw = it.qtd;
      }
      if (out.demandaTusdValor == null) out.demandaTusdValor = it.valorTotal;
      if (out.tarifaDemanda == null) out.tarifaDemanda = it.tarifaAneel;
    }
  }
  return out;
}

function parseTusdG(items: LinhaDescOp[]): { tusdGeracaoKw: number | null; tusdGeracaoValor: number | null; tarifaTusdGeracao: number | null } {
  for (const it of items) {
    if (it.unidade !== "kW") continue;
    const d = normDesc(it.desc);
    // "Uso Sist Distr Geração [kW]" / "Uso Sistema Distribuição Geração"
    if ((d.includes("uso") && d.includes("distr") && d.includes("gera")) || (d.includes("tusd") && d.includes("gera"))) {
      return {
        tusdGeracaoKw: it.qtd,
        tusdGeracaoValor: it.valorTotal,
        tarifaTusdGeracao: it.tarifaAneel,
      };
    }
  }
  return { tusdGeracaoKw: null, tusdGeracaoValor: null, tarifaTusdGeracao: null };
}

interface ConsumoPostoInfo {
  consumoPontaKwh: number | null;
  consumoForaPontaKwh: number | null;
  consumoTePontaKwh: number | null;
  consumoTePontaValor: number | null;
  consumoTeForaPontaKwh: number | null;
  consumoTeForaPontaValor: number | null;
  consumoTusdPontaKwh: number | null;
  consumoTusdPontaValor: number | null;
  consumoTusdForaPontaKwh: number | null;
  consumoTusdForaPontaValor: number | null;
  tarifaTePonta: number | null;
  tarifaTeForaPonta: number | null;
  tarifaTusdPonta: number | null;
  tarifaTusdForaPonta: number | null;
}

function isTeDesc(d: string): boolean {
  // " - TE", " TE ", "-TE" no fim/contexto. Excluir "TUSD" e "tensao".
  if (d.includes("tusd")) return false;
  return /\bte\b/.test(d) || / - te\b/.test(d) || /-te\b/.test(d);
}

function parseConsumoPosto(items: LinhaDescOp[]): ConsumoPostoInfo {
  const out: ConsumoPostoInfo = {
    consumoPontaKwh: null,
    consumoForaPontaKwh: null,
    consumoTePontaKwh: null,
    consumoTePontaValor: null,
    consumoTeForaPontaKwh: null,
    consumoTeForaPontaValor: null,
    consumoTusdPontaKwh: null,
    consumoTusdPontaValor: null,
    consumoTusdForaPontaKwh: null,
    consumoTusdForaPontaValor: null,
    tarifaTePonta: null,
    tarifaTeForaPonta: null,
    tarifaTusdPonta: null,
    tarifaTusdForaPonta: null,
  };
  for (const it of items) {
    if (it.unidade !== "kWh") continue;
    const d = normDesc(it.desc);
    // Consumo (não injeção, não bandeira, não disponibilidade, não reativo)
    if (!(d.startsWith("consumo") || d.startsWith("cons "))) continue;
    if (d.includes("inj") || d.includes("bandeira") || d.includes("disp") || d.includes("reativ")) continue;
    const posto = detectPosto(it.desc);
    if (!posto) continue;
    const isTusd = d.includes("tusd");
    const isTe = !isTusd && isTeDesc(d);

    if (posto === "PONTA") {
      if (out.consumoPontaKwh == null && it.qtd != null) out.consumoPontaKwh = it.qtd;
      if (isTusd) {
        if (out.consumoTusdPontaKwh == null) out.consumoTusdPontaKwh = it.qtd;
        if (out.consumoTusdPontaValor == null) out.consumoTusdPontaValor = it.valorTotal;
        if (out.tarifaTusdPonta == null) out.tarifaTusdPonta = it.tarifaAneel;
      } else if (isTe) {
        if (out.consumoTePontaKwh == null) out.consumoTePontaKwh = it.qtd;
        if (out.consumoTePontaValor == null) out.consumoTePontaValor = it.valorTotal;
        if (out.tarifaTePonta == null) out.tarifaTePonta = it.tarifaAneel;
      }
    } else {
      if (out.consumoForaPontaKwh == null && it.qtd != null) out.consumoForaPontaKwh = it.qtd;
      if (isTusd) {
        if (out.consumoTusdForaPontaKwh == null) out.consumoTusdForaPontaKwh = it.qtd;
        if (out.consumoTusdForaPontaValor == null) out.consumoTusdForaPontaValor = it.valorTotal;
        if (out.tarifaTusdForaPonta == null) out.tarifaTusdForaPonta = it.tarifaAneel;
      } else if (isTe) {
        if (out.consumoTeForaPontaKwh == null) out.consumoTeForaPontaKwh = it.qtd;
        if (out.consumoTeForaPontaValor == null) out.consumoTeForaPontaValor = it.valorTotal;
        if (out.tarifaTeForaPonta == null) out.tarifaTeForaPonta = it.tarifaAneel;
      }
    }
  }
  return out;
}

interface BandeiraInfo {
  bandeiraValorPonta: number | null;
  bandeiraValorForaPonta: number | null;
  bandeiraCreditoPontaValor: number | null;
  bandeiraCreditoForaPontaValor: number | null;
}

function parseBandeira(items: LinhaDescOp[]): BandeiraInfo {
  const out: BandeiraInfo = {
    bandeiraValorPonta: null,
    bandeiraValorForaPonta: null,
    bandeiraCreditoPontaValor: null,
    bandeiraCreditoForaPontaValor: null,
  };
  for (const it of items) {
    if (it.unidade !== "kWh") continue;
    const d = normDesc(it.desc);
    const isAdicional = d.startsWith("adicional band") || d.includes("adic band");
    const isCredito = d.startsWith("cred adc band") || d.startsWith("credito band") || d.startsWith("cred band");
    if (!isAdicional && !isCredito) continue;
    const posto = detectPosto(it.desc);
    if (!posto) continue;
    // Bandeira RGE não tem colunas de tarifa (é só o adicional R$, depois base
    // ICMS, alíq, ICMS). Então o 1º número (qtd) é o valor R$ — usar ele em vez
    // do "valorTotal" (que cairia no ICMS).
    const v = it.qtd;
    if (v == null) continue;
    if (isAdicional) {
      if (posto === "PONTA") out.bandeiraValorPonta = (out.bandeiraValorPonta ?? 0) + v;
      else out.bandeiraValorForaPonta = (out.bandeiraValorForaPonta ?? 0) + v;
    } else {
      if (posto === "PONTA") out.bandeiraCreditoPontaValor = (out.bandeiraCreditoPontaValor ?? 0) + v;
      else out.bandeiraCreditoForaPontaValor = (out.bandeiraCreditoForaPontaValor ?? 0) + v;
    }
  }
  return out;
}

interface InjecaoPostoInfo {
  injetadaPontaKwh: number | null;
  injetadaPontaValor: number | null;
  injetadaForaPontaKwh: number | null;
  injetadaForaPontaValor: number | null;
}

/**
 * Soma TUSD + TE de injeção por posto.
 * Linhas: "Energia Atv Inj Ponta TUSD ...", "Energia Atv Injetada Ponta TE ...", etc.
 */
function parseInjecaoPosto(items: LinhaDescOp[]): InjecaoPostoInfo {
  const out: InjecaoPostoInfo = {
    injetadaPontaKwh: null,
    injetadaPontaValor: null,
    injetadaForaPontaKwh: null,
    injetadaForaPontaValor: null,
  };
  // Maps TUSD/TE separados pra somar kWh corretamente (mesma qtd nos dois lados do mesmo posto).
  const tusd = { ponta: { kwh: 0, valor: 0, n: 0 }, fp: { kwh: 0, valor: 0, n: 0 } };
  const te = { ponta: { kwh: 0, valor: 0, n: 0 }, fp: { kwh: 0, valor: 0, n: 0 } };
  for (const it of items) {
    if (it.unidade !== "kWh") continue;
    const d = normDesc(it.desc);
    if (!(d.includes("energ") && d.includes("inj"))) continue;
    const posto = detectPosto(it.desc);
    if (!posto) continue;
    const isTusd = d.includes("tusd");
    const isTe = !isTusd && isTeDesc(d);
    const target = isTusd ? tusd : isTe ? te : null;
    if (!target) continue;
    const slot = posto === "PONTA" ? target.ponta : target.fp;
    if (it.qtd != null) { slot.kwh += it.qtd; slot.n += 1; }
    if (it.valorTotal != null) slot.valor += it.valorTotal;
  }
  // kWh total = max(TUSD, TE) — ambos refletem o mesmo kWh injetado, mas em
  // faturas com OCR/clusterização parcial um lado pode vir incompleto.
  const pontaKwh = Math.max(tusd.ponta.kwh, te.ponta.kwh);
  const fpKwh = Math.max(tusd.fp.kwh, te.fp.kwh);
  if (tusd.ponta.n + te.ponta.n > 0) {
    out.injetadaPontaKwh = pontaKwh;
    out.injetadaPontaValor = tusd.ponta.valor + te.ponta.valor;
  }
  if (tusd.fp.n + te.fp.n > 0) {
    out.injetadaForaPontaKwh = fpKwh;
    out.injetadaForaPontaValor = tusd.fp.valor + te.fp.valor;
  }
  return out;
}

interface ReativoInfo {
  reativoExcedentePontaKvar: number | null;
  reativoExcedentePontaValor: number | null;
  reativoExcedenteForaPontaKvar: number | null;
  reativoExcedenteForaPontaValor: number | null;
}

function parseReativo(items: LinhaDescOp[]): ReativoInfo {
  const out: ReativoInfo = {
    reativoExcedentePontaKvar: null,
    reativoExcedentePontaValor: null,
    reativoExcedenteForaPontaKvar: null,
    reativoExcedenteForaPontaValor: null,
  };
  for (const it of items) {
    const d = normDesc(it.desc);
    if (!(d.includes("reativ") && (d.includes("exc") || d.includes("excedente")))) continue;
    const posto = detectPosto(it.desc);
    if (!posto) continue;
    if (posto === "PONTA") {
      if (out.reativoExcedentePontaKvar == null) out.reativoExcedentePontaKvar = it.qtd;
      if (out.reativoExcedentePontaValor == null) out.reativoExcedentePontaValor = it.valorTotal;
    } else {
      if (out.reativoExcedenteForaPontaKvar == null) out.reativoExcedenteForaPontaKvar = it.qtd;
      if (out.reativoExcedenteForaPontaValor == null) out.reativoExcedenteForaPontaValor = it.valorTotal;
    }
  }
  return out;
}

/**
 * Saldo por posto pode aparecer como:
 *  - "Saldo em Energia da Instalação: Ponta 0,0000000000 kWh"
 *  - "Fora Ponta 16.177,9198428489 kWh"
 *  ...em uma ou duas linhas (depende de clusterização do pdfjs).
 */
function parseSaldoPosto(lines: string[]): { saldoPontaKwh: number | null; saldoForaPontaKwh: number | null } {
  let ponta: number | null = null;
  let fp: number | null = null;
  // Junta todas as linhas que mencionam "Saldo em Energia" e as 3 seguintes
  // (caso o "Fora Ponta X kWh" venha quebrado em outro cluster).
  for (let i = 0; i < lines.length; i++) {
    const d = normDesc(lines[i]);
    if (!d.includes("saldo em energia")) continue;
    const window = lines.slice(i, Math.min(i + 4, lines.length)).join(" ");
    const wd = normDesc(window);
    // Ponta primeiro
    const mPonta = window.match(/Ponta[:\s]+([\d.]+(?:,\d+)?)\s*kwh/i);
    if (mPonta && ponta == null) ponta = parseNumBR(mPonta[1]);
    // FPonta — atenção pra não confundir com "Ponta" sem prefixo "Fora"
    const mFp = window.match(/(?:Fora\s+Ponta|FPonta)[:\s]+([\d.]+(?:,\d+)?)\s*kwh/i);
    if (mFp && fp == null) fp = parseNumBR(mFp[1]);
    // Caso especial: saldo único sem distinção de posto (Convencional ou Grupo B)
    if (ponta == null && fp == null) {
      const mUnico = window.match(/saldo em energia[^0-9]*([\d.]+(?:,\d+)?)\s*kwh/i);
      // não atribui aqui — saldo único cai em saldoCreditos do bill principal
      void mUnico;
    }
    void wd;
    break;
  }
  return { saldoPontaKwh: ponta, saldoForaPontaKwh: fp };
}

/**
 * Leituras das 8 grandezas. Padrão da linha:
 *   "<medidor> <Grandeza com unidade> <Posto?> <leit_anterior> <leit_atual> <constante> <consumo>"
 * Exemplo:
 *   "40194472 Energia Ativa - kWh Ponta 000211 000223 2,10000 25"
 *   "40194472 Energia Injetada - kW Fora Ponta 161525 166016 2,10000 9.431"
 */
function parseLeiturasMedidor(lines: string[]): GrupoALeituraMedidor[] {
  const out: GrupoALeituraMedidor[] = [];
  // Regex: começa com 6-10 dígitos do medidor, descrição, depois 4 números.
  const regex = /^\s*(\d{6,10})\s+(.+?)\s+(\d{4,7})\s+(\d{4,7})\s+([\d.,]+)\s+([\d.,]+)\s*$/;
  const seen = new Set<string>();
  for (const line of lines) {
    const m = line.match(regex);
    if (!m) continue;
    const [, , descRaw, antRaw, atualRaw, constRaw, consRaw] = m;
    const desc = descRaw.trim();
    const d = normDesc(desc);
    // Filtro: tem que mencionar uma grandeza conhecida
    const isAtiva = d.includes("ativa");
    const isDemanda = d.includes("demanda");
    const isReativa = d.includes("reativ");
    const isInjetada = d.includes("injetada") || d.includes("inj");
    if (!isAtiva && !isDemanda && !isReativa && !isInjetada) continue;
    let unidade: GrupoALeituraMedidor["unidade"] = "kWh";
    if (d.includes("kvar") || d.includes("kva")) unidade = "kVAr";
    else if (d.includes("kw") && !d.includes("kwh")) unidade = "kW";
    const posto: GrupoALeituraMedidor["posto"] = detectPosto(desc) ?? "UNICO";
    // Chave dedup: grandeza + posto
    const key = `${d}|${posto}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      grandeza: desc,
      posto,
      unidade,
      leituraAnterior: parseNumBR(antRaw),
      leituraAtual: parseNumBR(atualRaw),
      constante: parseNumBR(constRaw),
      consumo: parseNumBR(consRaw),
    });
  }
  return out;
}

/**
 * Campos Grupo A no formato esperado pelo Prisma `ConsumerBill`.
 * Subset das colunas adicionadas pela migration `20260508120000_add_grupo_a_fields`.
 * Todos opcionais — quando a fatura é Grupo B, todos viram null.
 */
export interface GrupoABillFields {
  consumoPontaKwh: number | null;
  consumoForaPontaKwh: number | null;
  consumoTePontaKwh: number | null;
  consumoTePontaValor: number | null;
  consumoTeForaPontaKwh: number | null;
  consumoTeForaPontaValor: number | null;
  consumoTusdPontaKwh: number | null;
  consumoTusdPontaValor: number | null;
  consumoTusdForaPontaKwh: number | null;
  consumoTusdForaPontaValor: number | null;
  tarifaTePonta: number | null;
  tarifaTeForaPonta: number | null;
  tarifaTusdPonta: number | null;
  tarifaTusdForaPonta: number | null;
  bandeiraValorPonta: number | null;
  bandeiraValorForaPonta: number | null;
  bandeiraCreditoPontaValor: number | null;
  bandeiraCreditoForaPontaValor: number | null;
  demandaMedidaKw: number | null;
  demandaMedidaPontaKw: number | null;
  demandaTusdValor: number | null;
  tarifaDemanda: number | null;
  demandaUltrapassagemKw: number | null;
  demandaUltrapassagemValor: number | null;
  tusdGeracaoKw: number | null;
  tusdGeracaoValor: number | null;
  tarifaTusdGeracao: number | null;
  injetadaPontaKwh: number | null;
  injetadaPontaValor: number | null;
  injetadaForaPontaKwh: number | null;
  injetadaForaPontaValor: number | null;
  saldoPontaKwh: number | null;
  saldoForaPontaKwh: number | null;
  reativoExcedentePontaKvar: number | null;
  reativoExcedentePontaValor: number | null;
  reativoExcedenteForaPontaKvar: number | null;
  reativoExcedenteForaPontaValor: number | null;
  leiturasMedidorJson: string | null;
}

export const EMPTY_GRUPO_A_BILL_FIELDS: GrupoABillFields = {
  consumoPontaKwh: null,
  consumoForaPontaKwh: null,
  consumoTePontaKwh: null,
  consumoTePontaValor: null,
  consumoTeForaPontaKwh: null,
  consumoTeForaPontaValor: null,
  consumoTusdPontaKwh: null,
  consumoTusdPontaValor: null,
  consumoTusdForaPontaKwh: null,
  consumoTusdForaPontaValor: null,
  tarifaTePonta: null,
  tarifaTeForaPonta: null,
  tarifaTusdPonta: null,
  tarifaTusdForaPonta: null,
  bandeiraValorPonta: null,
  bandeiraValorForaPonta: null,
  bandeiraCreditoPontaValor: null,
  bandeiraCreditoForaPontaValor: null,
  demandaMedidaKw: null,
  demandaMedidaPontaKw: null,
  demandaTusdValor: null,
  tarifaDemanda: null,
  demandaUltrapassagemKw: null,
  demandaUltrapassagemValor: null,
  tusdGeracaoKw: null,
  tusdGeracaoValor: null,
  tarifaTusdGeracao: null,
  injetadaPontaKwh: null,
  injetadaPontaValor: null,
  injetadaForaPontaKwh: null,
  injetadaForaPontaValor: null,
  saldoPontaKwh: null,
  saldoForaPontaKwh: null,
  reativoExcedentePontaKvar: null,
  reativoExcedentePontaValor: null,
  reativoExcedenteForaPontaKvar: null,
  reativoExcedenteForaPontaValor: null,
  leiturasMedidorJson: null,
};

/**
 * Achata GrupoAData → campos planos do schema. Spread direto em `data` do
 * `prisma.consumerBill.create/update`. Retorna todos null quando `g` é null.
 *
 * Nota: cadastro contratual da UC (modalidade, geração contratada, demanda
 * contratada) NÃO entra no bill — vai pra ConsumerUnit, atualizado em outro fluxo.
 */
export function grupoAToBillFields(g: GrupoAData | null): GrupoABillFields {
  if (!g) return { ...EMPTY_GRUPO_A_BILL_FIELDS };
  return {
    consumoPontaKwh: g.consumoPontaKwh,
    consumoForaPontaKwh: g.consumoForaPontaKwh,
    consumoTePontaKwh: g.consumoTePontaKwh,
    consumoTePontaValor: g.consumoTePontaValor,
    consumoTeForaPontaKwh: g.consumoTeForaPontaKwh,
    consumoTeForaPontaValor: g.consumoTeForaPontaValor,
    consumoTusdPontaKwh: g.consumoTusdPontaKwh,
    consumoTusdPontaValor: g.consumoTusdPontaValor,
    consumoTusdForaPontaKwh: g.consumoTusdForaPontaKwh,
    consumoTusdForaPontaValor: g.consumoTusdForaPontaValor,
    tarifaTePonta: g.tarifaTePonta,
    tarifaTeForaPonta: g.tarifaTeForaPonta,
    tarifaTusdPonta: g.tarifaTusdPonta,
    tarifaTusdForaPonta: g.tarifaTusdForaPonta,
    bandeiraValorPonta: g.bandeiraValorPonta,
    bandeiraValorForaPonta: g.bandeiraValorForaPonta,
    bandeiraCreditoPontaValor: g.bandeiraCreditoPontaValor,
    bandeiraCreditoForaPontaValor: g.bandeiraCreditoForaPontaValor,
    demandaMedidaKw: g.demandaMedidaKw,
    demandaMedidaPontaKw: g.demandaMedidaPontaKw,
    demandaTusdValor: g.demandaTusdValor,
    tarifaDemanda: g.tarifaDemanda,
    demandaUltrapassagemKw: g.demandaUltrapassagemKw,
    demandaUltrapassagemValor: g.demandaUltrapassagemValor,
    tusdGeracaoKw: g.tusdGeracaoKw,
    tusdGeracaoValor: g.tusdGeracaoValor,
    tarifaTusdGeracao: g.tarifaTusdGeracao,
    injetadaPontaKwh: g.injetadaPontaKwh,
    injetadaPontaValor: g.injetadaPontaValor,
    injetadaForaPontaKwh: g.injetadaForaPontaKwh,
    injetadaForaPontaValor: g.injetadaForaPontaValor,
    saldoPontaKwh: g.saldoPontaKwh,
    saldoForaPontaKwh: g.saldoForaPontaKwh,
    reativoExcedentePontaKvar: g.reativoExcedentePontaKvar,
    reativoExcedentePontaValor: g.reativoExcedentePontaValor,
    reativoExcedenteForaPontaKvar: g.reativoExcedenteForaPontaKvar,
    reativoExcedenteForaPontaValor: g.reativoExcedenteForaPontaValor,
    leiturasMedidorJson: g.leiturasMedidor.length > 0 ? JSON.stringify(g.leiturasMedidor) : null,
  };
}

/**
 * Detecta + extrai dados Grupo A. Retorna `null` se a fatura é Grupo B
 * (sem classificação A1..A4/AS) ou se não conseguiu identificar nada.
 */
export function extractGrupoA(lines: string[]): GrupoAData | null {
  const { modalidade, subgrupo } = parseClassificacao(lines);
  // Heurística primária: subgrupo A. Heurística secundária: presença de demanda em kW
  // (algumas faturas omitem a string "Classificação"). Se nenhum dos dois → retorna null.
  const items = parseDescOpLines(lines);
  const hasDemandaKw = items.some((it) => it.unidade === "kW" && /^demanda/.test(normDesc(it.desc)));
  const hasTusdGeracao = items.some((it) => {
    const d = normDesc(it.desc);
    return it.unidade === "kW" && (d.includes("uso") && d.includes("distr") && d.includes("gera"));
  });
  if (!subgrupo && !hasDemandaKw && !hasTusdGeracao) return null;

  const tensao = parseTensaoContratada(lines);
  const dContrat = parseDemandaContratada(lines);
  const demanda = parseDemanda(items);
  const tusdG = parseTusdG(items);
  const consumo = parseConsumoPosto(items);
  const bandeira = parseBandeira(items);
  const injecao = parseInjecaoPosto(items);
  const reativo = parseReativo(items);
  const saldo = parseSaldoPosto(lines);
  const leituras = parseLeiturasMedidor(lines);

  return {
    modalidade,
    subgrupo,
    tensaoNominalContratadaV: tensao,
    geracaoContratadaKw: dContrat.geracaoContratadaKw,
    demandaContratadaKw: dContrat.demandaContratadaKw,
    demandaContratadaPontaKw: dContrat.demandaContratadaPontaKw,
    demandaMedidaKw: demanda.demandaMedidaKw,
    demandaMedidaPontaKw: demanda.demandaMedidaPontaKw,
    demandaTusdValor: demanda.demandaTusdValor,
    tarifaDemanda: demanda.tarifaDemanda,
    demandaUltrapassagemKw: demanda.demandaUltrapassagemKw,
    demandaUltrapassagemValor: demanda.demandaUltrapassagemValor,
    tusdGeracaoKw: tusdG.tusdGeracaoKw,
    tusdGeracaoValor: tusdG.tusdGeracaoValor,
    tarifaTusdGeracao: tusdG.tarifaTusdGeracao,
    ...consumo,
    ...bandeira,
    ...injecao,
    saldoPontaKwh: saldo.saldoPontaKwh,
    saldoForaPontaKwh: saldo.saldoForaPontaKwh,
    ...reativo,
    leiturasMedidor: leituras,
  };
}

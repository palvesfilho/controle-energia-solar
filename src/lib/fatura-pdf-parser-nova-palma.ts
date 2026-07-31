/**
 * Parser de fatura NOVA PALMA ENERGIA LTDA (CNPJ 89.889.604/0001-44).
 *
 * Formato DANF3E (Documento Auxiliar da NF de Energia Elétrica Eletrônica).
 * Concessionária de Faxinal do Soturno/RS — atende Restinga Sêca e região.
 *
 * Entra no mesmo pipeline da RGE: recebe as LINHAS já extraídas por pdfjs
 * (extractLines de fatura-pdf-parser.ts) e devolve o MESMO ParsedFaturaPdf,
 * de modo que upload-manual / ingest / reparse persistam sem saber a diferença.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DIFERENÇA IMPORTANTE PRO HANDOFF ORIGINAL
 * O pacote de transferência foi escrito pra saída do `pdf-parse`, que entrega as
 * colunas COLADAS ("Baixa/Alta Convencional TUSDkWh14690,56906835,95..."). O
 * nosso extractLines usa pdfjs com clusterização por Y e junta os itens com
 * ESPAÇO, então as colunas já vêm separadas. Os regex aqui são mais simples e
 * mais seguros que os do handoff — mas mantêm a mesma gramática-chave:
 *   • tarifa / preço unitário  → SEMPRE 5 casas decimais (0,56906)
 *   • valor em R$ e alíquota   → SEMPRE 2 casas (835,95 / 17,00)
 * Como as colunas opcionais (PIS/COFINS) somem em algumas linhas, NÃO dá pra
 * ler por posição fixa. Regra usada: dentro da linha do item, o PRIMEIRO token
 * de 5 casas é o "preço unit. com tributos" e o ÚLTIMO é a "tarifa unit."; o
 * primeiro token de 2 casas depois da quantidade é o valor em R$.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * VOCABULÁRIO DAS LINHAS (difere da RGE):
 *   Energia Ativa                    → kWh COMPRADO da rede, tarifa cheia
 *   Baixa/Alta Convencional TUSD/TE  → kWh COMPENSADO, cobrado antes de creditar
 *   Cred. Saldo Ger - MM/AAAA        → o crédito que abate (par TUSD + TE)
 *   Adicional Bandeira <cor>         → bandeira tarifária
 *   Contribuição P/ Ilum. Pública    → CIP, nunca compensada
 *
 * IDENTIDADE QUE SEMPRE FECHA (validada nas 12 faturas 07/2025–06/2026):
 *   consumo do mês = kWh comprado + kWh compensado
 * Se não fechar, a extração falhou → entra em `avisos` (não silenciar; ver
 * feedback_anomalias_sinalizar).
 *
 * ⚠️ A UC MUDA quando trocam o medidor: esta unidade era `25913-6` e virou
 * `21.779.063-74` em 11/2025. Gravar as duas em ConsumerUnit.codigoUc e
 * codigoUcAntigo (só dígitos), senão a série de consumo se parte em duas.
 *
 * Validado contra 12 PDFs reais da UC 21.779.063-74 (Fundação Antonio
 * Meneghetti, Restinga Sêca/RS) — ver scripts/test-nova-palma-parser.ts.
 */

import type { InjetadaDetalhe, HistoricoConsumoItem } from "./infosimples";
import { EMPTY_GRUPO_A_BILL_FIELDS } from "./fatura-pdf-parser-grupo-a";
import { parseDateOnlyBR } from "./date-only";
import type { ParsedFaturaPdf } from "./fatura-pdf-parser";

export const NOVA_PALMA = {
  nome: "NOVA PALMA ENERGIA",
  razaoSocial: "NOVA PALMA ENERGIA LTDA",
  cnpj: "89.889.604/0001-44",
  uf: "RS",
} as const;

/**
 * Detecta a concessionária. Prioriza o CNPJ — o nome fantasia pode variar.
 */
export function ehNovaPalma(lines: string[]): boolean {
  return lines.some(
    (l) => /89\.889\.604\/0001-44/.test(l) || /NOVA\s+PALMA\s+ENERGIA/i.test(l),
  );
}

/** "4.567,97" → 4567.97 · "-1.505,78" → -1505.78 */
function num(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const s = String(raw).trim().replace(/\s/g, "");
  if (!s) return null;
  const n = parseFloat(s.replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? null : n;
}

/** Tokens de 5 casas decimais = tarifas/preços unitários. */
function tarifas(line: string): number[] {
  return (line.match(/-?[\d.]+,\d{5}\b/g) ?? []).map((t) => num(t)!).filter((n) => n != null);
}

/** Tokens de exatamente 2 casas decimais = valores em R$ / alíquotas. */
function valores2(line: string): number[] {
  return (line.match(/-?[\d.]+,\d{2}(?!\d)/g) ?? []).map((t) => num(t)!).filter((n) => n != null);
}

const MES_ABRV = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

/** "01/2025" → "JAN/25" (mesmo formato do histórico da RGE/infosimples). */
function mesAnoCurto(mes: number, ano: number): string {
  return `${MES_ABRV[mes - 1]}/${String(ano).slice(-2)}`;
}

interface ItemFatura {
  qtd: number | null;
  /** Preço unitário COM tributos (1º token de 5 casas). */
  precoComTributos: number | null;
  /** Tarifa unitária ANEEL, sem tributos (último token de 5 casas). */
  tarifa: number | null;
  /** Valor em R$ (1º token de 2 casas depois da quantidade). */
  valor: number | null;
}

/**
 * Lê um item da tabela "Itens de fatura".
 * @param line linha completa (pode ter o histórico/tributos grudados no fim —
 *             o pdfjs clusteriza por Y e as colunas da direita caem na mesma linha)
 * @param aposDesc trecho da linha após a descrição do item
 */
function lerItem(line: string, aposDesc: string): ItemFatura {
  const tar = tarifas(line);
  // A quantidade é o primeiro número inteiro (sem decimais) do trecho.
  const mQtd = aposDesc.match(/^\s*(?:kWh\s+)?(-?\d+)(?!\d*,)/i);
  // O valor em R$ vem depois do preço unitário — pega o 1º token de 2 casas.
  const vals = valores2(aposDesc);
  return {
    qtd: mQtd ? parseInt(mQtd[1], 10) : null,
    precoComTributos: tar.length > 0 ? tar[0] : null,
    tarifa: tar.length > 0 ? tar[tar.length - 1] : null,
    valor: vals.length > 0 ? vals[0] : null,
  };
}

/** Recorta a linha a partir do fim do match da descrição. */
function apos(line: string, m: RegExpMatchArray): string {
  return line.slice((m.index ?? 0) + m[0].length);
}

export function parseNovaPalma(lines: string[]): ParsedFaturaPdf {
  const avisos: string[] = [];
  const rawText = lines.join("\n");

  // ── Competência / vencimento / total ─────────────────────────────────────
  // "01/2026 11/02/2026 R$ 2.091,57"
  let mesReferencia = 0;
  let anoReferencia = 0;
  let vencimento: Date | null = null;
  let valorTotal: number | null = null;
  for (const line of lines) {
    const m = line.match(/^\s*(\d{2})\/(\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+R\$\s*([\d.,]+)\s*$/);
    if (!m) continue;
    mesReferencia = parseInt(m[1], 10);
    anoReferencia = parseInt(m[2], 10);
    vencimento = parseDateOnlyBR(m[3]);
    valorTotal = num(m[4]);
    break;
  }
  // Fallback: rodapé "01/2026 21.779.063-74 2 - CASA 3 883200 11/02/2026 R$ 2.091,57"
  let ucRodape: string | null = null;
  for (const line of lines) {
    const m = line.match(
      /^\s*(\d{2})\/(\d{4})\s+(\d[\d.]*-\d{1,2})\s+.*?(\d{2}\/\d{2}\/\d{4})\s+R\$\s*([\d.,]+)\s*$/,
    );
    if (!m) continue;
    ucRodape = m[3];
    if (!mesReferencia) {
      mesReferencia = parseInt(m[1], 10);
      anoReferencia = parseInt(m[2], 10);
    }
    if (!vencimento) vencimento = parseDateOnlyBR(m[4]);
    if (valorTotal == null) valorTotal = num(m[5]);
    break;
  }
  const competencia = mesReferencia
    ? `${String(mesReferencia).padStart(2, "0")}/${anoReferencia}`
    : null;

  // ── UC ────────────────────────────────────────────────────────────────────
  // O número fica na linha SEGUINTE ao rótulo "UNIDADE CONSUMIDORA"
  // (pdfjs quebra a coluna da direita): "21.779.063-74" ou, nas antigas, "25913-6".
  let ucFormatada: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    if (!/UNIDADE\s+CONSUMIDORA/i.test(lines[i])) continue;
    for (let j = i; j < Math.min(i + 5, lines.length); j++) {
      const m = lines[j].match(/(?:^|\s)(\d[\d.]*-\d{1,2})(?:\s|$)/);
      if (m) {
        ucFormatada = m[1];
        break;
      }
    }
    if (ucFormatada) break;
  }
  if (!ucFormatada) ucFormatada = ucRodape;
  // Forma canônica no sistema = SÓ DÍGITOS (ver project_codigo_uc_antigo_ui_multi).
  const codigoInstalacao = ucFormatada ? ucFormatada.replace(/\D/g, "") : null;

  // ── Dados de cadastro do titular ──────────────────────────────────────────
  // Não existe coluna no ConsumerBill pra isso — vai em rawJson.cadastro, que é
  // o que o operador usa pra cadastrar a UC na primeira fatura recebida.
  const acharEm = (re: RegExp): string | null => {
    for (const l of lines) {
      const m = l.match(re);
      if (m) return (m[1] ?? m[0]).trim();
    }
    return null;
  };
  // O pdfjs intercala as duas colunas do cabeçalho, então o titular e seu
  // endereço ficam colados ao rótulo "Origem leitura ...": o nome é a linha
  // ANTERIOR e o endereço a SEGUINTE. ⚠️ Não dá pra procurar "AVENIDA/RUA" solto
  // — a primeira que aparece é o endereço da própria concessionária.
  let clienteNome: string | null = null;
  let clienteEndereco: string | null = null;
  for (let i = 1; i < lines.length - 1; i++) {
    if (/^\s*Origem\s+leitura\b/i.test(lines[i])) {
      clienteNome = lines[i - 1].trim();
      clienteEndereco = lines[i + 1].trim();
      break;
    }
  }
  const cadastro = {
    clienteNome,
    clienteDocumento: acharEm(/CPF\/CNPJ:\s*([\d./-]+)/),
    classificacao: acharEm(/Classifica[çc][ãa]o:\s*([AB]\d)/),
    modalidadeTarifaria: acharEm(/Modalidade\s+Tarif[áa]ria:\s*(\w+)/i),
    tipoFornecimento: acharEm(/\b(Trif[áa]sico|Bif[áa]sico|Monof[áa]sico)\b/i),
    cidade: acharEm(/\/\s*([^/]+?)-RS\s+UNIDADE\s+CONSUMIDORA/i),
    endereco: clienteEndereco,
    notaFiscal: acharEm(/NOTA\s+FISCAL\s+N[ºo]\s*(\d+)/i),
    // Chave de acesso da NF-e: 44 dígitos em blocos de 4.
    chaveAcesso: acharEm(/((?:\d{4}\s+){10}\d{4})/)?.replace(/\D/g, "") ?? null,
  };

  // ── Ciclo de leitura ──────────────────────────────────────────────────────
  // "PRAÇA RECANTO / TREVO RS149 12/12/2025 12/01/2026 31 15/02/2026"
  // ⚠️ A Nova Palma imprime ANTERIOR primeiro (a RGE imprime a ATUAL primeiro).
  let dataLeituraAnterior: Date | null = null;
  let dataLeituraAtual: Date | null = null;
  let diasFaturamento: number | null = null;
  let proximaLeitura: Date | null = null;
  for (const line of lines) {
    const m = line.match(
      /(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{1,3})(?!\/)\s+(\d{2}\/\d{2}\/\d{4})/,
    );
    if (!m) continue;
    dataLeituraAnterior = parseDateOnlyBR(m[1]);
    dataLeituraAtual = parseDateOnlyBR(m[2]);
    diasFaturamento = parseInt(m[3], 10);
    proximaLeitura = parseDateOnlyBR(m[4]);
    break;
  }

  // ── Medidor ───────────────────────────────────────────────────────────────
  // "7058114 Energia Ativa-kWh Unico 4396 10633 1 6237"   (consumo)
  // "7058114 Energia Ativa injetada Unico 4966 9077 1 4111" (injeção da usina)
  // "Unico" aparece com e sem acento em faturas diferentes.
  let leituraAnterior: number | null = null;
  let leituraAtual: number | null = null;
  let consumoMedidorKwh: number | null = null;
  let leituraInjetadaAnterior: number | null = null;
  let leituraInjetadaAtual: number | null = null;
  let constanteMedidorInjetada: number | null = null;
  let energiaInjetadaMedidorKwh: number | null = null;
  const RE_MEDIDOR = /\d+\s+Energia\s+Ativa(-kWh|\s+injetada)\s+[ÚU]nico\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/i;
  for (const line of lines) {
    const m = line.match(RE_MEDIDOR);
    if (!m) continue;
    const ehInjecao = /inj/i.test(m[1]);
    if (ehInjecao) {
      leituraInjetadaAnterior = parseInt(m[2], 10);
      leituraInjetadaAtual = parseInt(m[3], 10);
      constanteMedidorInjetada = parseInt(m[4], 10);
      energiaInjetadaMedidorKwh = parseInt(m[5], 10);
    } else if (consumoMedidorKwh == null) {
      leituraAnterior = parseInt(m[2], 10);
      leituraAtual = parseInt(m[3], 10);
      consumoMedidorKwh = parseInt(m[5], 10);
      // Troca de medidor no meio do ciclo zera a leitura: em 11/2025 o medidor
      // foi de 0 a 932 mas o consumo faturado foi 5.424 kWh. Sinalizar, não corrigir.
      if (leituraAtual - leituraAnterior !== consumoMedidorKwh) {
        avisos.push(
          `Leitura do medidor não fecha com o consumo (${leituraAtual} − ${leituraAnterior} ≠ ${consumoMedidorKwh}) — provável troca de medidor.`,
        );
      }
    }
  }

  // ── Histórico de 13 meses ─────────────────────────────────────────────────
  // A tabela "CONSUMO / KWH" vem em TODA fatura: "01/2025 4608 33".
  // O pdfjs cola essas células no fim das linhas de item, por isso o match é
  // ancorado no FIM da linha; o último par sempre é (consumo, nº de dias).
  const historico: HistoricoConsumoItem[] = [];
  const vistos = new Set<string>();
  for (const line of lines) {
    const m = line.match(/(?:^|\s)(\d{2})\/(\d{4})\s+(\d{1,6})\s+(\d{2})\s*$/);
    if (!m) continue;
    const mes = parseInt(m[1], 10);
    const ano = parseInt(m[2], 10);
    if (mes < 1 || mes > 12) continue;
    const chave = mesAnoCurto(mes, ano);
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    historico.push({ mesAno: chave, consumoKwh: parseInt(m[3], 10), dias: parseInt(m[4], 10) });
  }
  const histDoMes = competencia
    ? historico.find((h) => h.mesAno === mesAnoCurto(mesReferencia, anoReferencia))
    : undefined;

  // Consumo do mês: o medidor e o histórico devem concordar. Preferimos o
  // histórico (é o consumo FATURADO; o medidor quebra em troca de aparelho).
  const consumoKwh = histDoMes?.consumoKwh ?? consumoMedidorKwh;
  if (
    histDoMes?.consumoKwh != null &&
    consumoMedidorKwh != null &&
    histDoMes.consumoKwh !== consumoMedidorKwh
  ) {
    avisos.push(
      `Consumo do histórico (${histDoMes.consumoKwh}) difere do medidor (${consumoMedidorKwh}).`,
    );
  }
  if (diasFaturamento == null && histDoMes?.dias != null) {
    diasFaturamento = histDoMes.dias;
  } else if (histDoMes?.dias != null && diasFaturamento !== histDoMes.dias) {
    // Acontece: 03/2026 imprime 33 dias no ciclo (14/02→19/03) e 34 no histórico.
    // Mantemos o do ciclo (bate com a diferença das datas) e sinalizamos.
    avisos.push(
      `Nº de dias do ciclo (${diasFaturamento}) difere do histórico (${histDoMes.dias}) — usando o do ciclo.`,
    );
  }

  // ── Itens de fatura ───────────────────────────────────────────────────────
  let compradoKwh: number | null = null;
  let compradoValor: number | null = null;
  let tarifaEnergiaAtiva: number | null = null;
  let precoEnergiaAtiva: number | null = null;

  let consumoTusdKwh: number | null = null, consumoTusdValor: number | null = null;
  let consumoTeKwh: number | null = null, consumoTeValor: number | null = null;
  let tarifaTUSD: number | null = null, tarifaTusdComTributos: number | null = null;
  let tarifaTE: number | null = null, tarifaTeComTributos: number | null = null;

  let bandeiraTarifaria: string | null = null;
  let bandeiraValor: number | null = null;
  let bandeiraAmarelaValor: number | null = null;
  let bandeiraVermelhaValor: number | null = null;

  let iluminacaoPublicaCip: number | null = null;
  let jurosMora: number | null = null;
  let multaAtraso: number | null = null;

  /** Créditos "Cred. Saldo Ger - MM/AAAA", agrupados por competência de origem. */
  const creditosPorOrigem = new Map<string, InjetadaDetalhe>();
  let creditoTusdKwh = 0, creditoTusdValor = 0;
  let creditoTeKwh = 0, creditoTeValor = 0;
  let temCreditoTusd = false, temCreditoTe = false;

  for (const line of lines) {
    let m: RegExpMatchArray | null;

    // kWh COMPRADO da concessionária — tarifa cheia (~R$ 0,95).
    if ((m = line.match(/^\s*Energia\s+Ativa\s+kWh\b/i))) {
      const it = lerItem(line, apos(line, m));
      compradoKwh = it.qtd;
      compradoValor = it.valor;
      precoEnergiaAtiva = it.precoComTributos;
      tarifaEnergiaAtiva = it.tarifa;
      continue;
    }

    // Parcela TUSD do kWh COMPENSADO. ⚠️ "Baixa/Alta ... TUSD" NÃO tem espaço
    // depois da barra; "Baixa/ Alta ... TE" tem. Daí o `\/ ?`.
    if ((m = line.match(/^\s*Baixa\/ ?Alta\s+Convencional\s+TUSD\s+kWh\b/i))) {
      const it = lerItem(line, apos(line, m));
      consumoTusdKwh = it.qtd;
      consumoTusdValor = it.valor;
      tarifaTusdComTributos = it.precoComTributos;
      tarifaTUSD = it.tarifa;
      continue;
    }
    if ((m = line.match(/^\s*Baixa\/ ?Alta\s+Convencional\s+TE\b/i))) {
      const it = lerItem(line, apos(line, m));
      consumoTeKwh = it.qtd;
      consumoTeValor = it.valor;
      tarifaTeComTributos = it.precoComTributos;
      tarifaTE = it.tarifa;
      continue;
    }

    // Crédito de geração. Vem em PAR (TUSD + TE) referindo-se ao MESMO kWh —
    // e pode haver vários pares, de competências diferentes, no mesmo mês
    // (caso real 01/2026: 4 linhas, 01/2026 e 12/2025). A parcela TUSD
    // (tarifa > 0,1) é a que representa o kWh compensado; a TE (~0,025) é o
    // mesmo kWh — somar as duas contaria a energia em dobro.
    if ((m = line.match(/^\s*Cred\.\s*Saldo\s*Ger\s*-\s*(\d{2}\/\d{4})\b/i))) {
      const origemMes = parseInt(m[1].slice(0, 2), 10);
      const origemAno = parseInt(m[1].slice(3), 10);
      const origem = mesAnoCurto(origemMes, origemAno);
      const it = lerItem(line, apos(line, m));
      const kwh = Math.abs(it.qtd ?? 0);
      const valor = Math.abs(it.valor ?? 0);
      const entry = creditosPorOrigem.get(origem) ?? {
        mesOrigem: origem,
        teKwh: null, teValor: null, tusdKwh: null, tusdValor: null,
      };
      if ((it.tarifa ?? 0) > 0.1) {
        entry.tusdKwh = (entry.tusdKwh ?? 0) + kwh;
        entry.tusdValor = (entry.tusdValor ?? 0) + valor;
        creditoTusdKwh += kwh;
        creditoTusdValor += valor;
        temCreditoTusd = true;
      } else {
        entry.teKwh = (entry.teKwh ?? 0) + kwh;
        entry.teValor = (entry.teValor ?? 0) + valor;
        creditoTeKwh += kwh;
        creditoTeValor += valor;
        temCreditoTe = true;
      }
      creditosPorOrigem.set(origem, entry);
      continue;
    }

    if ((m = line.match(/^\s*Adicional\s+Bandeira\s+(Verde|Amarela|Vermelha\s*2?)\b/i))) {
      const it = lerItem(line, apos(line, m));
      const cor = m[1].replace(/\s+/g, " ").trim().toLowerCase();
      if (cor.startsWith("vermelha 2")) bandeiraTarifaria = "Vermelha 2";
      else if (cor.startsWith("vermelha")) bandeiraTarifaria = "Vermelha 1";
      else if (cor === "amarela") bandeiraTarifaria = "Amarela";
      else bandeiraTarifaria = "Verde";
      if (it.valor != null) {
        bandeiraValor = (bandeiraValor ?? 0) + it.valor;
        if (bandeiraTarifaria === "Amarela") {
          bandeiraAmarelaValor = (bandeiraAmarelaValor ?? 0) + it.valor;
        } else if (bandeiraTarifaria === "Vermelha 1") {
          bandeiraVermelhaValor = (bandeiraVermelhaValor ?? 0) + it.valor;
        }
      }
      continue;
    }

    // CIP — nunca é compensada pela usina.
    // "Contribuição P/ Ilum. Pública Municipal 1 165,49000 165,49"
    if ((m = line.match(/^\s*Contribui[çc][ãa]o\s+P\/\s*Ilum\.\s*P[úu]blica\s+Municipal\b/i))) {
      const it = lerItem(line, apos(line, m));
      if (it.valor != null) iluminacaoPublicaCip = (iluminacaoPublicaCip ?? 0) + it.valor;
      continue;
    }

    // Atraso de pagamento: "Juros - 05/2025 0,93" / "Multa - 05/2025 56,12".
    if ((m = line.match(/^\s*Juros\s*-\s*\d{2}\/\d{4}\s+([\d.,]+)/i))) {
      const v = num(m[1]);
      if (v != null) jurosMora = (jurosMora ?? 0) + v;
      continue;
    }
    if ((m = line.match(/^\s*Multa\s*-\s*\d{2}\/\d{4}\s+([\d.,]+)/i))) {
      const v = num(m[1]);
      if (v != null) multaAtraso = (multaAtraso ?? 0) + v;
      continue;
    }
  }

  const compensadoKwh = temCreditoTusd ? creditoTusdKwh : temCreditoTe ? creditoTeKwh : null;

  // ── Conferência aritmética (a rede de segurança do handoff) ───────────────
  if (consumoKwh != null) {
    const soma = (compradoKwh ?? 0) + (compensadoKwh ?? 0);
    if (soma !== consumoKwh) {
      avisos.push(
        `Conferência falhou: comprado (${compradoKwh ?? 0}) + compensado (${compensadoKwh ?? 0}) = ${soma} ≠ consumo (${consumoKwh}).`,
      );
    }
  }

  // ── Saldo de geração ──────────────────────────────────────────────────────
  // "Seu saldo geração é de 1253, com saldo geral de 0 a" / "expirar na data 02/2026."
  let saldoInstalacaoKwh: number | null = null;
  let saldoExpirarProxMesKwh: number | null = null;
  for (const line of lines) {
    const m = line.match(/Seu\s+saldo\s+gera[çc][ãa]o\s+[ée]\s+de\s+([\d.]+)/i);
    if (m) saldoInstalacaoKwh = num(m[1].replace(/\./g, ""));
    const e = line.match(/saldo\s+geral\s+de\s+([\d.]+)\s+a\b/i);
    if (e) saldoExpirarProxMesKwh = num(e[1].replace(/\./g, ""));
    if (saldoInstalacaoKwh != null && saldoExpirarProxMesKwh != null) break;
  }

  // ── Tributos ──────────────────────────────────────────────────────────────
  // Vêm na coluna da direita e o pdfjs os cola no fim das linhas de item:
  // "... 0,47232 PIS/PASEP 695,85 1,14 7,93" → base, alíquota, valor.
  let pis: number | null = null, cofins: number | null = null, icms: number | null = null;
  for (const line of lines) {
    let m: RegExpMatchArray | null;
    if (pis == null && (m = line.match(/PIS\/PASEP\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/i))) {
      pis = num(m[3]);
    }
    if (cofins == null && (m = line.match(/COFINS\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/i))) {
      cofins = num(m[3]);
    }
    // "ICMS 3.890,81 17,00 661,44" — o (?<!\S) evita casar "Valor ICMS Desonerado".
    if (icms == null && (m = line.match(/(?:^|\s)ICMS\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})/))) {
      icms = num(m[3]);
    }
  }

  // ── Conta paga na distribuidora ───────────────────────────────────────────
  // "Fatura paga em: 11/02/2026" (ver project_dupla_checagem_pagamento).
  const contaPaga = lines.some((l) => /Fatura\s+paga\s+em:/i.test(l));

  // ── Mapeamento pro modelo do sistema ──────────────────────────────────────
  // A usina fica na PRÓPRIA UC (mesmo medidor, grandeza "Energia Ativa
  // injetada") → é geração PRÓPRIA, não rateio de outra UC. Por isso os
  // créditos entram em energiaInjetadaPropria*, e injetadaOuc* fica null.
  const energiaCompensada = compensadoKwh;
  const creditosDetalhe = Array.from(creditosPorOrigem.values());

  return {
    codigoInstalacao,
    rawText,
    grupoA: null,
    avisos,
    bill: {
      mesReferencia: mesReferencia || new Date().getMonth() + 1,
      anoReferencia: anoReferencia || new Date().getFullYear(),
      instalacao: codigoInstalacao,
      valorTotal,
      vencimento,
      contaPaga,
      // O DANF3E traz a chave de acesso da NF-e, não a linha digitável do
      // boleto ("Autenticação no Verso") — não há código de barras a extrair.
      codigoBarras: null,

      consumoKwh,
      leituraAnterior,
      leituraAtual,
      diasFaturamento,
      proximaLeitura,
      dataLeituraAnterior,
      dataLeituraAtual,

      // Na Nova Palma as linhas TUSD/TE cobrem SÓ a parcela compensada — o kWh
      // comprado vem na linha "Energia Ativa", com tarifa cheia.
      consumoTeKwh,
      consumoTeValor,
      consumoTusdKwh,
      consumoTusdValor,

      energiaInjetada: energiaCompensada,
      energiaCompensada,
      saldoCreditos: saldoInstalacaoKwh,

      injetadaOucTeKwh: null,
      injetadaOucTeValor: null,
      injetadaOucTusdKwh: null,
      injetadaOucTusdValor: null,
      energiaInjetadaPropriaTeKwh: temCreditoTe ? creditoTeKwh : null,
      energiaInjetadaPropriaTeValor: temCreditoTe ? creditoTeValor : null,
      energiaInjetadaPropriaTusdKwh: temCreditoTusd ? creditoTusdKwh : null,
      energiaInjetadaPropriaTusdValor: temCreditoTusd ? creditoTusdValor : null,
      injetadaDetalhes: creditosDetalhe.length > 0 ? JSON.stringify(creditosDetalhe) : null,

      historicoConsumo: historico.length > 0 ? JSON.stringify(historico) : null,

      saldoInstalacaoKwh,
      saldoExpirarProxMesKwh,
      participacaoGeracaoPct: null,

      energiaInjetadaMedidorKwh,
      leituraInjetadaAnterior,
      leituraInjetadaAtual,
      constanteMedidorInjetada,

      // B3 convencional: a Nova Palma não imprime linha de custo de disponibilidade.
      custoDispTusdKwh: null,
      custoDispTusdValor: null,
      custoDispTeKwh: null,
      custoDispTeValor: null,

      tarifaTE,
      tarifaTUSD,
      tarifaTeComTributos,
      tarifaTusdComTributos,
      bandeiraTarifaria,
      bandeiraValor,
      bandeiraAmarelaValor,
      bandeiraVermelhaValor,
      bandeiraVermelha2Valor: null,
      bandeiraAmarelaCreditoValor: null,
      bandeiraVermelhaCreditoValor: null,
      bandeiraVermelha2CreditoValor: null,

      icms,
      pis,
      cofins,

      jurosMora,
      multaAtraso,
      atualizacaoMonetaria: null,
      iluminacaoPublicaCip,
      ajusteSaldoCredito: null,

      pdfUrl: null,
      fonteConsulta: "UPLOAD_MANUAL",
      rawJson: JSON.stringify({
        source: "UPLOAD_MANUAL",
        concessionaria: NOVA_PALMA.nome,
        cnpjConcessionaria: NOVA_PALMA.cnpj,
        ucFormatada,
        competencia,
        cadastro,
        // Guardado cru pra auditoria: a fatura cobra o compensado e credita de volta.
        compradoKwh,
        compradoValor,
        precoEnergiaAtivaComTributos: precoEnergiaAtiva,
        tarifaEnergiaAtiva,
        compensadoKwh,
        creditos: creditosDetalhe,
        consumoMedidorKwh,
        emContingencia: lines.some((l) => /EMITIDO\s+EM\s+CONTING[ÊE]NCIA/i.test(l)),
        avisos,
        lines,
      }),
      ...EMPTY_GRUPO_A_BILL_FIELDS,
    },
  };
}

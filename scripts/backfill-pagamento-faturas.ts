/**
 * Backfill em lote dos pagamentos de fatura da RGE (task PAGAR_FATURA).
 *
 * Lê um CSV com (codigoUc, mesReferencia, valorFatura, dataPagamento, banco)
 * e preenche `pagoEm` + `bancoPagamento` na ConsumerBill correspondente. A task
 * PAGAR_FATURA da agenda passa a DONE automaticamente (status derivado).
 *
 * Antes de atualizar, o script confere se o `valorFatura` informado bate com
 * o `valorTotal` da fatura no banco (tolerância de R$ 0,01). Se não bater,
 * bloqueia a linha e relata — provável sinal de UC/mês trocado.
 *
 * Uso:
 *   npx tsx scripts/backfill-pagamento-faturas.ts --csv <arquivo.csv>           # dry-run
 *   npx tsx scripts/backfill-pagamento-faturas.ts --csv <arquivo.csv> --apply   # aplica
 *   npx tsx scripts/backfill-pagamento-faturas.ts --csv <arquivo.csv> --apply --force  # sobrescreve pagoEm já preenchido
 *
 * Formato do CSV (separador ; ou ,):
 *   codigoUc;mesReferencia;valorFatura;dataPagamento;banco
 *   4003820948;01/01/2025;245,67;15/02/2025;BANRISUL
 *
 * mesReferencia: data no formato DD/MM/AAAA — o dia é ignorado, conta só mês+ano.
 *                Ex.: 01/03/2025 = março/2025. Também aceita MM/AAAA.
 * valorFatura:   número em formato BR (245,67) ou internacional (245.67).
 *                Aceita prefixo "R$ " e separador de milhar (1.289,55).
 * dataPagamento: DD/MM/AAAA ou AAAA-MM-DD.
 * Bancos aceitos: BANRISUL, C6_BANK, ASAAS.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../src/lib/prisma";

const BANCOS_VALIDOS = new Set(["BANRISUL", "C6_BANK", "ASAAS"]);

const APPLY = process.argv.includes("--apply");
const FORCE = process.argv.includes("--force");
const csvIdx = process.argv.indexOf("--csv");
const CSV_PATH = csvIdx >= 0 ? process.argv[csvIdx + 1] : null;

interface Row {
  lineNum: number;
  codigoUc: string;
  mesReferencia: number;
  anoReferencia: number;
  valorFatura: number;
  dataPagamento: Date;
  banco: string;
}

const TOLERANCIA_VALOR = 0.01; // R$ 0,01 — absorve arredondamento

/**
 * Converte string monetária BR ou internacional em número.
 * Aceita: "245,67", "245.67", "R$ 245,67", "1.289,55", "1289.55"
 */
function parseMoney(s: string): number | null {
  const v = s.trim().replace(/^R\$\s*/i, "").trim();
  if (!v) return null;
  // Heurística: se tem ',' provavelmente é BR (1.289,55) — vírgula é decimal, ponto é milhar
  // Se só tem '.', pode ser decimal internacional (1289.55) ou milhar BR (1.289)
  let normalized: string;
  if (v.includes(",")) {
    normalized = v.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = v;
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

interface ParseError {
  lineNum: number;
  raw: string;
  motivo: string;
}

function parseDate(s: string): Date | null {
  const v = s.trim();
  if (!v) return null;
  // DD/MM/AAAA
  const br = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) {
    const [, dd, mm, yyyy] = br;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // AAAA-MM-DD
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const [, yyyy, mm, dd] = iso;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Extrai mês+ano de uma string no formato DD/MM/AAAA ou MM/AAAA.
 * O dia é ignorado — só interessam mês e ano (referência da fatura).
 */
function parseMesAno(s: string): { mes: number; ano: number } | null {
  const v = s.trim();
  if (!v) return null;
  // DD/MM/AAAA
  const full = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (full) {
    const mes = Number(full[2]);
    const ano = Number(full[3]);
    if (mes >= 1 && mes <= 12 && ano >= 2020 && ano <= 2030) return { mes, ano };
    return null;
  }
  // MM/AAAA
  const short = v.match(/^(\d{1,2})\/(\d{4})$/);
  if (short) {
    const mes = Number(short[1]);
    const ano = Number(short[2]);
    if (mes >= 1 && mes <= 12 && ano >= 2020 && ano <= 2030) return { mes, ano };
    return null;
  }
  return null;
}

function detectDelimiter(headerLine: string): string {
  const semi = (headerLine.match(/;/g) || []).length;
  const comma = (headerLine.match(/,/g) || []).length;
  return semi >= comma ? ";" : ",";
}

function parseCsv(content: string): { rows: Row[]; errors: ParseError[] } {
  const rows: Row[] = [];
  const errors: ParseError[] = [];

  const lines = content.replace(/^﻿/, "").split(/\r?\n/);
  if (lines.length === 0) return { rows, errors };

  const delim = detectDelimiter(lines[0]);
  const header = lines[0].split(delim).map((s) => s.trim().toLowerCase());
  const idx = {
    codigoUc: header.indexOf("codigouc"),
    mesReferencia: header.indexOf("mesreferencia"),
    valorFatura: header.indexOf("valorfatura"),
    data: header.indexOf("datapagamento"),
    banco: header.indexOf("banco"),
  };
  const faltando = Object.entries(idx)
    .filter(([, v]) => v < 0)
    .map(([k]) => k);
  if (faltando.length > 0) {
    throw new Error(`Cabeçalho do CSV inválido. Colunas faltando: ${faltando.join(", ")}. Esperado: codigoUc${delim}mesReferencia${delim}valorFatura${delim}dataPagamento${delim}banco`);
  }

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    const cols = raw.split(delim).map((s) => s.trim());
    const lineNum = i + 1;

    const codigoUc = cols[idx.codigoUc];
    const mesAno = parseMesAno(cols[idx.mesReferencia]);
    const valor = parseMoney(cols[idx.valorFatura]);
    const data = parseDate(cols[idx.data]);
    const banco = (cols[idx.banco] || "").toUpperCase();

    if (!codigoUc) {
      errors.push({ lineNum, raw, motivo: "codigoUc vazio" });
      continue;
    }
    if (!mesAno) {
      errors.push({ lineNum, raw, motivo: `mesReferencia inválido (${cols[idx.mesReferencia]}) — use DD/MM/AAAA (ex.: 01/03/2025) ou MM/AAAA` });
      continue;
    }
    if (valor === null || valor <= 0) {
      errors.push({ lineNum, raw, motivo: `valorFatura inválido (${cols[idx.valorFatura]}) — use BR (245,67) ou internacional (245.67)` });
      continue;
    }
    if (!data) {
      errors.push({ lineNum, raw, motivo: `dataPagamento inválida (${cols[idx.data]}) — use DD/MM/AAAA ou AAAA-MM-DD` });
      continue;
    }
    if (!BANCOS_VALIDOS.has(banco)) {
      errors.push({ lineNum, raw, motivo: `banco inválido (${cols[idx.banco]}) — use BANRISUL, C6_BANK ou ASAAS` });
      continue;
    }

    rows.push({
      lineNum,
      codigoUc,
      mesReferencia: mesAno.mes,
      anoReferencia: mesAno.ano,
      valorFatura: valor,
      dataPagamento: data,
      banco,
    });
  }

  return { rows, errors };
}

async function main() {
  if (!CSV_PATH) {
    console.error("ERRO: passe --csv <caminho-do-arquivo.csv>");
    console.error("Exemplo: npx tsx scripts/backfill-pagamento-faturas.ts --csv scripts/backfill-pagamento-faturas-template.csv");
    process.exit(1);
  }

  const absPath = resolve(CSV_PATH);
  console.log(`CSV: ${absPath}`);
  console.log(`Modo: ${APPLY ? "APPLY" : "DRY-RUN"}${FORCE ? " (--force: sobrescreve pagoEm)" : ""}\n`);

  const content = readFileSync(absPath, "utf8");
  const { rows, errors: parseErrors } = parseCsv(content);

  console.log(`Linhas válidas no CSV: ${rows.length}`);
  if (parseErrors.length > 0) {
    console.log(`Linhas com erro de formato: ${parseErrors.length}`);
    for (const e of parseErrors) {
      console.log(`  Linha ${e.lineNum}: ${e.motivo}`);
    }
    console.log("");
  }

  let atualizadas = 0;
  let jaPagas = 0;
  let semFatura = 0;
  let semUc = 0;
  let valorDivergente = 0;
  let semValorNoBanco = 0;
  const issues: string[] = [];

  for (const r of rows) {
    const uc = await prisma.consumerUnit.findUnique({
      where: { codigoUc: r.codigoUc },
      select: { id: true, nome: true },
    });
    if (!uc) {
      semUc++;
      issues.push(`Linha ${r.lineNum}: UC ${r.codigoUc} não encontrada`);
      continue;
    }

    const bill = await prisma.consumerBill.findFirst({
      where: {
        consumerUnitId: uc.id,
        mesReferencia: r.mesReferencia,
        anoReferencia: r.anoReferencia,
      },
      select: { id: true, pagoEm: true, bancoPagamento: true, valorTotal: true, vencimento: true },
    });

    if (!bill) {
      semFatura++;
      issues.push(`Linha ${r.lineNum}: UC ${r.codigoUc} sem fatura ${String(r.mesReferencia).padStart(2, "0")}/${r.anoReferencia}`);
      continue;
    }

    // Conferência do valor — bloqueia se diferente (provável UC/mês trocado).
    if (bill.valorTotal == null) {
      semValorNoBanco++;
      issues.push(`Linha ${r.lineNum}: UC ${r.codigoUc} ${String(r.mesReferencia).padStart(2, "0")}/${r.anoReferencia} sem valorTotal no banco — não dá pra conferir contra R$ ${r.valorFatura.toFixed(2).replace(".", ",")}`);
      continue;
    }
    const diff = Math.abs(bill.valorTotal - r.valorFatura);
    if (diff > TOLERANCIA_VALOR) {
      valorDivergente++;
      issues.push(
        `Linha ${r.lineNum}: UC ${r.codigoUc} ${String(r.mesReferencia).padStart(2, "0")}/${r.anoReferencia} — valor no CSV R$ ${r.valorFatura.toFixed(2).replace(".", ",")} ≠ valor no banco R$ ${bill.valorTotal.toFixed(2).replace(".", ",")} (diff R$ ${diff.toFixed(2).replace(".", ",")}) — confira UC/mês`,
      );
      continue;
    }

    if (bill.pagoEm && !FORCE) {
      jaPagas++;
      const dataExistente = bill.pagoEm.toLocaleDateString("pt-BR");
      issues.push(`Linha ${r.lineNum}: UC ${r.codigoUc} ${String(r.mesReferencia).padStart(2, "0")}/${r.anoReferencia} já marcada paga em ${dataExistente} (${bill.bancoPagamento ?? "?"}) — use --force para sobrescrever`);
      continue;
    }

    if (APPLY) {
      await prisma.consumerBill.update({
        where: { id: bill.id },
        data: {
          pagoEm: r.dataPagamento,
          bancoPagamento: r.banco,
          origemPagamento: "BACKUP LUMI",
        },
      });
    }
    atualizadas++;
    console.log(
      `${APPLY ? "✓" : "›"} UC ${r.codigoUc} (${uc.nome ?? "—"}) ${String(r.mesReferencia).padStart(2, "0")}/${r.anoReferencia} → ${r.dataPagamento.toLocaleDateString("pt-BR")} ${r.banco}`,
    );
  }

  console.log("\n─── Resumo ───────────────────────────────");
  console.log(`Total no CSV:        ${rows.length + parseErrors.length}`);
  console.log(`Erros de formato:    ${parseErrors.length}`);
  console.log(`UC não encontrada:   ${semUc}`);
  console.log(`Fatura não achada:   ${semFatura}`);
  console.log(`Valor divergente:    ${valorDivergente}`);
  console.log(`Sem valor no banco:  ${semValorNoBanco}`);
  console.log(`Já pagas (pulada):   ${jaPagas}`);
  console.log(`${APPLY ? "Atualizadas:         " : "A atualizar:         "}${atualizadas}`);

  if (issues.length > 0) {
    console.log("\n─── Pendências ───────────────────────────");
    for (const i of issues) console.log(`  ${i}`);
  }

  if (!APPLY && atualizadas > 0) {
    console.log("\n(Dry-run) Para aplicar, rode novamente com --apply");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

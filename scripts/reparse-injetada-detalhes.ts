/**
 * Re-extrai `injetadaDetalhes` de ConsumerBills problemáticos a partir do
 * `rawJson.lines` salvo. Usa a lógica corrigida (acumula linhas com mesmo
 * mesOrigem ao invés de sobrescrever).
 *
 * Uso:
 *   npx tsx scripts/reparse-injetada-detalhes.ts                    (dry-run, todas com PARSER_INCOMPLETO)
 *   npx tsx scripts/reparse-injetada-detalhes.ts --apply
 *   npx tsx scripts/reparse-injetada-detalhes.ts --plant <id>       (filtra)
 */
import { prisma } from "../src/lib/prisma";

const APPLY = process.argv.includes("--apply");
const plantArgIdx = process.argv.indexOf("--plant");
const PLANT_FILTER = plantArgIdx >= 0 ? process.argv[plantArgIdx + 1] : null;

function parseNumBR(s: string | null | undefined): number | null {
  if (s == null) return null;
  // "1.234,56" → 1234.56;  "590,8710" → 590.871;  "200,25-" → -200.25
  const trimmed = s.trim();
  const negSuffix = trimmed.endsWith("-");
  const cleaned = (negSuffix ? trimmed.slice(0, -1) : trimmed)
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return negSuffix ? -n : n;
}

function extractMesOrigem(s: string): string | null {
  const m = s.toUpperCase().match(/([A-Z]{3})\/(\d{2}(?:\d{2})?)/);
  if (!m) return null;
  const mes = m[1];
  const ano = m[2].length === 4 ? m[2].slice(-2) : m[2];
  return `${mes}/${ano}`;
}

function normDesc(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

interface InjEntry {
  mesOrigem: string;
  teKwh: number | null;
  teValor: number | null;
  tusdKwh: number | null;
  tusdValor: number | null;
}

/** Reextrai detalhes a partir das linhas salvas. */
function reparse(lines: string[]): InjEntry[] {
  const map = new Map<string, InjEntry>();
  for (const line of lines) {
    const d = normDesc(line);
    const isInj = d.includes("energ") && d.includes("inj");
    if (!isInj) continue;
    const isTusd = d.includes("tusd");
    const isTe = !isTusd && (d.includes(" te ") || d.endsWith(" te") || d.includes("- te") || d.includes("-te"));

    // Pega os números da linha. Format típico:
    // "Energ Atv Inj. oUC mPT - TE MAR/25 kWh 590,8710 0,30445000 0,38280776 226,19- ..."
    const nums = line.match(/-?[\d.]+,\d+-?/g) ?? [];
    const qtd = parseNumBR(nums[0] ?? null);
    const valorTotal = parseNumBR(nums[3] ?? null);

    const origem = extractMesOrigem(line) ?? "SEM_ORIGEM";
    const entry = map.get(origem) ?? {
      mesOrigem: origem,
      teKwh: null, teValor: null, tusdKwh: null, tusdValor: null,
    };

    if (isTusd) {
      entry.tusdKwh = (entry.tusdKwh ?? 0) + (qtd ?? 0);
      entry.tusdValor = (entry.tusdValor ?? 0) + (valorTotal ?? 0);
    } else if (isTe) {
      entry.teKwh = (entry.teKwh ?? 0) + (qtd ?? 0);
      entry.teValor = (entry.teValor ?? 0) + (valorTotal ?? 0);
    }
    map.set(origem, entry);
  }
  return Array.from(map.values());
}

async function main() {
  const where: Record<string, unknown> = {};
  if (PLANT_FILTER) {
    // Filtra via investorPayables que sejam dessa plant
    const ids = await prisma.investorPayable.findMany({
      where: {
        plantId: PLANT_FILTER,
        observacoes: { contains: "PARSER_INCOMPLETO" },
        consumerBillId: { not: null },
      },
      select: { consumerBillId: true },
    });
    where.id = { in: ids.map(i => i.consumerBillId).filter((x): x is string => !!x) };
  } else {
    // Todas as bills referenciadas por payables com PARSER_INCOMPLETO
    const ids = await prisma.investorPayable.findMany({
      where: {
        observacoes: { contains: "PARSER_INCOMPLETO" },
        consumerBillId: { not: null },
      },
      select: { consumerBillId: true },
    });
    where.id = { in: ids.map(i => i.consumerBillId).filter((x): x is string => !!x) };
  }

  const bills = await prisma.consumerBill.findMany({
    where,
    select: {
      id: true,
      consumerUnit: { select: { codigoUc: true } },
      anoReferencia: true,
      mesReferencia: true,
      energiaCompensada: true,
      injetadaDetalhes: true,
      rawJson: true,
    },
  });

  console.log(`ConsumerBills a re-processar: ${bills.length}\n`);

  for (const b of bills) {
    let raw: { lines?: string[] } = {};
    try { raw = JSON.parse(b.rawJson ?? "{}"); } catch {}
    const lines = raw.lines ?? [];
    const novosDetalhes = reparse(lines);
    const sumNovo = novosDetalhes.reduce((s, d) => s + Math.abs(d.teKwh ?? d.tusdKwh ?? 0), 0);
    const energiaComp = b.energiaCompensada ?? 0;
    const ok = Math.abs(sumNovo - energiaComp) < 1.0;

    console.log(
      `${b.consumerUnit?.codigoUc} ${b.anoReferencia}-${String(b.mesReferencia).padStart(2, "0")}  ` +
      `comp=${energiaComp}  novo_sum=${sumNovo.toFixed(2)}  ${ok ? "✓ bate" : "✗ AINDA NÃO BATE"}`,
    );
    for (const d of novosDetalhes) {
      console.log(
        `  ${d.mesOrigem}  TE:${d.teKwh?.toFixed(2)}  TUSD:${d.tusdKwh?.toFixed(2)}`,
      );
    }

    if (APPLY && ok) {
      await prisma.consumerBill.update({
        where: { id: b.id },
        data: { injetadaDetalhes: JSON.stringify(novosDetalhes) },
      });
      console.log(`  → atualizado.`);
    }
    console.log("");
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

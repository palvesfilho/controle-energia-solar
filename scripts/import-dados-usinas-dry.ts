import ExcelJS from "exceljs";
import { prisma } from "../src/lib/prisma";

function normalize(s: string | null | undefined): string {
  return (s ?? "")
    .toString()
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function asNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function asDate(v: unknown): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

async function main() {
  const xlsxPath = "C:/Users/thoma/Downloads/DADOS USINAS.xlsx";
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsxPath);
  const ws = wb.getWorksheet("Usinas");
  if (!ws) throw new Error("Aba 'Usinas' nao encontrada");

  interface Row {
    nome: string;
    potencia: number | null;
    dataInstalacao: Date | null;
    investimento: number | null;
    geracaoAnualEsperada: number | null;
    cep: string | null;
    latitude: number | null;
    longitude: number | null;
    bairro: string | null;
  }

  const rows: Row[] = [];
  for (let i = 2; i <= ws.rowCount; i++) {
    const r = ws.getRow(i);
    const nome = normalize(r.getCell(1).value as string);
    if (!nome) continue;
    rows.push({
      nome,
      potencia: asNumber(r.getCell(2).value),
      dataInstalacao: asDate(r.getCell(3).value),
      investimento: asNumber(r.getCell(4).value),
      geracaoAnualEsperada: asNumber(r.getCell(5).value),
      cep: (r.getCell(7).value as string | null)?.toString().trim() || null,
      latitude: asNumber(r.getCell(8).value),
      longitude: asNumber(r.getCell(9).value),
      bairro: (r.getCell(10).value as string | null)?.toString().trim() || null,
    });
  }

  console.log(`Planilha: ${rows.length} linhas com nome`);

  const dbClients = await prisma.brasilSolarClient.findMany({
    select: { id: true, nome: true },
  });
  console.log(`Banco: ${dbClients.length} BrasilSolarClient ativos/inativos`);

  const byNome = new Map<string, string[]>();
  for (const c of dbClients) {
    const key = normalize(c.nome);
    const arr = byNome.get(key) ?? [];
    arr.push(c.id);
    byNome.set(key, arr);
  }

  let matched = 0, unmatched = 0, dupNomes = 0;
  const unmatchedSamples: string[] = [];
  for (const row of rows) {
    const ids = byNome.get(row.nome);
    if (!ids) {
      unmatched++;
      if (unmatchedSamples.length < 10) unmatchedSamples.push(row.nome);
    } else if (ids.length > 1) {
      dupNomes++;
    } else {
      matched++;
    }
  }

  console.log("\n=== Matching por nome (normalizado) ===");
  console.log("Matched (1:1):   ", matched);
  console.log("Duplicados no DB:", dupNomes);
  console.log("Nao encontrados: ", unmatched);
  console.log("\nExemplos nao encontrados (planilha sem correspondente no DB):");
  unmatchedSamples.forEach((n) => console.log("  -", n));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

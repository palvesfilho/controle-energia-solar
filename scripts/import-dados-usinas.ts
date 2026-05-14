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

function asString(v: unknown): string | null {
  if (v == null) return null;
  const s = v.toString().trim();
  return s || null;
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
    geracaoContrato: number | null;
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
      geracaoContrato: asNumber(r.getCell(6).value),
      cep: asString(r.getCell(7).value),
      latitude: asNumber(r.getCell(8).value),
      longitude: asNumber(r.getCell(9).value),
      bairro: asString(r.getCell(10).value),
    });
  }

  console.log(`Planilha: ${rows.length} linhas com nome`);

  const dbClients = await prisma.brasilSolarClient.findMany({
    select: { id: true, nome: true },
  });

  const byNome = new Map<string, string[]>();
  for (const c of dbClients) {
    const key = normalize(c.nome);
    const arr = byNome.get(key) ?? [];
    arr.push(c.id);
    byNome.set(key, arr);
  }

  let updated = 0;
  let duplicates = 0;
  let notFound = 0;
  const notFoundSamples: string[] = [];
  const duplicateSamples: string[] = [];

  for (const row of rows) {
    const ids = byNome.get(row.nome);
    if (!ids) {
      notFound++;
      if (notFoundSamples.length < 20) notFoundSamples.push(row.nome);
      continue;
    }
    if (ids.length > 1) {
      duplicates++;
      if (duplicateSamples.length < 20) duplicateSamples.push(row.nome);
      continue;
    }

    await prisma.brasilSolarClient.update({
      where: { id: ids[0] },
      data: {
        potenciaInstalada: row.potencia,
        dataInstalacao: row.dataInstalacao,
        investimento: row.investimento,
        geracaoAnualEsperada: row.geracaoAnualEsperada,
        geracaoContrato: row.geracaoContrato,
        cep: row.cep,
        latitude: row.latitude,
        longitude: row.longitude,
        bairro: row.bairro,
      },
    });
    updated++;
    if (updated % 100 === 0) console.log(`  ${updated} atualizados...`);
  }

  console.log("\n=== Resultado ===");
  console.log("Atualizados:       ", updated);
  console.log("Duplicados (skip): ", duplicates);
  console.log("Nao encontrados:   ", notFound);

  if (duplicateSamples.length > 0) {
    console.log("\nNomes duplicados no DB (nao atualizados):");
    duplicateSamples.forEach((n) => console.log("  -", n));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
